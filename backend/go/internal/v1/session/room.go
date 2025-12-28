package session

import (
	"container/list"
	"context"
	"log/slog"
	"sync"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

// SFUProvider defines the interface for SFU operations, allowing for easier testing and mocking.
type SFUProvider interface {
	CreateSession(ctx context.Context, uid string, roomID string) (*pb.CreateSessionResponse, error)
	HandleSignal(ctx context.Context, uid string, roomID string, signal *pb.SignalRequest) (*pb.SignalResponse, error)
	DeleteSession(ctx context.Context, uid string, roomID string) error
	ListenEvents(ctx context.Context, uid string, roomID string) (pb.SfuService_ListenEventsClient, error)
}

type Room struct {
	ID                   RoomIdType
	mu                   sync.RWMutex
	chatHistory          *list.List
	maxChatHistoryLength int

	ownerID ClientIdType // [NEW] Persist the room creator to prevent host stealing

	clients map[ClientIdType]*Client // Single source of truth

	waitingDrawOrderStack *list.List
	clientDrawOrderQueue  *list.List
	handDrawOrderQueue    *list.List

	onEmpty func(RoomIdType)
	bus     BusService
	sfu     SFUProvider
}

func NewRoom(id RoomIdType, onEmptyCallback func(RoomIdType), busService BusService, sfuClient SFUProvider) *Room {
	room := &Room{
		ID:                   id,
		chatHistory:          list.New(),
		maxChatHistoryLength: 100,

		clients: make(map[ClientIdType]*Client),

		waitingDrawOrderStack: list.New(),
		clientDrawOrderQueue:  list.New(),
		handDrawOrderQueue:    list.New(),

		onEmpty: onEmptyCallback,
		bus:     busService,
		sfu:     sfuClient,
	}

	if busService != nil {
		room.subscribeToRedis()
	}

	return room
}

func (r *Room) BuildRoomStateProto(ctx context.Context) *pb.RoomStateEvent {
	var pbParticipants []*pb.ParticipantInfo
	var pbWaitingUsers []*pb.ParticipantInfo

	// Helper to convert Client to Proto
	makeProto := func(c *Client) *pb.ParticipantInfo {
		return &pb.ParticipantInfo{
			Id:              string(c.ID),
			DisplayName:     string(c.DisplayName),
			IsHost:          c.Role == RoleTypeHost,
			IsAudioEnabled:  c.IsAudioEnabled,
			IsVideoEnabled:  c.IsVideoEnabled,
			IsScreenSharing: c.IsScreenSharing,
			IsHandRaised:    c.IsHandRaised,
		}
	}

	// Iterate once over consolidated map
	for _, c := range r.clients {
		switch c.Role {
		case RoleTypeHost, RoleTypeParticipant:
			pbParticipants = append(pbParticipants, makeProto(c))
		case RoleTypeWaiting:
			pbWaitingUsers = append(pbWaitingUsers, makeProto(c))
		}
	}

	return &pb.RoomStateEvent{
		Participants: pbParticipants,
		WaitingUsers: pbWaitingUsers,
	}
}

// isRoomEmptyLocked checks if the room is vacant (no hosts or participants) without acquiring a lock.
// Caller must hold r.mu.RLock() or r.mu.Lock().
func (r *Room) isRoomEmptyLocked() bool {
	// Simple optimization: if map is huge, this might be slow, but usually < 100 clients.
	// We want to know if there are any ACTIVE users (Hosts/Participants).
	for _, c := range r.clients {
		if c.Role == RoleTypeHost || c.Role == RoleTypeParticipant {
			return false
		}
	}
	return true
}

// isRoomEmpty checks if the room is vacant (no hosts or participants)
func (r *Room) isRoomEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.isRoomEmptyLocked()
}

func (r *Room) handleClientConnect(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Check for duplicate connections with same client ID
	// If the same user is connecting again (refresh, duplicate tab, etc),
	// close the old connection before adding the new one
	var existingClient *Client
	var preservedRole RoleType = RoleTypeUnknown

	if c, exists := r.clients[client.ID]; exists {
		existingClient = c
		preservedRole = c.Role
	}

	if existingClient != nil {
		slog.Info("Duplicate connection detected, removing old client",
			"room", r.ID,
			"clientId", client.ID,
			"oldRole", existingClient.Role,
		)
		// Explicitly delete SFU session for the old client before disconnecting
		if r.sfu != nil {
			if err := r.sfu.DeleteSession(context.Background(), string(client.ID), string(r.ID)); err != nil {
				slog.Error("Failed to delete stale SFU session", "error", err)
			}
		}
		// Use sync.Once to ensure channel is only closed once
		// This prevents panic when duplicate connections are cleaned up
		existingClient.closeOnce.Do(func() {
			close(existingClient.send)
			close(existingClient.prioritySend)
		})

		// Synchronously disconnect the old client to prevent race conditions
		r.disconnectClientLocked(context.Background(), existingClient)
	}

	// 1. First Joiner Logic (Owner Assignment)
	// If the room has no owner (freshly created), the first person becomes the Owner.
	if r.ownerID == "" {
		slog.Info("Room has no owner, assigning owner", "room", r.ID, "ownerId", client.ID)
		r.ownerID = client.ID
	}

	// 2. Role Assignment Logic
	// If they are the Owner, they are ALWAYS the host.
	if client.ID == r.ownerID {
		slog.Info("Owner joined, ensuring Host role", "room", r.ID, "clientId", client.ID)
		r.addHostLocked(context.Background(), client)
		r.sendRoomStateToClient(client)
		r.broadcastRoomStateLocked(context.Background())
		return
	}

	// 3. Reconnection Logic (Non-Owners)
	// If they were previously in the room (and not the owner), restore their role.
	if preservedRole != RoleTypeUnknown {
		slog.Info("Restoring previous role", "room", r.ID, "clientId", client.ID, "role", preservedRole)
		switch preservedRole {
		case RoleTypeHost:
			// Should be covered by owner check, but safe fallback
			r.addHostLocked(context.Background(), client)
		case RoleTypeParticipant:
			r.addParticipantLocked(context.Background(), client)
		case RoleTypeWaiting:
			r.addWaitingLocked(client)
		}
		r.sendRoomStateToClient(client)
		r.broadcastRoomStateLocked(context.Background())
		return
	}

	// 4. Default: Waiting Room
	// Everyone else goes to waiting room
	r.addWaitingLocked(client)
	r.sendRoomStateToClient(client)

	// Broadcast the update to existing Hosts/Participants so they see the new waiting user
	// We call this synchronously because we hold the lock, ensuring state consistency.
	// Note: This sends state to everyone (hosts + participants).
	r.broadcastRoomStateLocked(context.Background())
}

