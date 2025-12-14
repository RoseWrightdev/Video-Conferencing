package session

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// MockValidator is a mock implementation of the TokenValidator interface for testing.
type MockValidator struct {
	ClaimsToReturn *auth.CustomClaims
	ErrorToReturn  error
}

// ValidateToken is the mock implementation. It returns the pre-configured claims and error.
func (m *MockValidator) ValidateToken(tokenString string) (*auth.CustomClaims, error) {
	return m.ClaimsToReturn, m.ErrorToReturn
}

// NewTestHub creates a new Hub with a mock validator for testing purposes.
func NewTestHub(mockValidator TokenValidator) *Hub {
	if mockValidator == nil {
		// Provide a default mock if none is given
		mockValidator = &MockValidator{}
	}
	// Pass nil for bus service in tests (single-instance mode)
	return NewHub(mockValidator, nil)
}

func TestGetOrCreateRoom(t *testing.T) {
	hub := NewTestHub(nil) // Use the default mock validator
	var roomId RoomIdType = "test-room-1"

	// First call should create the room
	room1 := hub.getOrCreateRoom(roomId)
	require.NotNil(t, room1, "getOrCreateRoom should not return nil")
	assert.Equal(t, roomId, room1.ID, "Room ID should match the one provided")

	// Check internal state to be sure
	hub.mu.Lock()
	_, exists := hub.rooms[roomId]
	hub.mu.Unlock()
	assert.True(t, exists, "Room should exist in the hub's map after creation")

	// Second call should return the exact same room instance
	room2 := hub.getOrCreateRoom(roomId)
	assert.Same(t, room1, room2, "Subsequent calls with the same ID should return the same room instance")
}

func TestServeWs_AuthFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("should fail if token is missing", func(t *testing.T) {
		hub := NewTestHub(nil)
		router := gin.New()
		router.GET("/ws/:roomId", hub.ServeWs)

		req := httptest.NewRequest("GET", "/ws/test-room", nil) // No token query param
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code, "Should return 401 Unauthorized if token is missing")
	})

	t.Run("should fail if token is invalid", func(t *testing.T) {
		// Configure the mock validator to return an error
		mockValidator := &MockValidator{
			ErrorToReturn: assert.AnError,
		}
		hub := NewTestHub(mockValidator)
		router := gin.New()
		router.GET("/ws/:roomId", hub.ServeWs)

		req := httptest.NewRequest("GET", "/ws/test-room?token=invalid-token", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code, "Should return 401 Unauthorized if token is invalid")
	})
}

func TestRemoveHub(t *testing.T) {
	hub := NewTestHub(nil)
	var testID RoomIdType = "test_room"
	hub.rooms[testID] = NewTestRoom(testID, nil)

	// removeRoom schedules async deletion after 5 seconds grace period
	hub.removeRoom(testID)

	// Room should still exist immediately (not yet deleted)
	assert.NotEmpty(t, hub.rooms, "Room should not be deleted immediately")
	assert.NotNil(t, hub.rooms[testID], "Room should still exist during grace period")

	// Timer should be registered
	assert.NotNil(t, hub.pendingRoomCleanups[testID], "Cleanup timer should be registered")

	// Wait for the async cleanup to complete (grace period is 5 seconds)
	time.Sleep(6 * time.Second)

	// Now the room should be deleted
	hub.mu.Lock()
	defer hub.mu.Unlock()
	assert.Empty(t, hub.rooms, "Room should be deleted after grace period")
	assert.Nil(t, hub.rooms[testID], "Room map entry should be nil")
	assert.Empty(t, hub.pendingRoomCleanups, "Cleanup timer should be removed")
}
