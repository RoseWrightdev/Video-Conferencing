package transport

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"sync"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/room"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

// tokenExtractionResult holds the result of token extraction
type tokenExtractionResult struct {
	Token                  string
	FromHeader             bool
	HasAccessTokenProtocol bool
}

// extractToken extracts JWT token from Sec-WebSocket-Protocol header or query param.
func (h *Hub) extractToken(c *gin.Context) (*tokenExtractionResult, error) {
	result := &tokenExtractionResult{}

	// Priority 1: Check Sec-WebSocket-Protocol header
	headerVal := c.GetHeader("Sec-WebSocket-Protocol")
	if headerVal != "" {
		parts := strings.SplitSeq(headerVal, ",")
		for p := range parts {
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
					logging.GetLogger().Debug("Token extracted from Sec-WebSocket-Protocol header")
				}
			}
		}
	}

	if result.Token == "" {
		logging.Warn(context.Background(), "No token provided in request")
		return nil, fmt.Errorf("token not provided")
	}

	return result, nil
}

// validateOrigin checks if the request origin is in the allowed list.
func validateOrigin(r *http.Request, allowedOrigins []string) error {
	origin := r.Header.Get("Origin")
	if origin == "" {
		logging.GetLogger().Debug("No origin header - allowing non-browser client")
		return nil // Allow non-browser clients (e.g., for testing)
	}

	originURL, err := url.Parse(origin)
	if err != nil {
		logging.Warn(context.Background(), "Invalid origin URL", zap.String("origin", origin), zap.Error(err))
		return fmt.Errorf("invalid origin URL: %w", err)
	}

	for _, allowed := range allowedOrigins {
		allowedURL, err := url.Parse(allowed)
		if err != nil {
			continue
		}
		// Check if the scheme and host match
		if originURL.Scheme == allowedURL.Scheme && originURL.Host == allowedURL.Host {
			logging.GetLogger().Debug("Origin validated", zap.String("origin", origin))
			return nil
		}
	}

	logging.Warn(context.Background(), "Origin not in allowed list", zap.String("origin", origin), zap.Strings("allowedOrigins", allowedOrigins))
	return fmt.Errorf("origin not allowed: %s", origin)
}

// authenticateUser validates the token and extracts claims.
func (h *Hub) authenticateUser(token string) (*auth.CustomClaims, error) {
	claims, err := h.validator.ValidateToken(token)
	if err != nil {
		logging.Warn(context.Background(), "Token validation failed", zap.Error(err))
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	logging.GetLogger().Debug("User authenticated", zap.String("userId", claims.Subject), zap.String("name", claims.Name))
	return claims, nil
}

// clientSetupParams holds parameters for setting up a client connection
type clientSetupParams struct {
	RoomID   types.RoomIdType
	UserID   types.ClientIdType
	Username string // From query param
	Claims   *auth.CustomClaims
	DevMode  bool
	Conn     wsConnection
}

// setupClientConnection creates or retrieves a room and initializes a client.
func (h *Hub) setupClientConnection(params *clientSetupParams) (*Client, *room.Room) {
	r := h.getOrCreateRoom(params.RoomID)

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
		room:             r,
		ID:               params.UserID,
		DisplayName:      types.DisplayNameType(displayName),
		Role:             types.RoleTypeHost, // Default role
		rateLimitEnabled: !params.DevMode,
	}

	// In Dev Mode, override ID to be unique based on username if provided.
	if params.DevMode && params.Username != "" {
		client.ID = types.ClientIdType(params.Username)
		logging.Info(context.Background(), "Dev Mode: Overriding ClientID to username for uniqueness", zap.String("newID", string(client.ID)))
	}

	logging.Info(context.Background(), "Setting up client connection",
		zap.String("usernameParam", params.Username),
		zap.String("finalDisplayName", displayName),
		zap.String("clientId", string(params.UserID)),
		zap.String("roomId", string(params.RoomID)))

	return client, r
}

// upgradeWebSocket handles the WebSocket upgrade process.
func (h *Hub) upgradeWebSocket(c *gin.Context, allowedOrigins []string, tokenResult *tokenExtractionResult) (wsConnection, error) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
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
		logging.Error(c.Request.Context(), "Failed to upgrade connection", zap.Error(err))
		return nil, err
	}

	return conn, nil
}
