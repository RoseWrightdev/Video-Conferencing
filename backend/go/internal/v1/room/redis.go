package room

import (
	"context"
	"log/slog"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"google.golang.org/protobuf/proto"
)

func (r *Room) subscribeToRedis() {
	if r.bus == nil {
		slog.Debug("Redis disabled (single-instance mode)")
		return
	}

	ctx := context.Background()
	r.bus.Subscribe(ctx, string(r.ID), func(payload bus.PubSubPayload) {
		r.handleRedisMessage(payload)
	})
	slog.Info("Subscribed to Redis", "roomId", r.ID)
}

func (r *Room) handleRedisMessage(payload bus.PubSubPayload) {
	if len(payload.Payload) == 0 {
		return
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// Decode Protobuf
	var msg pb.WebSocketMessage
	if err := proto.Unmarshal(payload.Payload, &msg); err != nil {
		slog.Error("Redis proto unmarshal failed", "error", err)
		return
	}

	// Broadcast to LOCAL users
	r.broadcastLocked(&msg)
}

func (r *Room) publishToRedis(ctx context.Context, msg *pb.WebSocketMessage) {
	if r.bus == nil {
		return
	}

	// Marshal to Binary
	data, err := proto.Marshal(msg)
	if err != nil {
		slog.Error("Redis proto marshal failed", "error", err)
		return
	}

	// Publish
	err = r.bus.Publish(ctx, string(r.ID), "proto", data, "", nil)
	if err != nil {
		slog.Error("Redis publish failed", "error", err)
	}
}
