package session

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"k8s.io/utils/set"
)

// subscribeToRedis sets up a Redis pub/sub subscription for this room.
// This allows the room to receive events from other pods in a distributed deployment.
// The subscription runs in a background goroutine and automatically forwards messages
// to clients in this pod (excluding the original sender to prevent echo).
func (r *Room) subscribeToRedis() {
	if r.bus == nil {
		return
	}

	// Create a context that we can cancel when the room is destroyed
	ctx := context.Background()

	r.bus.Subscribe(ctx, string(r.ID), func(payload bus.PubSubPayload) {
		r.handleRedisMessage(payload)
	})

	slog.Info("Room subscribed to Redis pub/sub", "roomId", r.ID)
}

// handleRedisMessage processes messages received from Redis pub/sub.
// It routes WebRTC signaling to local clients when appropriate and
// falls back to standard broadcast logic for chat/room events.
func (r *Room) handleRedisMessage(payload bus.PubSubPayload) {
	r.mu.Lock()
	defer r.mu.Unlock()

	slog.Debug("Received Redis message for room",
		"roomId", r.ID,
		"event", payload.Event,
		"senderID", payload.SenderID,
		"roles", payload.Roles)

	// --- ROUTING LOGIC: Filter WebRTC events locally ---
	switch Event(payload.Event) {
	case EventOffer, EventAnswer, EventCandidate, EventRenegotiate:
		var target struct {
			TargetClientId ClientIdType `json:"targetClientId"`
		}
		if err := json.Unmarshal(payload.Payload, &target); err != nil {
			slog.Error("Failed to parse target from Redis message", "event", payload.Event, "error", err)
			return
		}

		var targetClient *Client
		if c := r.participants[target.TargetClientId]; c != nil {
			targetClient = c
		} else if c := r.hosts[target.TargetClientId]; c != nil {
			targetClient = c
		}

		if targetClient != nil {
			msg := Message{
				Event:   Event(payload.Event),
				Payload: payload.Payload,
			}
			rawMsg, _ := json.Marshal(msg)

			// Non-blocking send: drop message if channel is full
			select {
			case targetClient.send <- rawMsg:
				slog.Debug("Redis-routed message delivered locally", "target", targetClient.ID)
			default:
				// Channel is full - log warning and drop message
				// Do NOT block the entire room waiting for a slow client
				slog.Warn("Client send channel full, dropping Redis message",
					"target", targetClient.ID,
					"event", payload.Event)
			}
		}
		return
	}

	// --- STANDARD BROADCAST LOGIC (Chat, RoomState, etc.) ---
	senderID := ClientIdType(payload.SenderID)
	var roleSet set.Set[RoleType]
	if len(payload.Roles) > 0 {
		roleSet = set.New[RoleType]()
		for _, roleStr := range payload.Roles {
			roleSet.Insert(RoleType(roleStr))
		}
	}
	// reuse broadcast logic; skip republishing to avoid loops
	ctx := context.Background() // Redis subscription runs in background goroutine
	r.broadcastWithOptions(ctx, Event(payload.Event), payload.Payload, roleSet, senderID, true)
}

// publishToRedis publishes an event to Redis for cross-pod distribution.
// This should be called after local broadcast to ensure other pods receive the event.
// The senderID is critical to prevent message echo when the message comes back via subscription.
// The roles parameter specifies which role types should receive this event (nil = all roles).
func (r *Room) publishToRedis(ctx context.Context, event Event, payload interface{}, senderID ClientIdType, roles set.Set[RoleType]) {
	if r.bus == nil {
		return // Single-instance mode, no cross-pod communication needed
	}

	// Convert set to []string for bus interface
	var roleStrings []string
	if roles != nil && roles.Len() > 0 {
		roleStrings = make([]string, 0, roles.Len())
		for role := range roles {
			roleStrings = append(roleStrings, string(role))
		}
	}

	err := r.bus.Publish(ctx, string(r.ID), string(event), payload, string(senderID), roleStrings)
	if err != nil {
		slog.Error("Failed to publish to Redis",
			"roomId", r.ID,
			"event", event,
			"error", err)
	}
}
