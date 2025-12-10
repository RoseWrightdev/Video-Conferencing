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
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"Social-Media/backend/go/internal/v1/auth"

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
	rooms     map[RoomIdType]*Room // Registry of active rooms by room ID
	mu        sync.Mutex           // Protects concurrent access to rooms map
	validator TokenValidator       // JWT authentication service
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

	room.handleClientConnect(client)

	// Start the client's goroutines.
	go client.writePump()
	go client.readPump()
}

// NewHub creates a new Hub and configures it with its dependencies.
func NewHub(validator TokenValidator) *Hub {
	return &Hub{
		rooms:     make(map[RoomIdType]*Room),
		validator: validator,
	}
}

// removeRoom is a private method for the Hub to clean up empty rooms.
func (h *Hub) removeRoom(roomId RoomIdType) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Check if the room still exists and is empty before deleting.
	if room, ok := h.rooms[roomId]; ok && len(room.participants) == 0 {
		delete(h.rooms, roomId)
		slog.Info("Removed empty room from hub", "roomId", roomId)
	}
}

// getOrCreateRoom retrieves the Room associated with the given RoomId from the Hub.
// If the Room does not exist, it creates a new Room, stores it in the Hub, and returns it.
// This method is safe for concurrent use.
func (h *Hub) getOrCreateRoom(roomId RoomIdType) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if room, ok := h.rooms[roomId]; ok {
		return room
	}

	slog.Info("Creating new session room", "roomroomId", roomId)
	room := NewRoom(roomId, h.removeRoom)
	h.rooms[roomId] = room
	return room
}
