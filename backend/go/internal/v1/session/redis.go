package session

import (
	"context"
	"log/slog"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"google.golang.org/protobuf/proto"
)

func (r *Room) subscribeToRedis() {
	if r.bus == nil {
		slog.Info("Dev Mode: Redis disabled")
		return
	}

	ctx := context.Background()
	r.bus.Subscribe(ctx, string(r.ID), func(payload bus.PubSubPayload) {
		r.handleRedisMessage(payload)
	})
	slog.Info("Subscribed to Redis", "roomId", r.ID)
}

func (r *Room) handleRedisMessage(payload bus.PubSubPayload) {
	// 1. Safety Check
	if len(payload.Payload) == 0 {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// 2. Cast Payload (json.RawMessage is []byte)
	data := []byte(payload.Payload)

	// 3. Decode Protobuf
	var msg pb.WebSocketMessage
	if err := proto.Unmarshal(data, &msg); err != nil {
		slog.Error("Redis proto unmarshal failed", "error", err)
		return
	}

	// 4. Broadcast to LOCAL users
	// This ensures users on Pod A see chat messages from Pod B
	r.broadcastLocked(&msg)
}

func (r *Room) publishToRedis(ctx context.Context, msg *pb.WebSocketMessage) {
	if r.bus == nil {
		return // Dev Mode: Skip
	}

	// 1. Marshal to Binary
	data, err := proto.Marshal(msg)
	if err != nil {
		slog.Error("Redis proto marshal failed", "error", err)
		return
	}

	// 2. Publish
	// We use a generic event name "proto" because the payload is self-describing
	err = r.bus.Publish(ctx, string(r.ID), "proto", data, "", nil)
	if err != nil {
		slog.Error("Redis publish failed", "error", err)
	}
}
