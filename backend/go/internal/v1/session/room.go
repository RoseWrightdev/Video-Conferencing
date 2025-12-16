package session

import (
	"container/list"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"

	"k8s.io/utils/set"
)

// Room represents a video conference session and manages all associated state.
// Each room maintains participant lists, chat history, permissions, and real-time
// communication channels. Rooms are created dynamically when the first client connects
// and are cleaned up when the last participant leaves.
//
// Concurrency Design:
// Room uses a read-write mutex (sync.RWMutex) to ensure thread-safe access to all state.
// The locking strategy centralizes mutex acquisition in the router method, with all
// other methods assuming the lock is already held. This prevents deadlocks and
// ensures consistent state updates.
//
// State Management:
// The Room maintains several categories of state:
//   - Role-based maps: hosts, participants, waiting users
//   - Activity states: raising hand, screen sharing, audio/video status
//   - Ordering queues: draw order for UI positioning, hand-raise queue for fairness
//   - Chat history: persistent message storage with configurable limits
//
// Memory Management:
// The room includes automatic cleanup mechanisms:
//   - Chat history limits prevent unbounded growth
//   - Client disconnection removes all references
//   - Empty room detection triggers cleanup callbacks

type Room struct {
	// --- Core Identity and Configuration ---
	ID                   RoomIdType   // Unique identifier for this room
	mu                   sync.RWMutex // Read-write mutex for thread safety
	chatHistory          *list.List   // Chronologically ordered chat messages
	maxChatHistoryLength int          // Maximum number of chat messages to retain

	// --- Role-Based Client Management ---
	// These maps define the permission hierarchy within the room
	hosts        map[ClientIdType]*Client // Clients with administrative privileges
	participants map[ClientIdType]*Client // Active meeting participants
	waiting      map[ClientIdType]*Client // Clients awaiting host approval

	// --- User Interface Draw Order Management ---
	// These data structures control the visual ordering of clients in the UI

	// Waiting room uses LIFO (Last In, First Out) ordering - newest requests appear first
	// This helps hosts notice new join requests immediately
	waitingDrawOrderStack *list.List

	// Main participant view uses queue ordering for consistent positioning
	// Participants are added to the back and can be moved to front when speaking
	clientDrawOrderQueue *list.List // stores *Client elements for main view

	// Hand-raise queue uses FIFO (First In, First Out) for fairness
	// Ensures participants get speaking opportunities in the order they requested
	handDrawOrderQueue *list.List // stores *Client elements for hand-raising order

	// --- Real-Time Activity State ---
	// These maps track current participant activities for UI indicators and permissions
	raisingHand   map[ClientIdType]*Client // Participants requesting to speak
	sharingScreen map[ClientIdType]*Client // Participants currently sharing their screen
	unmuted       map[ClientIdType]*Client // Participants with microphone enabled
	cameraOn      map[ClientIdType]*Client // Participants with camera enabled

	// --- Lifecycle Management ---
	// Callback function invoked when the room becomes empty to trigger cleanup
	onEmpty func(RoomIdType)

	// --- Distibuted Bus/Sub ---
	bus BusService
}

// NewRoom creates and returns a new Room instance with the specified ID and an onEmpty callback.
// The Room is initialized with empty participant, waiting room, hands raised, hosts, and sharingScreen maps.
// The onEmptyCallback is called when the room becomes empty, preventing a memory leak.
//
// Parameters:
//   - id: the unique identifier for the room.
//   - onEmptyCallback: a function to be called when the room becomes empty.
//   - busService: optional Redis pub/sub service for distributed messaging (nil for single-instance mode)
//
// Returns:
//   - A pointer to the newly created Room.
func NewRoom(id RoomIdType, onEmptyCallback func(RoomIdType), busService BusService) *Room {
	room := &Room{
		ID:                   id,
		chatHistory:          list.New(),
		maxChatHistoryLength: 100, // Default to 100 messages

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
	}

	// Set up Redis subscription for cross-pod messaging if bus is available
	if busService != nil {
		room.subscribeToRedis()
	}

	return room
}

