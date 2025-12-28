package session

import (
	"context"
	"testing"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

// MockTokenValidator implements TokenValidator for testing
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

	roomId := RoomIdType("new-room")
	room := hub.getOrCreateRoom(roomId)

	assert.NotNil(t, room)
	assert.Equal(t, roomId, room.ID)
	assert.Contains(t, hub.rooms, roomId)
	assert.Equal(t, 1, len(hub.rooms))
}

func TestGetOrCreateRoom_ExistingRoom(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)

	roomId := RoomIdType("existing-room")

	// Create room first time
	room1 := hub.getOrCreateRoom(roomId)

	// Get same room second time
	room2 := hub.getOrCreateRoom(roomId)

	assert.Equal(t, room1, room2)
	assert.Equal(t, 1, len(hub.rooms))
}

func TestRemoveRoom(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)
	hub.cleanupGracePeriod = 100 * time.Millisecond

	roomId := RoomIdType("test-room")
	_ = hub.getOrCreateRoom(roomId)

	// Room should exist
	assert.Contains(t, hub.rooms, roomId)

	// Trigger removal
	hub.removeRoom(roomId)

	// Should schedule cleanup
	assert.Contains(t, hub.pendingRoomCleanups, roomId)

	// Wait for grace period
	time.Sleep(200 * time.Millisecond)

	// Room should be removed
	assert.NotContains(t, hub.rooms, roomId)
	assert.NotContains(t, hub.pendingRoomCleanups, roomId)
}

func TestRemoveRoom_CancelOnReconnect(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)
	hub.cleanupGracePeriod = 200 * time.Millisecond

	roomId := RoomIdType("test-room")
	room := hub.getOrCreateRoom(roomId)

	// Trigger removal
	hub.removeRoom(roomId)
	assert.Contains(t, hub.pendingRoomCleanups, roomId)

	// Client reconnects before cleanup
	time.Sleep(50 * time.Millisecond)
	room2 := hub.getOrCreateRoom(roomId)

	// Should cancel cleanup
	assert.Equal(t, room, room2)
	assert.NotContains(t, hub.pendingRoomCleanups, roomId)

	// Wait past original grace period
	time.Sleep(200 * time.Millisecond)

	// Room should still exist
	assert.Contains(t, hub.rooms, roomId)
}

func TestRemoveRoom_NonEmptyRoom(t *testing.T) {
	ctx := context.Background()
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)
	hub.cleanupGracePeriod = 100 * time.Millisecond

	roomId := RoomIdType("test-room")
	room := hub.getOrCreateRoom(roomId)

	// Add a participant
	client := createTestClient("user1", "User", RoleTypeParticipant)
	room.addParticipant(ctx, client)

	// Trigger removal
	hub.removeRoom(roomId)

	// Wait for grace period
	time.Sleep(200 * time.Millisecond)

	// Room should NOT be removed (has participants)
	assert.Contains(t, hub.rooms, roomId)
	assert.NotContains(t, hub.pendingRoomCleanups, roomId)
}

func TestConcurrentRoomCreation(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)

	// Create multiple rooms concurrently
	roomIds := []RoomIdType{"room1", "room2", "room3", "room4", "room5"}

	done := make(chan bool, len(roomIds))
	for _, id := range roomIds {
		go func(roomId RoomIdType) {
			room := hub.getOrCreateRoom(roomId)
			assert.NotNil(t, room)
			done <- true
		}(id)
	}

	// Wait for all goroutines
	for range roomIds {
		<-done
	}

	// All rooms should exist
	assert.Equal(t, len(roomIds), len(hub.rooms))
	for _, id := range roomIds {
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

	roomId := RoomIdType("test-room")
	hub.getOrCreateRoom(roomId)

	// Trigger removal multiple times
	hub.removeRoom(roomId)
	time.Sleep(50 * time.Millisecond)
	hub.removeRoom(roomId)
	time.Sleep(50 * time.Millisecond)
	hub.removeRoom(roomId)

	// Should only have one timer
	assert.Contains(t, hub.pendingRoomCleanups, roomId)

	// Wait for cleanup
	time.Sleep(300 * time.Millisecond)

	// Room should be cleaned up
	assert.NotContains(t, hub.rooms, roomId)
}

func TestRoomIsolation(t *testing.T) {
	ctx := context.Background()
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)

	room1 := hub.getOrCreateRoom("room1")
	room2 := hub.getOrCreateRoom("room2")

	client1 := createTestClient("user1", "User 1", RoleTypeHost)
	client2 := createTestClient("user2", "User 2", RoleTypeHost)

	room1.addHost(ctx, client1)
	room2.addHost(ctx, client2)

	// Rooms should be independent
	assert.Equal(t, client1, room1.clients[client1.ID])
	_, ok := room1.clients[client2.ID]
	assert.False(t, ok)
	assert.Equal(t, client2, room2.clients[client2.ID])
	_, ok = room2.clients[client1.ID]
	assert.False(t, ok)
}

func TestCleanupGracePeriod(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false)

	// Default grace period should be set
	assert.Greater(t, hub.cleanupGracePeriod, time.Duration(0))
}
