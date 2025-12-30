package transport

import (
	"context"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

// MockTokenValidator implements types.TokenValidator for testing
type MockTokenValidator struct {
	shouldFail bool
}

func (m *MockTokenValidator) ValidateToken(tokenString string) (*auth.CustomClaims, error) {
	if m.shouldFail {
		return nil, assert.AnError
	}
	return &auth.CustomClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "test-user-123",
		},
		Name:  "Test User",
		Email: "test@example.com",
	}, nil
}

// Simple mock client for hub tests
type hubMockClient struct {
	id          types.ClientIdType
	displayName types.DisplayNameType
	role        types.RoleType
	audio       bool
	video       bool
	sharing     bool
	raised      bool
	disconnect  bool
}

func (m *hubMockClient) GetID() types.ClientIdType             { return m.id }
func (m *hubMockClient) GetDisplayName() types.DisplayNameType { return m.displayName }
func (m *hubMockClient) GetRole() types.RoleType               { return m.role }
func (m *hubMockClient) SetRole(r types.RoleType)              { m.role = r }
func (m *hubMockClient) SendProto(msg *pb.WebSocketMessage)    {}
func (m *hubMockClient) GetIsAudioEnabled() bool               { return m.audio }
func (m *hubMockClient) SetIsAudioEnabled(enabled bool)        { m.audio = enabled }
func (m *hubMockClient) GetIsVideoEnabled() bool               { return m.video }
func (m *hubMockClient) SetIsVideoEnabled(enabled bool)        { m.video = enabled }
func (m *hubMockClient) GetIsScreenSharing() bool              { return m.sharing }
func (m *hubMockClient) SetIsScreenSharing(enabled bool)       { m.sharing = enabled }
func (m *hubMockClient) GetIsHandRaised() bool                 { return m.raised }
func (m *hubMockClient) SetIsHandRaised(enabled bool)          { m.raised = enabled }
func (m *hubMockClient) Disconnect()                           { m.disconnect = true }

func TestNewHub(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}

	hub := NewHub(validator, mockBus, false)

	assert.NotNil(t, hub)
	assert.NotNil(t, hub.rooms)
	assert.NotNil(t, hub.pendingRoomCleanups)
	assert.Equal(t, validator, hub.validator)
	assert.Equal(t, mockBus, hub.bus)
	assert.False(t, hub.devMode)
}

func TestGetOrCreateRoom_NewRoom(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)

	roomID := types.RoomIdType("new-room")
	r := hub.getOrCreateRoom(roomID)

	assert.NotNil(t, r)
	assert.Equal(t, roomID, r.GetID())
	assert.Contains(t, hub.rooms, roomID)
	assert.Equal(t, 1, len(hub.rooms))
}

func TestGetOrCreateRoom_ExistingRoom(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)

	roomID := types.RoomIdType("existing-room")

	// Create room first time
	room1 := hub.getOrCreateRoom(roomID)

	// Get same room second time
	room2 := hub.getOrCreateRoom(roomID)

	assert.Equal(t, room1, room2)
	assert.Equal(t, 1, len(hub.rooms))
}

func TestRemoveRoom(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)
	hub.cleanupGracePeriod = 100 * time.Millisecond

	roomID := types.RoomIdType("test-room")
	_ = hub.getOrCreateRoom(roomID)

	// Room should exist
	assert.Contains(t, hub.rooms, roomID)

	// Trigger removal
	hub.removeRoom(roomID)

	// Should schedule cleanup
	assert.Contains(t, hub.pendingRoomCleanups, roomID)

	// Wait for grace period
	time.Sleep(200 * time.Millisecond)

	// Room should be removed
	assert.NotContains(t, hub.rooms, roomID)
	assert.NotContains(t, hub.pendingRoomCleanups, roomID)
}