// handleClientConnect manages the initial connection logic when a client joins the room.
// This method implements the room's admission policy and determines the client's initial role.
//
// Admission Logic:
//   - First client to join an empty room automatically becomes the host
//   - All subsequent clients are placed in the waiting room for host approval
//   - This ensures every room has at least one administrator
//
// Concurrency Safety:
// This method acquires the room's write lock to ensure thread-safe state updates
// during the critical client admission process.
//
// Role Assignment:
// The first client receives immediate host privileges, allowing them to:
//   - Accept or deny future participants
//   - Manage screen sharing permissions
//   - Administrative control over room settings
//
// Waiting Room Behavior:
// Non-host clients are placed in waiting status where they:
//   - Cannot participate in the main meeting
//   - Wait for host approval to join
//   - May be denied access by the host
//
// Parameters:
//   - client: The newly connected client to be processed
func (r *Room) handleClientConnect(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// First user to join becomes the host.
	// Check local state first (fast path)
	if len(r.participants) == 0 && len(r.hosts) == 0 {
		// If Redis is available, verify the room is truly empty across all pods
		// This prevents "split-brain" where a user on a new pod gets promoted while
		// hosts exist on other pods
		if r.bus != nil {
			ctx := context.Background()
			hostsKey := fmt.Sprintf("room:%s:hosts", r.ID)
			participantsKey := fmt.Sprintf("room:%s:participants", r.ID)

			// Check if any hosts exist in Redis
			hostMembers, err := r.bus.SetMembers(ctx, hostsKey)
			if err != nil {
				slog.Error("Failed to check Redis hosts for split-brain prevention", "room", r.ID, "error", err)
				// Fall through to local-only decision on error
			} else if len(hostMembers) > 0 {
				// Hosts exist on other pods - do not promote, add to waiting
				slog.Info("User joining room with existing hosts on other pods", "room", r.ID, "ClientId", client.ID, "redisHosts", len(hostMembers))
				r.addWaiting(client)
				r.sendRoomStateToClient(client)
				return
			}

			// Check if any participants exist in Redis
			participantMembers, err := r.bus.SetMembers(ctx, participantsKey)
			if err != nil {
				slog.Error("Failed to check Redis participants for split-brain prevention", "room", r.ID, "error", err)
				// Fall through to local-only decision on error
			} else if len(participantMembers) > 0 {
				// Participants exist on other pods - do not promote, add to waiting
				slog.Info("User joining room with existing participants on other pods", "room", r.ID, "ClientId", client.ID, "redisParticipants", len(participantMembers))
				r.addWaiting(client)
				r.sendRoomStateToClient(client)
				return
			}

			// Both local memory and Redis confirm room is empty - safe to promote
		}

		slog.Info("First user joined, making them host.", "room", r.ID, "ClientId", client.ID)
		ctx := context.Background()
		r.addHost(ctx, client)

		// Metrics: Update participant count (hosts count as participants)
		metrics.RoomParticipants.WithLabelValues(string(r.ID)).Set(float64(len(r.hosts) + len(r.participants)))

		// Broadcast initial room state to the new host
		r.sendRoomStateToClient(client)
		return
	}
	r.addWaiting(client)
	// Send current room state to the waiting client so they know they're waiting
	r.sendRoomStateToClient(client)
}

// handleClientLeft manages cleanup when a client disconnects.
// It removes the client from all room-related states.
// If the client was the last participant, it triggers the onEmpty callback to clean up the room itself.
// Otherwise, it broadcasts the updated room state to remaining clients.
func (r *Room) handleClientDisconnect(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()

	ctx := context.Background()
	r.disconnectClient(ctx, client)
	slog.Info("Client disconnected and removed from room", "room", r.ID, "ClientId", client.ID)

	// Metrics: Update participant count after disconnect
	totalParticipants := len(r.hosts) + len(r.participants)
	if totalParticipants > 0 {
		metrics.RoomParticipants.WithLabelValues(string(r.ID)).Set(float64(totalParticipants))
	} else {
		// Room is empty, will be cleaned up - don't set gauge
	}

	payload := ClientDisconnectPayload{
		ClientId:    client.ID,
		DisplayName: client.DisplayName,
	}

	// Broadcast to remaining clients
	r.broadcast(ctx, Event(EventDisconnect), payload, nil)

	// Check if room is empty AFTER broadcasting
	if r.isRoomEmpty() {
		if r.onEmpty == nil {
			slog.Error("onEmpty callback not defined. This will cause a memory leak.", "RoomId", r.ID)
			return
		}
		// Run in a goroutine to avoid potential deadlocks
		go func() {
			defer func() {
				if recover() != nil {
					slog.Error("Panic in onEmpty callback", "RoomId", r.ID)
				}
			}()
			r.onEmpty(r.ID)
		}()
	}
}

