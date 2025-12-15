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
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
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
}

// NewHub creates a new Hub and configures it with its dependencies.
// Parameters:
//   - validator: JWT token validator for authentication
//   - bus: Optional Redis pub/sub service for distributed messaging (nil for single-instance mode)
func NewHub(validator TokenValidator, bus BusService) *Hub {
	return &Hub{
		rooms:               make(map[RoomIdType]*Room),
		validator:           validator,
		pendingRoomCleanups: make(map[RoomIdType]*time.Timer),
		bus:                 bus,
		cleanupGracePeriod:  5 * time.Second,
	}
}

// ServeWs authenticates the user and hands them off to the room.
// ServeWs upgrades an HTTP request to a WebSocket connection for real-time communication.
// It authenticates the user using a JWT token provided as a query parameter, validates the token,
// and establishes a WebSocket connection. Upon successful authentication and upgrade, it creates
// or retrieves a room based on the roomId path parameter, initializes a new client, and registers
// the client with the room. The client's read and write goroutines are started to handle message
// exchange over the WebSocket connection.
//
// Parameters:
//   - c: *gin.Context representing the HTTP request context.
//
// Responses:
//   - 401 Unauthorized if the token is missing or invalid.
//   - Upgrades to WebSocket on success.
func (h *Hub) ServeWs(c *gin.Context) {
	// --- AUTHENTICATION ---
	tokenString := c.Query("token") // from Auth0
	if tokenString == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token not provided"})
		return
	}

	claims, err := h.validator.ValidateToken(tokenString)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	allowedOrigins := GetAllowedOriginsFromEnv("ALLOWED_ORIGINS", []string{"http://localhost:3000"})
	upgrader := websocket.Upgrader{
		// This is the secure way to check the origin.
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true // Allow non-browser clients (e.g., for testing)
			}
			originURL, err := url.Parse(origin)
			if err != nil {
				return false
			}

			for _, allowed := range allowedOrigins {
				allowedURL, err := url.Parse(allowed)
				if err != nil {
					continue
				}
				// Check if the scheme and host match.
				if originURL.Scheme == allowedURL.Scheme && originURL.Host == allowedURL.Host {
					return true
				}
			}
			return false
		},
		WriteBufferPool: &sync.Pool{
			New: func() any {
				// Pre-allocate 4KB buffers
				return make([]byte, 4096)
			},
		},
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Error("Failed to upgrade connection", "error", err)
		return
	}

	// --- CLIENT & ROOM SETUP ---
	roomId := c.Param("roomId")
	room := h.getOrCreateRoom(RoomIdType(roomId))

	// Get username from query parameter (sent by frontend with session name/email)
	usernameParam := c.Query("username")

	displayName := usernameParam // Use frontend-provided username first
	if displayName == "" {
		// Fallback to JWT claims if username param not provided
		displayName = claims.Subject // Fallback to subject if name is not in token
		if claims.Name != "" {
			displayName = claims.Name
		} else if claims.Email != "" {
			// Use email prefix as display name
			if parts := strings.Split(claims.Email, "@"); len(parts) > 0 {
				displayName = parts[0]
			}
		}
	}

	slog.Info("Setting display name for client",
		"usernameParam", usernameParam,
		"finalDisplayName", displayName,
		"clientId", claims.Subject)

	client := &Client{
		conn:        conn,
		send:        make(chan []byte, 256),
		room:        room,
		ID:          ClientIdType(claims.Subject),
		DisplayName: DisplayNameType(displayName),
		Role:        RoleTypeHost, // Default role, should be derived from token scopes
	}

	// Metrics: Track WebSocket connection (defer ensures cleanup on disconnect)
	metrics.ActiveWebSocketConnections.Inc()

	room.handleClientConnect(client)

	// Start the client's goroutines.
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
		if room, ok := h.rooms[roomId]; ok && len(room.participants) == 0 && len(room.hosts) == 0 && len(room.sharingScreen) == 0 {
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
	// Type assert bus service to *bus.Service or pass nil
	var busService *bus.Service
	if h.bus != nil {
		// The bus field is an interface, but NewRoom expects *bus.Service
		// In production, h.bus will be *bus.Service, so this assertion is safe
		if bs, ok := h.bus.(*bus.Service); ok {
			busService = bs
		}
	}
	room := NewRoom(roomId, h.removeRoom, busService)
	h.rooms[roomId] = room

	// Metrics: Track room creation
	metrics.ActiveRooms.Inc()
	return room
}
