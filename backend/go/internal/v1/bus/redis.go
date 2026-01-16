package bus

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"
	"github.com/redis/go-redis/v9"
	"github.com/sony/gobreaker"
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
	cb     *gobreaker.CircuitBreaker
}

// Client returns the underlying Redis client.
func (s *Service) Client() *redis.Client {
	if s == nil {
		return nil
	}
	return s.client
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

	st := gobreaker.Settings{
		Name:        "redis",
		MaxRequests: 5,
		Interval:    1 * time.Minute,
		Timeout:     15 * time.Second,
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			var stateVal float64
			switch to {
			case gobreaker.StateClosed:
				stateVal = 0
			case gobreaker.StateOpen:
				stateVal = 1
			case gobreaker.StateHalfOpen:
				stateVal = 2
			}
			metrics.CircuitBreakerState.WithLabelValues("redis").Set(stateVal)
		},
	}

	slog.Info("Connected to Redis Pub/Sub", "addr", addr)
	return &Service{
		client: rdb,
		cb:     gobreaker.NewCircuitBreaker(st),
	}, nil
}

// Publish broadcasts a message to all other Pods watching this room.
// The roles parameter specifies which role types should receive this event (nil/empty = all roles).
func (s *Service) Publish(ctx context.Context, roomID string, event string, payload any, senderID string, roles []string) error {
	if s == nil || s.client == nil {
		return nil // Single-instance mode, no Redis available
	}

	_, err := s.cb.Execute(func() (interface{}, error) {
		// 1. Wrap the payload
		innerBytes, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal inner payload: %w", err)
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
			return nil, fmt.Errorf("failed to marshal pubsub envelope: %w", err)
		}

		// 2. Publish to the specific room channel
		// Channel schema: "video:room:{id}"
		channel := fmt.Sprintf("video:room:%s", roomID)

		return nil, s.client.Publish(ctx, channel, data).Err()
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("redis").Inc()
			slog.Warn("Redis Circuit Breaker Open: dropping publish", "roomID", roomID)
			return nil // Graceful degradation: drop message, don't crash caller
		}
		slog.Error("Redis Publish Failed", "roomID", roomID, "error", err)
		return err
	}

	return nil
}

// PublishDirect sends a message directly to a specific user via Redis.
func (s *Service) PublishDirect(ctx context.Context, targetUserId string, event string, payload any, senderID string) error {
	if s == nil || s.client == nil {
		return nil // Single-instance mode, no Redis available
	}

	_, err := s.cb.Execute(func() (interface{}, error) {
		// Wrap the payload
		innerBytes, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal inner payload for direct message: %w", err)
		}

		msg := PubSubPayload{
			Event:    event,
			Payload:  innerBytes,
			SenderID: senderID,
			// Note: RoomID and Roles are empty for direct messages
		}

		data, err := json.Marshal(msg)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal direct message envelope: %w", err)
		}

		// Publish to the user-specific channel
		channel := fmt.Sprintf("video:user:%s", targetUserId)

		return nil, s.client.Publish(ctx, channel, data).Err()
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("redis").Inc()
			slog.Warn("Redis Circuit Breaker Open: dropping direct message", "targetUserId", targetUserId)
			return nil // Graceful degradation
		}
		slog.Error("Redis PublishDirect failed", "targetUserId", targetUserId, "senderID", senderID, "event", event, "error", err)
		return err
	}

	slog.Debug("Published direct message via Redis", "targetUserId", targetUserId, "senderID", senderID, "event", event)
	return nil
}

// Subscribe starts a background goroutine that listens for messages from OTHER pods.
// handler: A function that will be executed for every valid message received.
func (s *Service) Subscribe(ctx context.Context, roomID string, wg *sync.WaitGroup, handler func(PubSubPayload)) {
	if s == nil || s.client == nil {
		return // Single-instance mode, no Redis available
	}

	// Subscriptions are long-lived and don't fit well with simple Request/Response circuit breakers.
	// However, if Redis is down, Subscribe will fail initially. We can wrap the initial call.
	// But retrying logic is usually handled by the redis client or caller.
	// For simplicity, we won't wrap the *async* loop in the CB, but we should handle connection failures.

	channel := fmt.Sprintf("video:room:%s", roomID)

	// Create the subscription
	pubsub := s.client.Subscribe(ctx, channel)

	// Start the listener loop in a goroutine
	if wg != nil {
		wg.Add(1)
	}
	go func() {
		defer pubsub.Close()
		if wg != nil {
			defer wg.Done()
		}

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

// Ping checks Redis connectivity using the PING command
// Used by health checks to verify Redis is reachable
func (s *Service) Ping(ctx context.Context) error {
	if s == nil || s.client == nil {
		return nil // Single-instance mode, no Redis available
	}

	_, err := s.cb.Execute(func() (interface{}, error) {
		return nil, s.client.Ping(ctx).Err()
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("redis").Inc()
		}
		return err
	}
	return nil
}

// Close gracefully shuts down the Redis connection
func (s *Service) Close() error {
	if s == nil || s.client == nil {
		return nil // Single-instance mode, no Redis available
	}
	return s.client.Close()
}

// SetAdd adds a member to a Redis Set. Used for distributed state management.
func (s *Service) SetAdd(ctx context.Context, key string, member string) error {
	if s == nil || s.client == nil {
		return nil // Single-instance mode, no Redis available
	}

	_, err := s.cb.Execute(func() (interface{}, error) {
		return nil, s.client.SAdd(ctx, key, member).Err()
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("redis").Inc()
			slog.Warn("Redis Circuit Breaker Open: skipping SetAdd", "key", key)
			return nil // Graceful degradation
		}
		slog.Error("Redis SetAdd failed", "key", key, "member", member, "error", err)
		return fmt.Errorf("failed to add to set: %w", err)
	}
	return nil
}

// SetRem removes a member from a Redis Set.
func (s *Service) SetRem(ctx context.Context, key string, member string) error {
	if s == nil || s.client == nil {
		return nil // Single-instance mode, no Redis available
	}

	_, err := s.cb.Execute(func() (interface{}, error) {
		return nil, s.client.SRem(ctx, key, member).Err()
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("redis").Inc()
			slog.Warn("Redis Circuit Breaker Open: skipping SetRem", "key", key)
			return nil // Graceful degradation
		}
		slog.Error("Redis SetRem failed", "key", key, "member", member, "error", err)
		return fmt.Errorf("failed to remove from set: %w", err)
	}
	return nil
}

// SetMembers retrieves all members of a Redis Set.
func (s *Service) SetMembers(ctx context.Context, key string) ([]string, error) {
	if s == nil || s.client == nil {
		return nil, nil // Single-instance mode, no Redis available
	}

	res, err := s.cb.Execute(func() (interface{}, error) {
		return s.client.SMembers(ctx, key).Result()
	})

	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("redis").Inc()
			slog.Warn("Redis Circuit Breaker Open: returning empty set members", "key", key)
			return nil, nil // Graceful degradation: return empty list so room can still function locally
		}
		slog.Error("Redis SetMembers failed", "key", key, "error", err)
		return nil, fmt.Errorf("failed to get set members: %w", err)
	}
	return res.([]string), nil
}
