package room

import (
	"container/list"
	"context"
	"sync"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/signaling"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

// Room represents a video conferencing room.
type Room struct {
	ID                   types.RoomIDType
	mu                   sync.RWMutex
	chatHistory          *list.List
	maxChatHistoryLength int

	ownerID types.ClientIDType

	clients map[types.ClientIDType]types.ClientInterface

	waitingDrawOrderStack *list.List
	clientDrawOrderQueue  *list.List
	handDrawOrderQueue    *list.List

	onEmpty func(types.RoomIDType)
	bus     types.BusService
	sfu     types.SFUProvider

	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc
}

// GetID returns the room ID.
func (r *Room) GetID() types.RoomIDType {
	return r.ID
}

// CreateSFUSession initializes a new SFU session for a participant.
func (r *Room) CreateSFUSession(ctx context.Context, client types.ClientInterface) error {
	// Use r.ctx to ensure the SFU event listener (spawned inside) is cancelled when Room shuts down
	return signaling.CreateSFUSession(r.ctx, r, client, r.sfu, &r.wg)
}

// HandleSFUSignal forwards a WebRTC signal to the SFU client.
func (r *Room) HandleSFUSignal(ctx context.Context, client types.ClientInterface, signal *pb.SignalRequest) {
	signaling.HandleSFUSignal(ctx, r, client, r.sfu, signal)
}

// Shutdown gracefully closes the room and disconnects all clients.
func (r *Room) Shutdown(ctx context.Context) error {
	r.cancel()

	c := make(chan struct{})
	go func() {
		defer close(c)
		r.wg.Wait()
	}()

	select {
	case <-c:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// NewRoom creates a new Room instance with the given ID and dependencies.
func NewRoom(id types.RoomIDType, onEmptyCallback func(types.RoomIDType), busService types.BusService, sfuClient types.SFUProvider) *Room {
	room := &Room{
		ID:                   id,
		chatHistory:          list.New(),
		maxChatHistoryLength: 100,

		clients: make(map[types.ClientIDType]types.ClientInterface),

		waitingDrawOrderStack: list.New(),
		clientDrawOrderQueue:  list.New(),
		handDrawOrderQueue:    list.New(),

		onEmpty: onEmptyCallback,
		bus:     busService,
		sfu:     sfuClient,
	}
	room.ctx, room.cancel = context.WithCancel(context.Background())

	if busService != nil {
		room.subscribeToRedis()
	}

	return room
}

// BuildRoomStateProto constructs the current state of the room as a protobuf message.
func (r *Room) BuildRoomStateProto(ctx context.Context) *pb.RoomStateEvent {
	var pbParticipants []*pb.ParticipantInfo
	var pbWaitingUsers []*pb.ParticipantInfo

	// Helper to convert Client to Proto
	makeProto := func(c types.ClientInterface) *pb.ParticipantInfo {
		return &pb.ParticipantInfo{
			Id:              string(c.GetID()),
			DisplayName:     string(c.GetDisplayName()),
			IsHost:          c.GetRole() == types.RoleTypeHost,
			IsAudioEnabled:  c.GetIsAudioEnabled(),
			IsVideoEnabled:  c.GetIsVideoEnabled(),
			IsScreenSharing: c.GetIsScreenSharing(),
			IsHandRaised:    c.GetIsHandRaised(),
		}
	}

	// Iterate once over consolidated map
	for _, c := range r.clients {
		switch c.GetRole() {
		case types.RoleTypeHost, types.RoleTypeParticipant:
			pbParticipants = append(pbParticipants, makeProto(c))
		case types.RoleTypeWaiting:
			pbWaitingUsers = append(pbWaitingUsers, makeProto(c))
		}
	}
	return &pb.RoomStateEvent{
		Participants: pbParticipants,
		WaitingUsers: pbWaitingUsers,
	}
}

// GetOwnerID returns the ID of the room owner.
func (r *Room) GetOwnerID() types.ClientIDType {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.ownerID
}

// IsParticipant checks if the given user ID is a participant in the room.
func (r *Room) IsParticipant(id types.ClientIDType) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, exists := r.clients[id]
	return exists
}

// AddHost adds a client as a host to the room.
func (r *Room) AddHost(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addHostLocked(ctx, client)
}

// AddParticipant adds a client as a participant to the room.
func (r *Room) AddParticipant(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addParticipantLocked(ctx, client)
}

// AddWaiting adds a client to the waiting room.
func (r *Room) AddWaiting(client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addWaitingLocked(client)
}

// DisconnectClient removes a client from the room and handles cleanup.
func (r *Room) DisconnectClient(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.disconnectClientLocked(ctx, client)
}

// AddChat adds a chat message to the room's history.
func (r *Room) AddChat(chat types.ChatInfo) {
	r.addChat(chat)
}

// GetRecentChats retrieves the recent chat history of the room.
func (r *Room) GetRecentChats() []types.ChatInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.getRecentChatsLocked()
}

// isRoomEmptyLocked checks if the room is vacant (no hosts or participants) without acquiring a lock.
// Caller must hold r.mu.RLock() or r.mu.Lock().
func (r *Room) isRoomEmptyLocked() bool {
	for _, c := range r.clients {
		if c.GetRole() == types.RoleTypeHost || c.GetRole() == types.RoleTypeParticipant {
			return false
		}
	}
	return true
}

// IsRoomEmpty checks if the room is vacant (no hosts or participants)
func (r *Room) IsRoomEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.isRoomEmptyLocked()
}

