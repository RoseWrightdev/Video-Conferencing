package session

import (
	"container/list"
	"context"
	"log/slog"
	"sync"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/pkg/sfu"
	"google.golang.org/protobuf/proto"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

type Room struct {
	ID                   RoomIdType
	mu                   sync.RWMutex
	chatHistory          *list.List
	maxChatHistoryLength int

	hosts        map[ClientIdType]*Client
	participants map[ClientIdType]*Client
	waiting      map[ClientIdType]*Client

	waitingDrawOrderStack *list.List
	clientDrawOrderQueue  *list.List
	handDrawOrderQueue    *list.List

	raisingHand   map[ClientIdType]*Client
	sharingScreen map[ClientIdType]*Client
	unmuted       map[ClientIdType]*Client
	cameraOn      map[ClientIdType]*Client

	onEmpty func(RoomIdType)
	bus     BusService
	sfu     *sfu.SFUClient
}

func NewRoom(id RoomIdType, onEmptyCallback func(RoomIdType), busService BusService, sfuClient *sfu.SFUClient) *Room {
	room := &Room{
		ID:                   id,
		chatHistory:          list.New(),
		maxChatHistoryLength: 100,

		hosts:        make(map[ClientIdType]*Client),
		participants: make(map[ClientIdType]*Client),
		waiting:      make(map[ClientIdType]*Client),

		waitingDrawOrderStack: list.New(),
		clientDrawOrderQueue:  list.New(),
		handDrawOrderQueue:    list.New(),

		raisingHand:   make(map[ClientIdType]*Client),
		sharingScreen: make(map[ClientIdType]*Client),
		unmuted:       make(map[ClientIdType]*Client),
		cameraOn:      make(map[ClientIdType]*Client),

		onEmpty: onEmptyCallback,
		bus:     busService,
		sfu:     sfuClient,
	}

	if busService != nil {
		room.subscribeToRedis()
	}

	return room
}

// isRoomEmpty checks if the room is vacant
func (r *Room) isRoomEmpty() bool {
	return len(r.hosts) == 0 &&
		len(r.participants) == 0 &&
		len(r.sharingScreen) == 0
}

func (r *Room) handleClientConnect(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Check for duplicate connections with same client ID
	// If the same user is connecting again (refresh, duplicate tab, etc),
	// close the old connection before adding the new one
	var existingClient *Client
	if c, exists := r.hosts[client.ID]; exists {
		existingClient = c
	} else if c, exists := r.participants[client.ID]; exists {
		existingClient = c
	} else if c, exists := r.waiting[client.ID]; exists {
		existingClient = c
	}

	if existingClient != nil {
		slog.Info("Duplicate connection detected, disconnecting old client",
			"room", r.ID,
			"clientId", client.ID,
			"oldRole", existingClient.Role,
		)
		// Synchronously disconnect the old client to prevent race conditions
		// This ensures all cleanup happens before we add the new connection
		r.disconnectClient(context.Background(), existingClient)
		// Note: We don't broadcast here - we'll broadcast after adding the new client
	}

	// Logic for first user becoming host
	if len(r.participants) == 0 && len(r.hosts) == 0 {
		slog.Info("First user joined, making them host.", "room", r.ID, "ClientId", client.ID)
		r.addHost(context.Background(), client)
		metrics.RoomParticipants.WithLabelValues(string(r.ID)).Set(float64(len(r.hosts) + len(r.participants)))
		r.sendRoomStateToClient(client)
		return
	}
	r.addWaiting(client)
	r.sendRoomStateToClient(client)

	// Broadcast the update to existing Hosts/Participants so they see the new waiting user
	// We call this synchronously because we hold the lock, ensuring state consistency.
	// Note: This sends state to everyone (hosts + participants).
	r.BroadcastRoomState(context.Background())
}

func (r *Room) handleClientDisconnect(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	ctx := context.Background()
	r.disconnectClient(ctx, client)
	slog.Info("Client disconnected", "room", r.ID, "ClientId", client.ID)

	totalParticipants := len(r.hosts) + len(r.participants)
	if totalParticipants > 0 {
		metrics.RoomParticipants.WithLabelValues(string(r.ID)).Set(float64(totalParticipants))
	} else {
		metrics.RoomParticipants.DeleteLabelValues(string(r.ID))
	}

	r.BroadcastRoomState(ctx)

	if r.isRoomEmpty() {
		if r.onEmpty == nil {
			return
		}
		go r.onEmpty(r.ID)
	}
}

// Router delegates to handlers.go
func (r *Room) router(ctx context.Context, client *Client, msg *pb.WebSocketMessage) {
	switch payload := msg.Payload.(type) {
	case *pb.WebSocketMessage_Join:
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

// Broadcast sends a message to everyone.
func (r *Room) Broadcast(msg *pb.WebSocketMessage) {
	data, err := proto.Marshal(msg)
	if err != nil {
		slog.Error("Failed to marshal proto for broadcast", "error", err)
		return
	}

	sendToMap := func(clients map[ClientIdType]*Client) {
		for _, client := range clients {
			select {
			case client.send <- data:
			default:
				slog.Warn("Client channel full", "clientId", client.ID)
			}
		}
	}

	sendToMap(r.hosts)
	sendToMap(r.participants)

	// Send to Redis (Stubbed in Dev Mode)
	go r.publishToRedis(context.Background(), msg)
}

func (r *Room) BroadcastRoomState(ctx context.Context) {
	roomState := r.BuildRoomStateProto(ctx)
	slog.Info("Broadcasting RoomState", "room", r.ID, "hosts", len(r.hosts), "waiting", len(r.waiting))
	r.Broadcast(&pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_RoomState{
			RoomState: roomState,
		},
	})
}
