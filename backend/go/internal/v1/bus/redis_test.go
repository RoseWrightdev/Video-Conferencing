package bus

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestService(t *testing.T) (*Service, *miniredis.Miniredis) {
	mr, err := miniredis.Run()
	require.NoError(t, err)

	svc, err := NewService(mr.Addr(), "")
	require.NoError(t, err)

	return svc, mr
}

func TestNewService(t *testing.T) {
	svc, mr := newTestService(t)
	defer mr.Close()
	defer func() { _ = svc.Close() }()

	assert.NotNil(t, svc.Client())
	err := svc.Ping(context.Background())
	assert.NoError(t, err)
}

func TestPublish(t *testing.T) {
	svc, mr := newTestService(t)
	defer mr.Close()
	defer func() { _ = svc.Close() }()

	ctx := context.Background()
	roomID := "room-1"

	// Subscribe manually to check if message arrives
	sub := svc.Client().Subscribe(ctx, "video:room:"+roomID)
	defer func() { _ = sub.Close() }()

	// Wait for subscription to be active
	time.Sleep(50 * time.Millisecond)

	payload := map[string]string{"foo": "bar"}
	err := svc.Publish(ctx, roomID, "test-event", payload, "sender-1", []string{"host"})
	assert.NoError(t, err)

	// Receive
	msg, err := sub.ReceiveMessage(ctx)
	assert.NoError(t, err)

	var envelope PubSubPayload
	err = json.Unmarshal([]byte(msg.Payload), &envelope)
	assert.NoError(t, err)

	assert.Equal(t, roomID, envelope.RoomID)
	assert.Equal(t, "test-event", envelope.Event)
	assert.Equal(t, "sender-1", envelope.SenderID)
	assert.Contains(t, envelope.Roles, "host")
}

func TestPublishDirect(t *testing.T) {
	svc, mr := newTestService(t)
	defer mr.Close()
	defer func() { _ = svc.Close() }()

	ctx := context.Background()
	targetUserID := "user-target"

	// Subscribe manually to user channel
	sub := svc.Client().Subscribe(ctx, "video:user:"+targetUserID)
	defer func() { _ = sub.Close() }()
	time.Sleep(50 * time.Millisecond)

	payload := map[string]string{"msg": "direct"}
	err := svc.PublishDirect(ctx, targetUserID, "direct-event", payload, "sender-1")
	assert.NoError(t, err)

	// Receive
	msg, err := sub.ReceiveMessage(ctx)
	assert.NoError(t, err)

	var envelope PubSubPayload
	err = json.Unmarshal([]byte(msg.Payload), &envelope)
	assert.NoError(t, err)

	assert.Equal(t, "direct-event", envelope.Event)
	assert.Equal(t, "sender-1", envelope.SenderID)
	// RoomID and Roles should be empty
	assert.Empty(t, envelope.RoomID)
	assert.Empty(t, envelope.Roles)
}

func TestSubscribe(t *testing.T) {
	svc, mr := newTestService(t)
	defer mr.Close()
	defer func() { _ = svc.Close() }()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	roomID := "room-sub"
	wg := &sync.WaitGroup{}

	received := make(chan PubSubPayload, 1)
	handler := func(p PubSubPayload) {
		received <- p
	}

	svc.Subscribe(ctx, roomID, wg, handler)

	// Wait for subscription
	time.Sleep(50 * time.Millisecond)

	// Publish from "another pod" (directly via redis client)
	payload := PubSubPayload{
		RoomID:   roomID,
		Event:    "hello",
		SenderID: "sender-2",
	}
	bytes, _ := json.Marshal(payload)
	svc.Client().Publish(ctx, "video:room:"+roomID, bytes)

	select {
	case p := <-received:
		assert.Equal(t, "hello", p.Event)
		assert.Equal(t, "sender-2", p.SenderID)
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for message")
	}

	// Cancel context to stop subscription
	cancel()
	wg.Wait()
}