func (r *Room) hasHostLocked() bool {
	for _, c := range r.clients {
		if c.GetRole() == types.RoleTypeHost {
			return true
		}
	}
	return false
}

// HasHost checks if there is at least one host in the room.
func (r *Room) HasHost() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.hasHostLocked()
}

// CloseRoom closes the room and disconnects all clients with a reason.
func (r *Room) CloseRoom(reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.closeRoomLocked(reason)
}

func (r *Room) closeRoomLocked(reason string) {
	logging.Info(r.ctx, "Closing room", zap.String("room", string(r.ID)), zap.String("reason", reason))
	r.cancel()

	var targets []types.ClientInterface
	for _, c := range r.clients {
		targets = append(targets, c)
	}

	msg := buildRoomClosedMessage()
	for _, c := range targets {
		c.SendProto(msg)
		c.Disconnect()
	}
}

// HandleClientConnect handles a new client connection logic.
func (r *Room) HandleClientConnect(client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var existingClient types.ClientInterface
	var preservedRole = types.RoleTypeUnknown

	if c, exists := r.clients[client.GetID()]; exists {
		existingClient = c
		preservedRole = c.GetRole()
	}

	if existingClient != nil {
		logging.Info(context.Background(), "Duplicate connection detected, removing old client",
			zap.String("room", string(r.ID)),
			zap.String("clientId", string(client.GetID())),
			zap.String("oldRole", string(existingClient.GetRole())),
		)
		if r.sfu != nil {
			if err := r.sfu.DeleteSession(context.Background(), string(client.GetID()), string(r.ID)); err != nil {
				logging.Error(context.Background(), "Failed to delete stale SFU session", zap.Error(err))
			}
		}

		// Since existingClient is an interface, we can't access closeOnce or channels directly.
		// These should be handled by a Disconnect() method or similar in the interface,
		// but for now, we'll assume the transport layer handles the underlying connection.
		// We'll call disconnectClientLocked which should handle common cleanup.
		r.disconnectClientLocked(context.Background(), existingClient)
	}

	if r.ownerID == "" {
		logging.Info(context.Background(), "Room has no owner, assigning owner", zap.String("room", string(r.ID)), zap.String("ownerId", string(client.GetID())))
		r.ownerID = client.GetID()
	}

	if client.GetID() == r.ownerID {
		logging.Info(context.Background(), "Owner joined, ensuring Host role", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))
		r.addHostLocked(context.Background(), client)
		r.sendRoomStateToClient(client)
		r.broadcastRoomStateLocked(context.Background())
		return
	}

	if preservedRole != types.RoleTypeUnknown {
		logging.Info(context.Background(), "Restoring previous role", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())), zap.String("role", string(preservedRole)))
		switch preservedRole {
		case types.RoleTypeHost:
			r.addHostLocked(context.Background(), client)
		case types.RoleTypeParticipant:
			r.addParticipantLocked(context.Background(), client)
		case types.RoleTypeWaiting:
			r.addWaitingLocked(client)
		}
		r.sendRoomStateToClient(client)
		r.broadcastRoomStateLocked(context.Background())
		return
	}

	r.addWaitingLocked(client)
	r.sendRoomStateToClient(client)
	r.broadcastRoomStateLocked(context.Background())
}