// router is the central router for all incoming messages from clients.
// router calls the speficied handler for the given type if the client
// has the required permissions.
//
// It acquires a lock to ensure thread safety.
func (r *Room) router(ctx context.Context, client *Client, data any) {
	msg, ok := data.(Message)
	if !ok {
		slog.Error("router failed to marshal incoming message to type Message", "msg", msg, "id", client.ID)
		metrics.WebsocketEvents.WithLabelValues("unknown", "error").Inc()
		return
	}

	// Metrics: Track event processing duration
	start := time.Now()
	defer func() {
		duration := time.Since(start).Seconds()
		metrics.MessageProcessingDuration.WithLabelValues(string(msg.Event)).Observe(duration)
		metrics.WebsocketEvents.WithLabelValues(string(msg.Event), "success").Inc()
	}()

	role := client.GetRole()
	isHost := HasPermission(role, HasHostPermission())
	isParticipant := HasPermission(role, HasParticipantPermission())
	isWaiting := HasPermission(role, HasWaitingPermission())

	switch msg.Event {
	case EventAddChat:
		if isParticipant {
			r.handleAddChat(ctx, client, msg.Event, msg.Payload)
		}

	case EventDeleteChat:
		if isParticipant {
			r.handleDeleteChat(ctx, client, msg.Event, msg.Payload)
		}

	case EventGetRecentChats:
		if isParticipant {
			r.handleGetRecentChats(ctx, client, msg.Event, msg.Payload)
		}

	case EventRaiseHand:
		if isParticipant {
			r.handleRaiseHand(ctx, client, msg.Event, msg.Payload)
		}
	case EventLowerHand:
		if isParticipant {
			r.handleLowerHand(ctx, client, msg.Event, msg.Payload)
		}

	case EventToggleAudio:
		if isParticipant {
			r.handleToggleAudio(ctx, client, msg.Event, msg.Payload)
		}

	case EventToggleVideo:
		if isParticipant {
			r.handleToggleVideo(ctx, client, msg.Event, msg.Payload)
		}

	case EventToggleScreenshare:
		if isParticipant {
			r.handleToggleScreenshare(ctx, client, msg.Event, msg.Payload)
		}

	case EventRequestWaiting:
		if isWaiting {
			r.handleRequestWaiting(ctx, client, msg.Event, msg.Payload)
		}

	case EventAcceptWaiting:
		if isHost {
			r.handleAcceptWaiting(ctx, client, msg.Event, msg.Payload)
		}

	case EventDenyWaiting:
		if isHost {
			r.handleDenyWaiting(ctx, client, msg.Event, msg.Payload)
		}

	case EventRequestScreenshare:
		if (role != RoleTypeScreenshare) &&
			isParticipant {
			r.handleRequestScreenshare(ctx, client, msg.Event, msg.Payload)
		}

	case EventAcceptScreenshare:
		if isHost {
			r.handleAcceptScreenshare(ctx, client, msg.Event, msg.Payload)
		}

	case EventDenyScreenshare:
		if isHost {
			r.handleDenyScreenshare(ctx, client, msg.Event, msg.Payload)
		}

	// WebRTC signaling events - available to participants and hosts
	case EventOffer:
		if isParticipant || isHost {
			r.handleWebRTCOffer(ctx, client, msg.Event, msg.Payload)
		}

	case EventAnswer:
		if isParticipant || isHost {
			r.handleWebRTCAnswer(ctx, client, msg.Event, msg.Payload)
		}

	case EventCandidate:
		if isParticipant || isHost {
			r.handleWebRTCCandidate(ctx, client, msg.Event, msg.Payload)
		}

	case EventRenegotiate:
		if isParticipant || isHost {
			r.handleWebRTCRenegotiate(ctx, client, msg.Event, msg.Payload)
		}

	case EventPing:
		// Heartbeat ping - silently ignore

	default:
		slog.Warn("Received unknown message event", "event", msg.Event)
	}
}

// broadcast sends a message of the specified event and payload to clients in the room.
// For distributed deployments, also publishes critical events to Redis for cross-pod delivery.
// This method assumes the caller already holds the appropriate lock.
// broadcast sends a message of the specified event and payload to clients in the room.
// For distributed deployments, also publishes critical events to Redis for cross-pod delivery.
// This method assumes the caller already holds the appropriate lock.
func (r *Room) broadcast(ctx context.Context, event Event, payload any, roles set.Set[RoleType]) {
	r.broadcastWithOptions(ctx, event, payload, roles, "", false)
}

