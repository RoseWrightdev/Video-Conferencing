package bus

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

// PubSubPayload is the standardized container for moving messages between Pods.
type PubSubPayload struct {
	RoomID   string          `json:"roomId"`
	Event    string          `json:"event"`           // The event type (e.g., "offer", "chat")
	Payload  json.RawMessage `json:"payload"`         // The actual data (WebRTC SDP, Chat content)
	SenderID string          `json:"senderId"`        // CRITICAL: Used to prevent echo (infinite loops)
	Roles    []string        `json:"roles,omitempty"` // Which roles should receive this event (nil/empty = all)
}

// Service handles all interaction with the Redis cluster.
type Service struct {
	client *redis.Client
}

// NewService creates a robust Redis connection with automatic retries.
func NewService(addr, password string) (*Service, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           0, // Default DB
		DialTimeout:  10 * time.Second,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		PoolSize:     10, // Optimize for 15 replicas
		MinIdleConns: 2,
	})

	// Ping to verify connection immediately
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	slog.Info("Connected to Redis Pub/Sub", "addr", addr)
	return &Service{client: rdb}, nil
}

// Publish broadcasts a message to all other Pods watching this room.
// The roles parameter specifies which role types should receive this event (nil/empty = all roles).
func (s *Service) Publish(ctx context.Context, roomID string, event string, payload any, senderID string, roles []string) error {
	// 1. Wrap the payload
	// We use json.Marshal here to ensure the inner payload is properly serialized
	// before wrapping it in the PubSub struct.
	innerBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal inner payload: %w", err)
	}

	msg := PubSubPayload{
		RoomID:   roomID,
		Event:    event,
		Payload:  innerBytes,
		SenderID: senderID, // Pass the ID of the client who sent this
		Roles:    roles,    // Which roles should receive this event
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal pubsub envelope: %w", err)
	}

	// 2. Publish to the specific room channel
	// Channel schema: "video:room:{id}"
	channel := fmt.Sprintf("video:room:%s", roomID)

	err = s.client.Publish(ctx, channel, data).Err()
	if err != nil {
		slog.Error("Redis Publish Failed", "roomID", roomID, "error", err)
		return err
	}

	return nil
}

// PublishDirect sends a message directly to a specific user via Redis.
// This is used for WebRTC signaling (offer, answer, ICE candidates) where the target
// user may be on a different Pod. Unlike Publish, this bypasses local delivery and
// routes exclusively through Redis for guaranteed cross-pod delivery.
//
// Direct Message Channel Schema:
// - "video:user:{targetUserId}" - Targeted delivery channel for WebRTC signals
//
// Use Cases:
//   - WebRTC offer/answer/ICE candidate forwarding across pods
//   - Direct messaging between peers in different rooms (future feature)
//   - Any point-to-point signaling that doesn't fit room broadcast pattern
//
// Flow:
//  1. Source user sends signal (offer/answer/candidate)
//  2. Local pod checks if target user is local -> deliver immediately
//  3. If not found locally -> PublishDirect via Redis
//  4. Target's pod receives on "video:user:{id}" channel
//  5. Target's room processes and delivers to local WebSocket client
//
// Parameters:
//   - ctx: Context for cancellation and timeout control
//   - targetUserId: The ID of the recipient (where the signal is routed)
//   - event: The WebRTC event type (offer, answer, candidate, renegotiate)
//   - payload: The actual WebRTC data (SDP or ICE candidate)
//   - senderID: The ID of the originating user (for logging and debugging)
//
// Returns:
//   - error: If Redis publish fails (connection error, context timeout, etc.)
func (s *Service) PublishDirect(ctx context.Context, targetUserId string, event string, payload any, senderID string) error {
	// Wrap the payload
	innerBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal inner payload for direct message: %w", err)
	}

	msg := PubSubPayload{
		Event:    event,
		Payload:  innerBytes,
		SenderID: senderID,
		// Note: RoomID and Roles are empty for direct messages
		// The receiving pod will determine routing based on the channel subscription
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal direct message envelope: %w", err)
	}

	// Publish to the user-specific channel
	channel := fmt.Sprintf("video:user:%s", targetUserId)

	err = s.client.Publish(ctx, channel, data).Err()
	if err != nil {
		slog.Error("Redis PublishDirect failed", "targetUserId", targetUserId, "senderID", senderID, "event", event, "error", err)
		return err
	}

	slog.Debug("Published direct message via Redis", "targetUserId", targetUserId, "senderID", senderID, "event", event)
	return nil
}

