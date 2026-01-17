package room

import (
	"context"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"go.uber.org/zap"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"google.golang.org/protobuf/proto"
)

func (r *Room) subscribeToRedis() {
	if r.bus == nil {
		logging.GetLogger().Debug("Redis disabled (single-instance mode)")
		return
	}

	ctx := r.ctx
	r.bus.Subscribe(ctx, string(r.ID), &r.wg, func(payload bus.PubSubPayload) {
		r.handleRedisMessage(payload)
	})
	logging.Info(ctx, "Subscribed to Redis", zap.String("roomId", string(r.ID)))
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
		logging.Error(r.ctx, "Redis proto unmarshal failed", zap.Error(err))
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
		logging.Error(ctx, "Redis proto marshal failed", zap.Error(err))
		return
	}

	// Publish
	err = r.bus.Publish(ctx, string(r.ID), "proto", data, "", nil)
	if err != nil {
		logging.Error(ctx, "Redis publish failed", zap.Error(err))
	}
}