// broadcastWithOptions is an internal helper to reuse broadcast logic while controlling
// whether to republish to Redis and optionally exclude a sender (to prevent echo).
// Caller must hold the appropriate lock.
func (r *Room) broadcastWithOptions(ctx context.Context, event Event, payload any, roles set.Set[RoleType], excludeSenderID ClientIdType, skipRedis bool) {
	msg := Message{Event: event, Payload: payload}
	rawMsg, err := json.Marshal(msg)
	if err != nil {
		slog.Error("Failed to marshal broadcast message", "payload", payload, "error", err)
		return
	}

	slog.Info("Broadcasting message",
		"event", event,
		"rolesCount", len(roles),
		"hostsCount", len(r.hosts),
		"participantsCount", len(r.participants),
		"waitingCount", len(r.waiting),
		"sharingScreenCount", len(r.sharingScreen))

	if roles == nil {
		// Send to all roles
		slog.Info("Broadcasting to ALL roles")
		for _, m := range []map[ClientIdType]*Client{r.hosts, r.sharingScreen, r.participants, r.waiting} {
			for id, p := range m {
				if excludeSenderID != "" && id == excludeSenderID {
					continue
				}
				select {
				case p.send <- rawMsg:
				default:
					// Prevent a slow client from blocking the whole broadcast.
				}
			}
		}

	} else {
		slog.Info("Broadcasting to specific roles", "rolesCount", len(roles))
		for role := range roles {
			switch role {
			case RoleTypeHost:
				broadcastToClientMap(rawMsg, role, r.hosts, excludeSenderID)
			case RoleTypeScreenshare:
				broadcastToClientMap(rawMsg, role, r.sharingScreen, excludeSenderID)
			case RoleTypeParticipant:
				broadcastToClientMap(rawMsg, role, r.participants, excludeSenderID)
			case RoleTypeWaiting:
				broadcastToClientMap(rawMsg, role, r.waiting, excludeSenderID)
			default:
				continue
			}
		}
	}

	// Publish critical events to Redis for cross-pod distribution
	// Only publish events that need to be synchronized across pods
	if !skipRedis {
		// Use broadcast roles directly. Nil means all roles.
		// Use empty senderID since broadcast is not tied to a specific client
		go r.publishToRedis(ctx, event, payload, "", roles)
	}
}

// broadcastToClientMap sends a raw message to all clients in the specified map,
// optionally excluding a sender to prevent message echo.
func broadcastToClientMap(rawMsg []byte, roleType RoleType, m map[ClientIdType]*Client, excludeSenderID ClientIdType) {
	for clientID, client := range m {
		if excludeSenderID != "" && clientID == excludeSenderID {
			continue
		}
		select {
		case client.send <- rawMsg:
			slog.Debug("Message sent to client", "clientId", clientID)
		default:
			slog.Warn("Failed to send to client - channel full", "clientId", clientID)
		}
	}

	clientCount := len(m)
	slog.Info("Sent to", "clientCount", clientCount, "roleType", string(roleType))
}

// sendRoomStateToClient sends the current room state directly to a specific client.
// This is used when a client first connects to give them the initial state.
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
func (r *Room) sendRoomStateToClient(client *Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	roomState := r.getRoomState(ctx)

	if msg, err := json.Marshal(Message{Event: EventRoomState, Payload: roomState}); err == nil {
		select {
		case client.send <- msg:
		default:
			slog.Warn("Failed to send room state to client - channel full", "ClientId", client.ID, "RoomId", r.ID)
		}
	} else {
		slog.Error("Failed to marshal room state", "error", err, "ClientId", client.ID, "RoomId", r.ID)
	}
}

// broadcastRoomState sends the current room state to all clients in the room.
// This is used after state changes (accept_waiting, deny_waiting, etc.) to
// keep all clients synchronized with the current state.
// Thread Safety: This method is NOT thread-safe and must only be called when
// the room's mutex lock is already held.
func (r *Room) broadcastRoomState(ctx context.Context) {
	roomState := r.getRoomState(ctx)
	r.broadcast(ctx, EventRoomState, roomState, nil)
}
