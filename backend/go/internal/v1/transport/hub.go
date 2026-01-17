package transport

import (
	"context"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/ratelimit"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/room"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"go.uber.org/zap"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/pkg/sfu"

	"github.com/gin-gonic/gin"
)

// Hub serves as the central coordinator for all video conference rooms in the system.
type Hub struct {
	rooms               map[types.RoomIdType]*room.Room  // Registry of active rooms by room ID
	mu                  sync.Mutex                       // Protects concurrent access to rooms map
	validator           types.TokenValidator             // JWT authentication service
	pendingRoomCleanups map[types.RoomIdType]*time.Timer // Timers for delayed room cleanup
	bus                 types.BusService                 // Optional Redis pub/sub for cross-pod messaging
	cleanupGracePeriod  time.Duration                    // Optional grace period for room deletion w/ no users
	devMode             bool                             // Disable rate limiting in development mode
	sfu                 types.SFUProvider
	rateLimiter         *ratelimit.RateLimiter
}

// getSFUClientFromEnv is a helper to connect to SFU based on environment variables.
func getSFUClientFromEnv() types.SFUProvider {
	if os.Getenv("ENABLE_SFU") != "true" {
		logging.Warn(context.Background(), "⚠️  SFU Disabled (ENABLE_SFU != true). App running in Signaling-Only mode.")
		return nil
	}

	sfuAddr := os.Getenv("SFU_ADDR")
	if sfuAddr == "" {
		sfuAddr = "localhost:50051"
	}

	logging.Info(context.Background(), "🔌 SFU Enabled. Connecting...", zap.String("addr", sfuAddr))
	sfuClient, err := sfu.NewSFUClient(sfuAddr)
	if err != nil {
		logging.Error(context.Background(), "SFU Connection Failed", zap.Error(err))
		panic(err)
	}
	logging.Info(context.Background(), "✅ SFU Connected")
	return sfuClient
}

// NewHub creates a new Hub and configures it with its dependencies.
func NewHub(validator types.TokenValidator, bus types.BusService, devMode bool, rateLimiter *ratelimit.RateLimiter) *Hub {
	return NewHubWithSFU(validator, bus, devMode, getSFUClientFromEnv(), rateLimiter)
}

// NewHubWithSFU creates a new Hub with a specific SFU provider.
func NewHubWithSFU(validator types.TokenValidator, bus types.BusService, devMode bool, sfu types.SFUProvider, rateLimiter *ratelimit.RateLimiter) *Hub {
	return &Hub{
		rooms:               make(map[types.RoomIdType]*room.Room),
		validator:           validator,
		pendingRoomCleanups: make(map[types.RoomIdType]*time.Timer),
		bus:                 bus,
		cleanupGracePeriod:  5 * time.Second,
		devMode:             devMode,
		sfu:                 sfu,
		rateLimiter:         rateLimiter,
	}
}