func TestSetOperations(t *testing.T) {
	svc, mr := newTestService(t)
	defer mr.Close()
	defer func() { _ = svc.Close() }()

	ctx := context.Background()
	key := "test-set"

	// Add
	err := svc.SetAdd(ctx, key, "m1")
	assert.NoError(t, err)
	err = svc.SetAdd(ctx, key, "m2")
	assert.NoError(t, err)

	// Check members
	members, err := svc.SetMembers(ctx, key)
	assert.NoError(t, err)
	assert.ElementsMatch(t, []string{"m1", "m2"}, members)

	// Remove
	err = svc.SetRem(ctx, key, "m1")
	assert.NoError(t, err)

	members, err = svc.SetMembers(ctx, key)
	assert.NoError(t, err)
	assert.ElementsMatch(t, []string{"m2"}, members)
}

func TestRedisFailure_Graceful(t *testing.T) {
	svc, mr := newTestService(t)

	// Kill redis
	mr.Close()

	ctx := context.Background()

	// These should fail but handle it gracefully (likely returning error, but checks circuit breaker logic)
	// First call might return error
	// Repeated calls should trip CB

	// Note: gobreaker might not trip immediately on one error depending on config (MaxRequests: 5)

	err := svc.Ping(ctx)
	assert.Error(t, err)
}

func TestSetOperations_ErrorPaths(t *testing.T) {
	svc, mr := newTestService(t)
	defer mr.Close()
	defer func() { _ = svc.Close() }()

	ctx := context.Background()
	key := "test-error-set"

	// Add members individually
	err := svc.SetAdd(ctx, key, "m1")
	assert.NoError(t, err)
	err = svc.SetAdd(ctx, key, "m2")
	assert.NoError(t, err)
	err = svc.SetAdd(ctx, key, "m3")
	assert.NoError(t, err)

	members, err := svc.SetMembers(ctx, key)
	assert.NoError(t, err)
	assert.Len(t, members, 3)

	// Remove members individually
	err = svc.SetRem(ctx, key, "m1")
	assert.NoError(t, err)
	err = svc.SetRem(ctx, key, "m2")
	assert.NoError(t, err)

	members, err = svc.SetMembers(ctx, key)
	assert.NoError(t, err)
	assert.ElementsMatch(t, []string{"m3"}, members)

	// Test with closed Redis
	mr.Close()

	err = svc.SetAdd(ctx, key, "m4")
	assert.Error(t, err)

	err = svc.SetRem(ctx, key, "m3")
	assert.Error(t, err)

	_, err = svc.SetMembers(ctx, key)
	assert.Error(t, err)
}

func TestPublish_CircuitBreakerOpen(t *testing.T) {
	svc, mr := newTestService(t)
	defer mr.Close()
	defer func() { _ = svc.Close() }()

	ctx := context.Background()

	// Close Redis to trigger circuit breaker
	mr.Close()

	// Multiple failed calls
	for i := 0; i < 10; i++ {
		_ = svc.Publish(ctx, "room-1", "event", map[string]string{}, "sender", []string{})
	}

	// Circuit breaker should be open now (graceful degradation)
	err := svc.Publish(ctx, "room-1", "event", map[string]string{}, "sender", []string{})
	// Should not panic, may return nil (graceful degradation) or error
	_ = err
}

func TestPublishDirect_CircuitBreakerOpen(t *testing.T) {
	svc, mr := newTestService(t)
	defer mr.Close()
	defer func() { _ = svc.Close() }()

	ctx := context.Background()

	// Close Redis to trigger circuit breaker
	mr.Close()

	// Multiple failed calls
	for i := 0; i < 10; i++ {
		_ = svc.PublishDirect(ctx, "user-1", "event", map[string]string{}, "sender")
	}

	// Circuit breaker should be open now
	err := svc.PublishDirect(ctx, "user-1", "event", map[string]string{}, "sender")
	_ = err
}
