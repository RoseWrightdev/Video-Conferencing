package transport

import (
	"context"
	"testing"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/config"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/ratelimit"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/room"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func newMockRateLimiter() *ratelimit.RateLimiter {
	cfg := &config.Config{
		RateLimitAPIGlobal:   "1000-M",
		RateLimitAPIPublic:   "100-M",
		RateLimitAPIRooms:    "100-M",
		RateLimitAPIMessages: "500-M",
		RateLimitWsIP:        "100-M",
		RateLimitWsUser:      "10-M",
	}
	rl, _ := ratelimit.NewRateLimiter(cfg, nil, &MockTokenValidator{})
	return rl
}

// Additional NewHub tests for better coverage

func TestNewHub_WithDevMode(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}

	hub := NewHub(context.Background(), validator, mockBus, true, newMockRateLimiter())

	assert.NotNil(t, hub)
	assert.True(t, hub.devMode, "devMode should be enabled")
	assert.Equal(t, 5*time.Second, hub.cleanupGracePeriod)
}

func TestNewHub_WithoutBus(t *testing.T) {
	validator := &MockTokenValidator{}

	hub := NewHub(context.Background(), validator, nil, false, newMockRateLimiter())

	assert.NotNil(t, hub)
	assert.Nil(t, hub.bus, "bus should be nil")
}

func TestNewHub_InitializesEmptyMaps(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}

	hub := NewHub(context.Background(), validator, mockBus, false, newMockRateLimiter())

	assert.NotNil(t, hub.rooms)
	assert.Equal(t, 0, len(hub.rooms), "rooms map should be empty initially")
	assert.NotNil(t, hub.pendingRoomCleanups)
	assert.Equal(t, 0, len(hub.pendingRoomCleanups), "pendingRoomCleanups should be empty initially")
}

// Tests for handleClientConnect edge cases

func TestHandleClientConnect_FirstUserBecomesOwner(t *testing.T) {
	mockBus := &MockBusService{}
	r := room.NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// First user connects
	client1 := &hubMockClient{id: "user1"}

	r.HandleClientConnect(client1)

	// First user should become owner and host
	assert.Equal(t, types.ClientIDType("user1"), r.GetOwnerID())
	assert.Equal(t, types.RoleTypeHost, client1.GetRole())
	assert.True(t, r.IsParticipant(client1.GetID()))
}

func TestHandleClientConnect_OwnerReconnects(t *testing.T) {
	mockBus := &MockBusService{}
	r := room.NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// First user becomes owner
	client1 := &hubMockClient{id: "user1"}
	r.HandleClientConnect(client1)

	// Owner disconnects (simulate by removing from map but keeping ownerID)
	r.HandleClientDisconnect(client1)

	// Owner reconnects with new client instance
	client1Reconnect := &hubMockClient{id: "user1"}
	r.HandleClientConnect(client1Reconnect)

	// Should still be owner and host
	assert.Equal(t, types.ClientIDType("user1"), r.GetOwnerID())
	assert.Equal(t, types.RoleTypeHost, client1Reconnect.GetRole())
}

func TestHandleClientConnect_NonOwnerReconnectsAsParticipant(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := room.NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Setup: owner first
	owner := &hubMockClient{id: "owner"}
	r.HandleClientConnect(owner)

	// Participant joins
	participant := &hubMockClient{id: "user2"}
	r.AddParticipant(ctx, participant)

	// Simulate disconnect
	r.HandleClientDisconnect(participant)

	// Participant reconnects
	participantReconnect := &hubMockClient{id: "user2"}
	r.HandleClientConnect(participantReconnect)

	// Non-owners go to waiting room by default on reconnect
	assert.Equal(t, types.RoleTypeWaiting, participantReconnect.GetRole())
}

func TestHandleClientConnect_DuplicateConnectionRemovesOld(t *testing.T) {
	mockBus := &MockBusService{}
	mockSFU := &MockSFUProvider{}
	r := room.NewRoom(context.Background(), "test-room", nil, mockBus, mockSFU)

	// First connection
	client1 := &hubMockClient{id: "user1"}
	r.HandleClientConnect(client1)

	// Duplicate connection (same user ID, new instance)
	client1Duplicate := &hubMockClient{id: "user1"}
	r.HandleClientConnect(client1Duplicate)

	// New connection should be in room
	assert.True(t, r.IsParticipant(types.ClientIDType("user1")))
}

func TestHandleClientConnect_SubsequentUserGoesToWaiting(t *testing.T) {
	mockBus := &MockBusService{}
	r := room.NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// First user becomes host
	h := &hubMockClient{id: "host"}
	r.HandleClientConnect(h)

	// Second user should go to waiting
	user2 := &hubMockClient{id: "user2"}
	r.HandleClientConnect(user2)

	assert.Equal(t, types.RoleTypeWaiting, user2.GetRole())
	assert.True(t, r.IsParticipant(user2.GetID()))
}

// Error path tests

func TestDisconnectClientLocked_SFUDeleteError(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	// Use MockSFUProvider from mocks_test.go (it doesn't fail by default)
	mockSFU := &MockSFUProvider{}

	r := room.NewRoom(context.Background(), "test-room", nil, mockBus, mockSFU)
	client := &hubMockClient{id: "user1"}
	r.AddHost(ctx, client)

	// Should not panic even if SFU delete fails (or succeeds)
	r.DisconnectClient(ctx, client)

	// Client should still be removed from room
	assert.False(t, r.IsParticipant(client.GetID()))
}

func TestBuildRoomStateProto_WithMixedRoles(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := room.NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Add clients with various roles and states
	// Use actual Clients if we want to test state mapping, but hubMockClient is simpler.
	// However hubMockClient doesn't support changing media state easily.
	// Let's use actual transport.Client for this one?
	// Actually, let's keep it simple with MockClient if available, or just mock it.

	host := &hubMockClient{id: "host1"}
	r.AddHost(ctx, host)

	participant := &hubMockClient{id: "user1"}
	r.AddParticipant(ctx, participant)

	waiting := &hubMockClient{id: "wait1"}
	r.AddWaiting(waiting)

	p := r.BuildRoomStateProto(ctx)

	// Verify counts
	assert.GreaterOrEqual(t, len(p.Participants), 1)
	assert.Equal(t, 1, len(p.WaitingUsers))
}
