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

// subscribeToDirectMessages sets up a Redis subscription for direct WebRTC signals
// sent to any participant in this room. This enables cross-pod WebRTC signaling.
// All clients in the room subscribe to receive direct messages routed to their user IDs.
func (r *Room) subscribeToDirectMessages(clientID ClientIdType) {
	if r.bus == nil {
		return
	}

	// Create a context that persists for the room's lifetime
	ctx := context.Background()

	r.bus.Subscribe(ctx, "video:user:"+string(clientID), func(payload bus.PubSubPayload) {
		r.handleDirectMessage(payload)
	})

	slog.Debug("Room subscribed to direct messages for user", "userId", clientID, "roomId", r.ID)
}

// handleRedisMessage processes messages received from Redis pub/sub.
// This method is called when another pod publishes an event to this room's channel.
// It forwards the message to clients in this pod based on role permissions,
// EXCEPT the original sender (identified by payload.SenderID) to prevent message echo.
func (r *Room) handleRedisMessage(payload bus.PubSubPayload) {
	// Use write lock because broadcast methods expect caller holds lock
	r.mu.Lock()
	defer r.mu.Unlock()

	slog.Debug("Received Redis message for room",
		"roomId", r.ID,
		"event", payload.Event,
		"senderID", payload.SenderID,
		"roles", payload.Roles)

	// No need to reconstruct and marshal; broadcastWithOptions handles it

	senderID := ClientIdType(payload.SenderID)

	// Convert string roles to RoleType set for consistent broadcasting pattern
	var roleSet set.Set[RoleType]
	if len(payload.Roles) > 0 {
		roleSet = set.New[RoleType]()
		for _, roleStr := range payload.Roles {
			roleSet.Insert(RoleType(roleStr))
		}
	}
	// Reuse broadcast logic, skip republishing and exclude original sender to prevent echo
	r.broadcastWithOptions(Event(payload.Event), payload.Payload, roleSet, senderID, true)
}

// handleDirectMessage processes direct WebRTC signals from other pods.
// This is used for peer-to-peer signaling (offer, answer, ICE candidates) where
// the target user is on this pod but the sender is on another pod.
// The message is forwarded directly to the target client via their WebSocket channel.
func (r *Room) handleDirectMessage(payload bus.PubSubPayload) {
	r.mu.Lock()
	defer r.mu.Unlock()

	slog.Debug("Received direct message via Redis",
		"event", payload.Event,
		"senderID", payload.SenderID,
		"roomId", r.ID)

	// This payload should have raw JSON that we forward directly
	// The frontend expects it wrapped in a Message with Event and Payload

	rawMsg := make([]byte, 0)
	var err error

	// Reconstruct the message to send to the client
	msg := Message{
		Event:   Event(payload.Event),
		Payload: payload.Payload, // This is already JSON bytes
	}

	if rawMsg, err = json.Marshal(msg); err != nil {
		slog.Error("Failed to marshal direct message for client",
			"error", err,
			"event", payload.Event,
			"senderID", payload.SenderID)
		return
	}

	// Send to all local clients except the sender
	// (though typically only one client will need it based on the subscription)
	for clientID, client := range r.participants {
		if ClientIdType(payload.SenderID) != clientID {
			select {
			case client.send <- rawMsg:
				slog.Debug("Direct message forwarded to client",
					"senderID", payload.SenderID,
					"targetClientID", clientID)
			default:
				slog.Warn("Failed to forward direct message - client channel full",
					"targetClientID", clientID)
			}
		}
	}
}

// publishToRedis publishes an event to Redis for cross-pod distribution.
// This should be called after local broadcast to ensure other pods receive the event.
// The senderID is critical to prevent message echo when the message comes back via subscription.
// The roles parameter specifies which role types should receive this event (nil = all roles).
func (r *Room) publishToRedis(event Event, payload interface{}, senderID ClientIdType, roles set.Set[RoleType]) {
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

	ctx := context.Background()
	err := r.bus.Publish(ctx, string(r.ID), string(event), payload, string(senderID), roleStrings)
	if err != nil {
		slog.Error("Failed to publish to Redis",
			"roomId", r.ID,
			"event", event,
			"error", err)
	}
}