func TestRemoveRoom_CancelOnReconnect(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)
	hub.cleanupGracePeriod = 200 * time.Millisecond

	roomID := types.RoomIdType("test-room")
	r := hub.getOrCreateRoom(roomID)

	// Trigger removal
	hub.removeRoom(roomID)
	assert.Contains(t, hub.pendingRoomCleanups, roomID)

	// Client reconnects before cleanup
	time.Sleep(50 * time.Millisecond)
	room2 := hub.getOrCreateRoom(roomID)

	// Should cancel cleanup
	assert.Equal(t, r, room2)
	assert.NotContains(t, hub.pendingRoomCleanups, roomID)

	// Wait past original grace period
	time.Sleep(200 * time.Millisecond)

	// Room should still exist
	assert.Contains(t, hub.rooms, roomID)
}

func TestRemoveRoom_NonEmptyRoom(t *testing.T) {
	ctx := context.Background()
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)
	hub.cleanupGracePeriod = 100 * time.Millisecond

	roomID := types.RoomIdType("test-room")
	r := hub.getOrCreateRoom(roomID)

	// Add a participant
	client := &hubMockClient{id: "user1"}
	r.AddHost(ctx, client)

	// Trigger removal
	hub.removeRoom(roomID)

	// Wait for grace period
	time.Sleep(200 * time.Millisecond)

	// Room should NOT be removed (has participants)
	assert.Contains(t, hub.rooms, roomID)
	assert.NotContains(t, hub.pendingRoomCleanups, roomID)
}

func TestConcurrentRoomCreation(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)

	// Create multiple rooms concurrently
	roomIDs := []types.RoomIdType{"room1", "room2", "room3", "room4", "room5"}

	done := make(chan bool, len(roomIDs))
	for _, id := range roomIDs {
		go func(rID types.RoomIdType) {
			r := hub.getOrCreateRoom(rID)
			assert.NotNil(t, r)
			done <- true
		}(id)
	}

	// Wait for all goroutines
	for range roomIDs {
		<-done
	}

	// All rooms should exist
	assert.Equal(t, len(roomIDs), len(hub.rooms))
	for _, id := range roomIDs {
		assert.Contains(t, hub.rooms, id)
	}
}

func TestHubDevMode(t *testing.T) {
	validator := &MockTokenValidator{}
	hub := NewHub(validator, nil, true)

	assert.True(t, hub.devMode)
}

func TestMultipleCleanupTimers(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)
	hub.cleanupGracePeriod = 200 * time.Millisecond

	roomID := types.RoomIdType("test-room")
	hub.getOrCreateRoom(roomID)

	// Trigger removal multiple times
	hub.removeRoom(roomID)
	time.Sleep(50 * time.Millisecond)
	hub.removeRoom(roomID)
	time.Sleep(50 * time.Millisecond)
	hub.removeRoom(roomID)

	// Should only have one timer
	assert.Contains(t, hub.pendingRoomCleanups, roomID)

	// Wait for cleanup
	time.Sleep(300 * time.Millisecond)

	// Room should be cleaned up
	assert.NotContains(t, hub.rooms, roomID)
}

func TestRoomIsolation(t *testing.T) {
	ctx := context.Background()
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)

	room1 := hub.getOrCreateRoom("room1")
	room2 := hub.getOrCreateRoom("room2")

	client1 := &hubMockClient{id: "user1"}
	client2 := &hubMockClient{id: "user2"}

	room1.AddHost(ctx, client1)
	room2.AddHost(ctx, client2)

	// Rooms should be independent
	assert.True(t, room1.IsParticipant(client1.GetID()))
	assert.False(t, room1.IsParticipant(client2.GetID()))
	assert.True(t, room2.IsParticipant(client2.GetID()))
	assert.False(t, room2.IsParticipant(client1.GetID()))
}

func TestCleanupGracePeriod(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)

	// Default grace period should be set
	assert.Greater(t, hub.cleanupGracePeriod, time.Duration(0))
}
