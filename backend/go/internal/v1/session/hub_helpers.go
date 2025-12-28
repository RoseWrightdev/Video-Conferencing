package session

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"sync"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// tokenExtractionResult holds the result of token extraction
type tokenExtractionResult struct {
	Token                  string
	FromHeader             bool
	HasAccessTokenProtocol bool
}

// extractToken extracts JWT token from Sec-WebSocket-Protocol header or query param.
// Priority 1: Sec-WebSocket-Protocol header (secure)
// Priority 2: Query parameter "token" (legacy/less secure)
func (h *Hub) extractToken(c *gin.Context) (*tokenExtractionResult, error) {
	result := &tokenExtractionResult{}

	// Priority 1: Check Sec-WebSocket-Protocol header
	headerVal := c.GetHeader("Sec-WebSocket-Protocol")
	if headerVal != "" {
		parts := strings.Split(headerVal, ",")
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p == "access_token" {
				result.HasAccessTokenProtocol = true
				continue
			}
			// Treat any other part as a potential token
			if p != "" {
				// Try to validate it - if valid, use it
				_, err := h.validator.ValidateToken(p)
				if err == nil {
					result.Token = p
					result.FromHeader = true
					slog.Debug("Token extracted from Sec-WebSocket-Protocol header")
				}
			}
		}
	}

	// Priority 2: Fallback to URL Query (Legacy/Less Secure)
	if result.Token == "" {
		result.Token = c.Query("token")
		result.FromHeader = false
		if result.Token != "" {
			slog.Warn("Token extracted from query parameter (legacy/less secure)")
		}
	}

	if result.Token == "" {
		slog.Warn("No token provided in request")
		return nil, fmt.Errorf("token not provided")
	}

	return result, nil
}

// validateOrigin checks if the request origin is in the allowed list.
// Returns nil if allowed, error if blocked.
func validateOrigin(r *http.Request, allowedOrigins []string) error {
	origin := r.Header.Get("Origin")
	if origin == "" {
		slog.Debug("No origin header - allowing non-browser client")
		return nil // Allow non-browser clients (e.g., for testing)
	}

	originURL, err := url.Parse(origin)
	if err != nil {
		slog.Warn("Invalid origin URL", "origin", origin, "error", err)
		return fmt.Errorf("invalid origin URL: %w", err)
	}

	for _, allowed := range allowedOrigins {
		allowedURL, err := url.Parse(allowed)
		if err != nil {
			continue
		}
		// Check if the scheme and host match
		if originURL.Scheme == allowedURL.Scheme && originURL.Host == allowedURL.Host {
			slog.Debug("Origin validated", "origin", origin)
			return nil
		}
	}

	slog.Warn("Origin not in allowed list", "origin", origin, "allowedOrigins", allowedOrigins)
	return fmt.Errorf("origin not allowed: %s", origin)
}

// authenticateUser validates the token and extracts claims.
func (h *Hub) authenticateUser(ctx context.Context, token string) (*auth.CustomClaims, error) {
	claims, err := h.validator.ValidateToken(token)
	if err != nil {
		slog.Warn("Token validation failed", "error", err)
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	slog.Debug("User authenticated", "userId", claims.Subject, "name", claims.Name)
	return claims, nil
}

// clientSetupParams holds parameters for setting up a client connection
type clientSetupParams struct {
	RoomID   RoomIdType
	UserID   ClientIdType
	Username string // From query param
	Claims   *auth.CustomClaims
	DevMode  bool
	Conn     wsConnection
}

// setupClientConnection creates or retrieves a room and initializes a client.
// Returns the client and room, ready for connection handling.
func (h *Hub) setupClientConnection(params *clientSetupParams) (*Client, *Room) {
	room := h.getOrCreateRoom(params.RoomID)

	// Determine display name
	displayName := params.Username // Use frontend-provided username first
	if displayName == "" {
		// Fallback to JWT claims if username param not provided
		displayName = params.Claims.Subject // Fallback to subject if name is not in token
		if params.Claims.Name != "" {
			displayName = params.Claims.Name
		} else if params.Claims.Email != "" {
			// Use email prefix as display name
			if parts := strings.Split(params.Claims.Email, "@"); len(parts) > 0 {
				displayName = parts[0]
			}
		}
	}

	client := &Client{
		conn:             params.Conn,
		send:             make(chan []byte, 256),
		prioritySend:     make(chan []byte, 256),
		room:             room,
		ID:               params.UserID,
		DisplayName:      DisplayNameType(displayName),
		Role:             RoleTypeHost, // Default role
		rateLimitEnabled: !params.DevMode,
	}

	// In Dev Mode, if using MockValidator, multiple tabs will have same ID ("dev-user-123").
	// This breaks waiting room logic (same user is both Host and Waiting).
	// We override ID to be unique based on username if provided.
	if params.DevMode && params.Username != "" {
		client.ID = ClientIdType(params.Username)
		slog.Info("Dev Mode: Overriding ClientID to username for uniqueness", "newID", client.ID)
	}

	slog.Info("Setting up client connection",
		"usernameParam", params.Username,
		"finalDisplayName", displayName,
		"clientId", params.UserID,
		"roomId", params.RoomID)

	return client, room
}

// upgradeWebSocket handles the WebSocket upgrade process.
// This is isolated I/O glue (0% coverage acceptable).
func (h *Hub) upgradeWebSocket(c *gin.Context, allowedOrigins []string, tokenResult *tokenExtractionResult) (wsConnection, error) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			// Origin already validated above
			return validateOrigin(r, allowedOrigins) == nil
		},
		WriteBufferPool: &sync.Pool{
			New: func() any {
				return make([]byte, 4096)
			},
		},
	}

	// Prepare response header
	responseHeader := http.Header{}
	if tokenResult.FromHeader {
		if tokenResult.HasAccessTokenProtocol {
			responseHeader.Set("Sec-WebSocket-Protocol", "access_token")
		} else {
			responseHeader.Set("Sec-WebSocket-Protocol", tokenResult.Token)
		}
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, responseHeader)
	if err != nil {
		slog.Error("Failed to upgrade connection", "error", err)
		return nil, err
	}

	return conn, nil
}
