// Package session - hub.go
//
// This file implements the Hub, which serves as the central coordinator for all
// video conference rooms in the system. The Hub manages room lifecycle, handles
// WebSocket upgrades, and provides authentication for incoming connections.
//
// Hub Responsibilities:
//   - WebSocket connection upgrades and authentication
//   - Room creation, retrieval, and cleanup
//   - JWT token validation for security
//   - Resource management across multiple concurrent rooms
//
// Scaling Design:
// The Hub is designed to handle multiple rooms concurrently with proper
// synchronization. Each room operates independently while the Hub coordinates
// their lifecycle and provides shared services like authentication.
//
// Security Features:
//   - JWT token validation for all connections
//   - Secure WebSocket upgrade process
//   - Protection against unauthorized access
package session

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/pkg/sfu"

	"github.com/gin-gonic/gin"
)

// TokenValidator defines the interface for JWT token authentication services.
// This abstraction allows the Hub to work with different authentication providers
// while maintaining a consistent interface for token validation.
//
// The interface supports:
//   - Token string validation and parsing
//   - Extraction of user claims and metadata
//   - Authentication error handling
//
// Implementation:
// In production, this is typically implemented by an Auth0 validator or
// similar JWT service. In tests, mock implementations can simulate various
// authentication scenarios including valid tokens, expired tokens, and
// malformed tokens.
type TokenValidator interface {
	ValidateToken(tokenString string) (*auth.CustomClaims, error)
}

// BusService defines the interface for distributed pub/sub messaging.
// This abstraction allows the Hub to work with or without Redis for scaling.
// When nil, the system operates in single-instance mode (no cross-pod messaging).
type BusService interface {
	Publish(ctx context.Context, roomID string, event string, payload any, senderID string, roles []string) error
	PublishDirect(ctx context.Context, targetUserId string, event string, payload any, senderID string) error
	Subscribe(ctx context.Context, roomID string, handler func(bus.PubSubPayload))
	Close() error
	// Redis Set operations for distributed state management
	SetAdd(ctx context.Context, key string, value string) error
	SetRem(ctx context.Context, key string, value string) error
	SetMembers(ctx context.Context, key string) ([]string, error)
}

// Hub serves as the central coordinator for all video conference rooms in the system.
// It manages room lifecycle, handles WebSocket upgrades, and provides authentication
// services for incoming client connections.
//
// Architecture:
// The Hub acts as a factory and registry for Room instances, creating them on-demand
// when clients connect and cleaning them up when they become empty. This design
// allows for efficient resource utilization and automatic scaling.
//
// Concurrency:
// The Hub uses a mutex to protect its rooms map from concurrent access during
// room creation, retrieval, and deletion operations. Individual rooms handle
// their own internal synchronization independently.
//
// Room Management:
//   - Creates rooms dynamically when first client connects
//   - Routes clients to appropriate existing rooms
//   - Cleans up empty rooms to prevent memory leaks
//   - Maintains room registry for efficient lookup
//
// Security:
// All connections must provide valid JWT tokens which are validated through
// the TokenValidator interface before WebSocket upgrade is permitted.
type Hub struct {
	rooms               map[RoomIdType]*Room       // Registry of active rooms by room ID
	mu                  sync.Mutex                 // Protects concurrent access to rooms map
	validator           TokenValidator             // JWT authentication service
	pendingRoomCleanups map[RoomIdType]*time.Timer // Timers for delayed room cleanup
	bus                 BusService                 // Optional Redis pub/sub for cross-pod messaging
	cleanupGracePeriod  time.Duration              // Optional grace period for room deletion w/ no users
	devMode             bool                       // Disable rate limiting in development mode
	sfu                 SFUProvider
}

// NewHub creates a new Hub and configures it with its dependencies.
// Parameters:
//   - validator: JWT token validator for authentication
//   - bus: Optional Redis pub/sub service for distributed messaging (nil for single-instance mode)
//   - devMode: Disable rate limiting for development (allows rapid WebSocket messages)
//
// getSFUClientFromEnv is a helper to connect to SFU based on environment variables.
// This is isolated I/O glue (0% coverage acceptable).
func getSFUClientFromEnv() SFUProvider {
	if os.Getenv("ENABLE_SFU") != "true" {
		slog.Warn("⚠️  SFU Disabled (ENABLE_SFU != true). App running in Signaling-Only mode.")
		return nil
	}

	sfuAddr := os.Getenv("SFU_ADDR")
	if sfuAddr == "" {
		sfuAddr = "localhost:50051"
	}

	slog.Info("🔌 SFU Enabled. Connecting...", "addr", sfuAddr)
	sfuClient, err := sfu.NewSFUClient(sfuAddr)
	if err != nil {
		slog.Error("SFU Connection Failed", "error", err)
		panic(err)
	}
	slog.Info("✅ SFU Connected")
	return sfuClient
}

// NewHub creates a new Hub and configures it with its dependencies.
func NewHub(validator TokenValidator, bus BusService, devMode bool) *Hub {
	return NewHubWithSFU(validator, bus, devMode, getSFUClientFromEnv())
}