func (r *Room) handleClientDisconnect(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	ctx := context.Background()
	r.disconnectClientLocked(ctx, client)
	slog.Info("Client disconnected", "room", r.ID, "ClientId", client.ID)

	totalParticipants := 0
	for _, c := range r.clients {
		if c.Role == RoleTypeHost || c.Role == RoleTypeParticipant {
			totalParticipants++
		}
	}

	if totalParticipants > 0 {
		metrics.RoomParticipants.WithLabelValues(string(r.ID)).Set(float64(totalParticipants))
	} else {
		metrics.RoomParticipants.DeleteLabelValues(string(r.ID))
	}

	r.broadcastRoomStateLocked(ctx)

	if r.isRoomEmptyLocked() {
		if r.onEmpty == nil {
			return
		}
		go r.onEmpty(r.ID)
	}
}

// Router delegates to handlers.go
func (r *Room) router(ctx context.Context, client *Client, msg *pb.WebSocketMessage) {
	if !validateMessagePayload(msg) {
		slog.Warn("Received message with empty payload", "clientId", client.ID)
		return
	}

	switch payload := msg.Payload.(type) {
	case *pb.WebSocketMessage_Join:
		slog.Info("Handling Join Request", "clientId", client.ID, "role", client.Role)

		if !canClientJoinSFU(client) {
			slog.Warn("Ignored Join request from waiting user", "clientId", client.ID)
			return
		}

		if err := r.CreateSFUSession(ctx, client); err != nil {
			slog.Error("Failed to create SFU session", "error", err)
		}
	case *pb.WebSocketMessage_Signal:
		r.HandleSFUSignal(ctx, client, payload.Signal)
	case *pb.WebSocketMessage_Chat:
		r.HandleChat(ctx, client, payload.Chat)
	case *pb.WebSocketMessage_AdminAction:
		r.HandleAdminAction(ctx, client, payload.AdminAction)
	case *pb.WebSocketMessage_ToggleMedia:
		r.HandleToggleMedia(ctx, client, payload.ToggleMedia)
	case *pb.WebSocketMessage_ToggleHand:
		r.HandleToggleHand(ctx, client, payload.ToggleHand)
	case *pb.WebSocketMessage_ScreenShare:
		r.HandleScreenShare(ctx, client, payload.ScreenShare)
	case *pb.WebSocketMessage_GetRecentChats:
		r.HandleGetRecentChats(ctx, client)
	case *pb.WebSocketMessage_DeleteChat:
		r.HandleDeleteChat(ctx, client, payload.DeleteChat)
	case *pb.WebSocketMessage_RequestScreenSharePermission:
		r.HandleRequestScreenSharePermission(ctx, client)
	default:
		slog.Warn("Unknown message type received", "clientId", client.ID)
	}
}

// --- Helper Functions ---

func (r *Room) sendRoomStateToClient(client *Client) {
	// Assumes caller holds lock (handleClientConnect does)
	roomStateProto := r.BuildRoomStateProto(context.Background())

	client.sendProto(&pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_RoomState{
			RoomState: roomStateProto,
		},
	})
}

func (r *Room) broadcastLocked(msg *pb.WebSocketMessage) {
	// Snapshot targets to avoid iterating while sending if possible, though sending is buffered.
	// Caller MUST hold r.mu (Lock or RLock)
	var targets []*Client
	for _, client := range r.clients {
		if client.Role != RoleTypeWaiting {
			targets = append(targets, client)
		}
	}

	for _, client := range targets {
		client.sendProto(msg)
	}

	// Send to Redis (Stubbed in Dev Mode)
	go r.publishToRedis(context.Background(), msg)
}

// Broadcast sends a message to everyone.
func (r *Room) Broadcast(msg *pb.WebSocketMessage) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	r.broadcastLocked(msg)
}

func (r *Room) broadcastRoomStateLocked(ctx context.Context) {
	// 1. Build the state payload while holding the lock
	roomState := r.BuildRoomStateProto(ctx)

	// 2. Snapshot recipients (Hosts + Participants, exclude Waiting if consistent with old behavior)
	var recipients []*Client
	for _, c := range r.clients {
		if c.Role != RoleTypeWaiting {
			recipients = append(recipients, c)
		}
	}

	slog.Info("Broadcasting RoomState", "room", r.ID, "recipients", len(recipients))

	// 3. Send
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_RoomState{
			RoomState: roomState,
		},
	}

	for _, client := range recipients {
		client.sendProto(msg)
	}
}

func (r *Room) BroadcastRoomState(ctx context.Context) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.broadcastRoomStateLocked(ctx)
}