// ServeWs authenticates the user and upgrades to WebSocket connection.
func (h *Hub) ServeWs(c *gin.Context) {
	// 0. Rate Limiting Check (IP based first)
	// We check this before anything else to save resources
	if !h.rateLimiter.CheckWebSocket(c) {
		return // Response already written by CheckWebSocket
	}

	// 1-3. Validation (pure logic + Gin bridge)
	tokenResult, err := h.extractToken(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token not provided"})
		return
	}

	claims, err := h.authenticateUser(tokenResult.Token)
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
func (h *Hub) HandleConnection(c *gin.Context, conn wsConnection, claims *auth.CustomClaims) {
	roomIdStr := c.Param("roomId")
	username := c.Query("username")

	client, r := h.setupClientConnection(&clientSetupParams{
		RoomID:   types.RoomIdType(roomIdStr),
		UserID:   types.ClientIdType(claims.Subject),
		Username: username,
		Claims:   claims,
		DevMode:  h.devMode,
		Conn:     conn,
	})

	// Track metrics
	metrics.ActiveWebSocketConnections.Inc()

	// Handle connection
	r.HandleClientConnect(client)

	// Start message pumps
	go client.writePump()
	go client.readPump()
}

// removeRoom is a private method for the Hub to clean up empty rooms.
func (h *Hub) removeRoom(roomID types.RoomIdType) {
	h.mu.Lock()

	// Cancel any existing cleanup timer for this room
	if existingTimer, exists := h.pendingRoomCleanups[roomID]; exists {
		existingTimer.Stop()
		delete(h.pendingRoomCleanups, roomID)
	}

	// Schedule room cleanup after grace period
	timer := time.AfterFunc(h.cleanupGracePeriod, func() {
		h.mu.Lock()
		defer h.mu.Unlock()

		// Double-check room still exists and is empty OR hostless before deleting
		if r, ok := h.rooms[roomID]; ok && (r.IsRoomEmpty() || !r.HasHost()) {
			if !r.IsRoomEmpty() {
				logging.Info(context.Background(), "Closing hostless room", zap.String("roomId", string(roomID)))
				r.CloseRoom("Host has not returned.")
			}

			delete(h.rooms, roomID)
			delete(h.pendingRoomCleanups, roomID)

			// Metrics: Track room deletion and cleanup participant gauge
			metrics.ActiveRooms.Dec()
			metrics.RoomParticipants.DeleteLabelValues(string(roomID))

			logging.Info(context.Background(), "Removed room from hub after grace period", zap.String("roomId", string(roomID)), zap.Bool("wasEmpty", r.IsRoomEmpty()))
		} else {
			// Room is no longer empty, cancel cleanup
			delete(h.pendingRoomCleanups, roomID)
			if ok {
				logging.Info(context.Background(), "Cancelled room cleanup - room is active", zap.String("roomId", string(roomID)))
			}
		}
	})

	// Store the timer so we can cancel it if clients reconnect
	h.pendingRoomCleanups[roomID] = timer
	h.mu.Unlock()
}

// getOrCreateRoom retrieves the Room associated with the given RoomId from the Hub.
func (h *Hub) getOrCreateRoom(roomID types.RoomIdType) *room.Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if r, ok := h.rooms[roomID]; ok {
		// Room exists, cancel any pending cleanup
		if timer, hasPendingCleanup := h.pendingRoomCleanups[roomID]; hasPendingCleanup {
			timer.Stop()
			delete(h.pendingRoomCleanups, roomID)
			logging.Info(context.Background(), "Cancelled pending room cleanup due to reconnection", zap.String("roomId", string(roomID)))
		}
		return r
	}

	logging.Info(context.Background(), "Creating new session room", zap.String("roomId", string(roomID)))
	r := room.NewRoom(roomID, h.removeRoom, h.bus, h.sfu)
	h.rooms[roomID] = r

	// Metrics: Track room creation
	metrics.ActiveRooms.Inc()
	return r
}

// Shutdown gracefully closes all active rooms and connections
func (h *Hub) Shutdown(ctx context.Context) error {
	logging.Info(ctx, "Shutting down Hub - closing all active rooms...")

	h.mu.Lock()
	// Cancel all pending cleanup timers
	for roomID, timer := range h.pendingRoomCleanups {
		timer.Stop()
		delete(h.pendingRoomCleanups, roomID)
		logging.GetLogger().Debug("Cancelled pending cleanup timer", zap.String("roomId", string(roomID)))
	}

	// Get snapshot of all rooms
	rooms := make([]*room.Room, 0, len(h.rooms))
	for _, r := range h.rooms {
		rooms = append(rooms, r)
	}
	h.mu.Unlock()

	// Close all rooms (sends close frames to WebSocket connections)
	for _, r := range rooms {
		r.CloseRoom("Server shutting down")
	}

	logging.Info(ctx, "All rooms closed", zap.Int("count", len(rooms)))

	// Close SFU connection if present
	if h.sfu != nil {
		if sfuClient, ok := h.sfu.(interface{ Close() error }); ok {
			if err := sfuClient.Close(); err != nil {
				logging.Error(ctx, "Failed to close SFU connection", zap.Error(err))
				return err
			}
			logging.Info(ctx, "SFU connection closed")
		}
	}

	return nil
}