// HandleClientDisconnect handles logic when a client disconnects.
func (r *Room) HandleClientDisconnect(client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()

	ctx := context.Background()
	r.disconnectClientLocked(ctx, client)
	logging.Info(ctx, "Client disconnected", zap.String("room", string(r.ID)), zap.String("ClientId", string(client.GetID())))

	totalParticipants := 0
	for _, c := range r.clients {
		if c.GetRole() == types.RoleTypeHost || c.GetRole() == types.RoleTypeParticipant {
			totalParticipants++
		}
	}

	if totalParticipants > 0 {
		metrics.RoomParticipants.WithLabelValues(string(r.ID)).Set(float64(totalParticipants))
	} else {
		metrics.RoomParticipants.DeleteLabelValues(string(r.ID))
	}

	r.broadcastRoomStateLocked(ctx)

	// Trigger cleanup if room is empty OR has no hosts
	if r.isRoomEmptyLocked() || !r.hasHostLocked() {
		if r.onEmpty != nil {
			go r.onEmpty(r.ID)
		}
	}
}

// Router delegates to handlers.go
func (r *Room) Router(ctx context.Context, client types.ClientInterface, msg *pb.WebSocketMessage) {
	if !validateMessagePayload(msg) {
		logging.Warn(ctx, "Received message with empty payload", zap.String("clientId", string(client.GetID())))
		return
	}

	switch payload := msg.Payload.(type) {
	case *pb.WebSocketMessage_Join:
		logging.Info(ctx, "Handling Join Request", zap.String("clientId", string(client.GetID())), zap.String("role", string(client.GetRole())))

		if !canClientJoinSFU(client) {
			logging.Info(ctx, "Sending JoinResponse to waiting user (no SFU session)", zap.String("clientId", string(client.GetID())))
			client.SendProto(&pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_JoinResponse{
					JoinResponse: &pb.JoinResponse{
						Success:      true,
						UserId:       string(client.GetID()),
						IsHost:       client.GetRole() == types.RoleTypeHost,
						InitialState: r.BuildRoomStateProto(ctx),
					},
				},
			})
			return
		}

		if err := r.CreateSFUSession(ctx, client); err != nil {
			logging.Error(ctx, "Failed to create SFU session", zap.Error(err))
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
		logging.Warn(ctx, "Unknown message type received", zap.String("clientId", string(client.GetID())))
	}
}

// --- Helper Functions ---

func (r *Room) sendRoomStateToClient(client types.ClientInterface) {
	roomStateProto := r.BuildRoomStateProto(context.Background())

	client.SendProto(&pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_RoomState{
			RoomState: roomStateProto,
		},
	})
}

func (r *Room) broadcastLocked(msg *pb.WebSocketMessage) {
	var targets []types.ClientInterface
	for _, client := range r.clients {
		if client.GetRole() != types.RoleTypeWaiting {
			targets = append(targets, client)
		}
	}

	for _, client := range targets {
		client.SendProto(msg)
	}

	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		r.publishToRedis(context.Background(), msg)
	}()
}

// Broadcast sends a message to everyone.
func (r *Room) Broadcast(msg *pb.WebSocketMessage) {
	// Marshal ONCE
	data, err := proto.Marshal(msg)
	if err != nil {
		logging.Error(r.ctx, "Failed to marshal broadcast message", zap.String("room", string(r.ID)), zap.Error(err))
		return
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	// Use existing slice logic, but call SendRaw
	var targets []types.ClientInterface
	for _, client := range r.clients {
		if client.GetRole() != types.RoleTypeWaiting {
			targets = append(targets, client)
		}
	}

	for _, client := range targets {
		client.SendRaw(data)
	}

	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		r.publishToRedis(context.Background(), msg)
	}()
}

func (r *Room) broadcastRoomStateLocked(ctx context.Context) {
	roomState := r.BuildRoomStateProto(ctx)

	var recipients []types.ClientInterface
	for _, c := range r.clients {
		if c.GetRole() != types.RoleTypeWaiting {
			recipients = append(recipients, c)
		}
	}

	logging.Info(ctx, "Broadcasting RoomState", zap.String("room", string(r.ID)), zap.Int("recipients", len(recipients)))

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_RoomState{
			RoomState: roomState,
		},
	}

	for _, client := range recipients {
		client.SendProto(msg)
	}
}

// BroadcastRoomState sends the full room state to all clients.
func (r *Room) BroadcastRoomState(ctx context.Context) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.broadcastRoomStateLocked(ctx)
}