// Subscribe starts a background goroutine that listens for messages from OTHER pods.
// handler: A function that will be executed for every valid message received.
func (s *Service) Subscribe(ctx context.Context, roomID string, handler func(PubSubPayload)) {
	channel := fmt.Sprintf("video:room:%s", roomID)

	// Create the subscription
	pubsub := s.client.Subscribe(ctx, channel)

	// Start the listener loop in a goroutine
	go func() {
		defer pubsub.Close()

		slog.Info("Subscribed to Redis channel", "channel", channel)

		ch := pubsub.Channel()

		// Read indefinitely until the context is cancelled or connection dies
		for {
			select {
			case <-ctx.Done():
				return // Stop listening if the room closes
			case msg, ok := <-ch:
				if !ok {
					slog.Warn("Redis subscription channel closed", "channel", channel)
					return
				}

				var payload PubSubPayload
				if err := json.Unmarshal([]byte(msg.Payload), &payload); err != nil {
					slog.Error("Failed to unmarshal Redis message", "error", err, "raw", msg.Payload)
					continue
				}

				// Pass the data back up to the application layer
				handler(payload)
			}
		}
	}()
}

// Close gracefully shuts down the Redis connection
func (s *Service) Close() error {
	return s.client.Close()
}

// SetAdd adds a member to a Redis Set. Used for distributed state management.
// The key typically follows the pattern "room:{roomId}:participants" or "room:{roomId}:hosts".
// This enables cross-pod participant tracking where each pod can see all users
// across the cluster, not just local connections.
//
// Parameters:
//   - ctx: Context for cancellation and timeout control
//   - key: Redis key for the set (e.g., "room:123:participants")
//   - member: The value to add (typically JSON-encoded ClientInfo)
//
// Returns:
//   - error: If Redis operation fails
func (s *Service) SetAdd(ctx context.Context, key string, member string) error {
	err := s.client.SAdd(ctx, key, member).Err()
	if err != nil {
		slog.Error("Redis SetAdd failed", "key", key, "member", member, "error", err)
		return fmt.Errorf("failed to add to set: %w", err)
	}
	return nil
}

// SetRem removes a member from a Redis Set.
// Used when a participant disconnects or is removed from the room.
//
// Parameters:
//   - ctx: Context for cancellation and timeout control
//   - key: Redis key for the set (e.g., "room:123:participants")
//   - member: The value to remove (typically JSON-encoded ClientInfo)
//
// Returns:
//   - error: If Redis operation fails
func (s *Service) SetRem(ctx context.Context, key string, member string) error {
	err := s.client.SRem(ctx, key, member).Err()
	if err != nil {
		slog.Error("Redis SetRem failed", "key", key, "member", member, "error", err)
		return fmt.Errorf("failed to remove from set: %w", err)
	}
	return nil
}

// SetMembers retrieves all members of a Redis Set.
// Used by getRoomState to fetch the complete list of participants across all pods.
// This solves the "split-brain" problem where users on different server instances
// cannot see each other in the participant list.
//
// Parameters:
//   - ctx: Context for cancellation and timeout control
//   - key: Redis key for the set (e.g., "room:123:participants")
//
// Returns:
//   - []string: Slice of all members in the set (JSON-encoded ClientInfo objects)
//   - error: If Redis operation fails
func (s *Service) SetMembers(ctx context.Context, key string) ([]string, error) {
	members, err := s.client.SMembers(ctx, key).Result()
	if err != nil {
		slog.Error("Redis SetMembers failed", "key", key, "error", err)
		return nil, fmt.Errorf("failed to get set members: %w", err)
	}
	return members, nil
}