// NewHubWithSFU creates a new Hub with a specific SFU provider.
// This allows testing the Hub without connecting to a real SFU.
func NewHubWithSFU(validator TokenValidator, bus BusService, devMode bool, sfu SFUProvider) *Hub {
	return &Hub{
		rooms:               make(map[RoomIdType]*Room),
		validator:           validator,
		pendingRoomCleanups: make(map[RoomIdType]*time.Timer),
		bus:                 bus,
		cleanupGracePeriod:  5 * time.Second,
		devMode:             devMode,
		sfu:                 sfu,
	}
}

// ServeWs authenticates the user and upgrades to WebSocket connection.
// It validates the token, checks origin, establishes a WebSocket connection,
// creates or retrieves a room, initializes a new client, and starts message pumps.
//
// Parameters:
//   - c: *gin.Context representing the HTTP request context.
//
// Responses:
//   - 401 Unauthorized if the token is missing or invalid.
//   - 403 Forbidden if origin is not allowed.
//   - Upgrades to WebSocket on success.
func (h *Hub) ServeWs(c *gin.Context) {
	ctx := context.Background()

	// 1-3. Validation (pure logic + Gin bridge)
	tokenResult, err := h.extractToken(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token not provided"})
		return
	}

	claims, err := h.authenticateUser(ctx, tokenResult.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	allowedOrigins := auth.GetAllowedOriginsFromEnv("ALLOWED_ORIGINS", []string{"http://localhost:3000"})
	if err := validateOrigin(c.Request, allowedOrigins); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "origin not allowed"})
		return
	}

	// 4-6. Upgrade to WebSocket (isolated I/O glue)
	conn, err := h.upgradeWebSocket(c, allowedOrigins, tokenResult)
	if err != nil {
		return
	}

	// 7-10. Setup and start (orchestration logic)
	h.HandleConnection(c, conn, claims)
}

// HandleConnection takes an established WebSocket connection and sets up the client/room.
// This is pure orchestration logic, fully testable with a mock connection.
func (h *Hub) HandleConnection(c *gin.Context, conn wsConnection, claims *auth.CustomClaims) {
	roomId := c.Param("roomId")
	username := c.Query("username")

	client, room := h.setupClientConnection(&clientSetupParams{
		RoomID:   RoomIdType(roomId),
		UserID:   ClientIdType(claims.Subject),
		Username: username,
		Claims:   claims,
		DevMode:  h.devMode,
		Conn:     conn,
	})

	// Track metrics
	metrics.ActiveWebSocketConnections.Inc()

	// Handle connection
	room.handleClientConnect(client)

	// Start message pumps
	go client.writePump()
	go client.readPump()
}

// removeRoom is a private method for the Hub to clean up empty rooms.
// It implements a grace period before actually removing the room,
// allowing clients to reconnect without losing the room state. This prevents
// the race condition where a client refresh causes a new room to be created.
func (h *Hub) removeRoom(roomId RoomIdType) {
	h.mu.Lock()

	// Cancel any existing cleanup timer for this room
	if existingTimer, exists := h.pendingRoomCleanups[roomId]; exists {
		existingTimer.Stop()
		delete(h.pendingRoomCleanups, roomId)
	}

	// Schedule room cleanup after grace period
	timer := time.AfterFunc(h.cleanupGracePeriod, func() {
		h.mu.Lock()
		defer h.mu.Unlock()

		// Double-check room still exists and is empty before deleting
		if room, ok := h.rooms[roomId]; ok && room.isRoomEmpty() {
			delete(h.rooms, roomId)
			delete(h.pendingRoomCleanups, roomId)

			// Metrics: Track room deletion and cleanup participant gauge
			metrics.ActiveRooms.Dec()
			metrics.RoomParticipants.DeleteLabelValues(string(roomId))

			slog.Info("Removed empty room from hub after grace period", "roomId", roomId)
		} else {
			// Room is no longer empty, cancel cleanup
			delete(h.pendingRoomCleanups, roomId)
			if ok {
				slog.Info("Cancelled room cleanup - room is no longer empty", "roomId", roomId)
			}
		}
	})

	// Store the timer so we can cancel it if clients reconnect
	h.pendingRoomCleanups[roomId] = timer
	h.mu.Unlock()
}

// getOrCreateRoom retrieves the Room associated with the given RoomId from the Hub.
// If the Room does not exist, it creates a new Room, stores it in the Hub, and returns it.
// If a room cleanup is pending for this roomId, the cleanup is cancelled and the existing room is returned.
// This method is safe for concurrent use.
func (h *Hub) getOrCreateRoom(roomId RoomIdType) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if room, ok := h.rooms[roomId]; ok {
		// Room exists, cancel any pending cleanup
		if timer, hasPendingCleanup := h.pendingRoomCleanups[roomId]; hasPendingCleanup {
			timer.Stop()
			delete(h.pendingRoomCleanups, roomId)
			slog.Info("Cancelled pending room cleanup due to reconnection", "roomId", roomId)
		}
		return room
	}

	slog.Info("Creating new session room", "roomroomId", roomId)
	// Pass the bus interface directly - no type assertion needed
	room := NewRoom(roomId, h.removeRoom, h.bus, h.sfu)
	h.rooms[roomId] = room

	// Metrics: Track room creation
	metrics.ActiveRooms.Inc()
	return room
}
