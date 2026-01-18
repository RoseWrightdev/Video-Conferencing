// Package ratelimit implements rate limiting logic using Redis or local memory.
package ratelimit

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/config"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/ulule/limiter/v3"
	mgin "github.com/ulule/limiter/v3/drivers/middleware/gin"
	"github.com/ulule/limiter/v3/drivers/store/memory"
	sredis "github.com/ulule/limiter/v3/drivers/store/redis"
	"go.uber.org/zap"
)

// RateLimiter holds the rate limiter instances
type RateLimiter struct {
	apiGlobal   *limiter.Limiter
	apiPublic   *limiter.Limiter
	apiRooms    *limiter.Limiter
	apiMessages *limiter.Limiter
	wsIP        *limiter.Limiter
	wsUser      *limiter.Limiter
	store       limiter.Store
	redisClient *redis.Client
}

// NewRateLimiter creates a new RateLimiter instance
func NewRateLimiter(cfg *config.Config, redisClient *redis.Client) (*RateLimiter, error) {
	// Parse rates
	apiGlobalRate, err := limiter.NewRateFromFormatted(cfg.RateLimitAPIGlobal)
	if err != nil {
		return nil, fmt.Errorf("invalid API global rate: %w", err)
	}

	apiPublicRate, err := limiter.NewRateFromFormatted(cfg.RateLimitAPIPublic)
	if err != nil {
		return nil, fmt.Errorf("invalid API public rate: %w", err)
	}

	apiRoomsRate, err := limiter.NewRateFromFormatted(cfg.RateLimitAPIRooms)
	if err != nil {
		return nil, fmt.Errorf("invalid API rooms rate: %w", err)
	}

	apiMessagesRate, err := limiter.NewRateFromFormatted(cfg.RateLimitAPIMessages)
	if err != nil {
		return nil, fmt.Errorf("invalid API messages rate: %w", err)
	}

	wsIPRate, err := limiter.NewRateFromFormatted(cfg.RateLimitWsIP)
	if err != nil {
		return nil, fmt.Errorf("invalid WS IP rate: %w", err)
	}

	wsUserRate, err := limiter.NewRateFromFormatted(cfg.RateLimitWsUser)
	if err != nil {
		return nil, fmt.Errorf("invalid WS User rate: %w", err)
	}

	// Create store
	var store limiter.Store
	if redisClient != nil {
		// Use Redis store
		s, err := sredis.NewStoreWithOptions(redisClient, limiter.StoreOptions{
			Prefix: "limiter:v1:",
		})
		if err != nil {
			return nil, fmt.Errorf("failed to create redis store: %w", err)
		}
		store = s
		logging.Info(context.Background(), "✅ Rate limiter using Redis store")
	} else {
		// Fallback to memory store if Redis is disabled (e.g. dev mode without redis)
		store = memory.NewStore()
		logging.Warn(context.Background(), "⚠️  Rate limiter using Memory store (Redis disabled or unavailable)")
	}

	return &RateLimiter{
		apiGlobal:   limiter.New(store, apiGlobalRate),
		apiPublic:   limiter.New(store, apiPublicRate),
		apiRooms:    limiter.New(store, apiRoomsRate),
		apiMessages: limiter.New(store, apiMessagesRate),
		wsIP:        limiter.New(store, wsIPRate),
		wsUser:      limiter.New(store, wsUserRate),
		store:       store,
		redisClient: redisClient,
	}, nil
}

// GlobalMiddleware returns a Gin middleware that enforces global rate limits
func (rl *RateLimiter) GlobalMiddleware() gin.HandlerFunc {
	// We'll manually implement the middleware to handle authenticated vs public logic
	// and to ensure metrics are tracked correctly.

	return func(c *gin.Context) {
		// Skip for health checks or metrics if needed, but usually handled by router structure
		// For now, we apply to everything this middleware wraps.

		var limiterInstance *limiter.Limiter
		var key string
		var limitType string

		// Check if user is authenticated (claims in context)
		// Note: This relies on AuthMiddleware running BEFORE this, or we duplicate extraction logic.
		// However, typical setup is Auth -> RateLimit or RateLimit -> Auth.
		// If RateLimit -> Auth, we can't know if it's a user yet easily without parsing token.
		// Requirement: "Limit: 1000 requests per user per minute" vs "100 requests per IP per minute (unauthenticated)"

		// Attempt to get user ID from context (if auth middleware ran)
		// Or assume public first.

		// Strategy:
		// We'll treat the token presence as "attempting authentication".
		// But for simplicity/robustness, if we can identify a user, we use user limit.
		// If not, we use IP limit.

		// Let's try to extract claims lightly or check if they exist.
		// Since we want to define this in main.go, we should probably put Auth middleware first?
		// But usually RL comes first to protect Auth.
		// For now, let's use IP-based limit as a baseline for everyone, OR strict user limit if auth'd.

		// Let's inspect the header manually to decide.
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			// Has auth header, potential user.
			// Ideally we validate it, but that's expensive.
			// Let's assume for now we use IP limit for *all* calls as a baseline DDOS protection (apiPublic),
			// and then User limit for specific user actions?
			// The requirement says:
			// - 1000 req/user/min
			// - 100 req/IP/min (unauthenticated)

			// This implies if you ARE authenticated, you get 1000. If NOT, you get 100.
			// So we need to know if they are valid.

			// If we put this Middleware AFTER Auth middleware:
			// - Unauthed requests (401) happen before this? No, we want to limit 401s too.

			// Let's use a dual strategy:
			// 1. Always check IP limit for unauthenticated paths?
			// 2. If we are in a protected group, we use User limit.

			// Actually, a simple approach is:
			// Use the `ulule/limiter` middleware for IP limit globally.
			// And manually check User limit in protected routes?

			// But creating a custom middleware is flexible.

			claims, exists := c.Get("claims")
			if exists {
				// Authenticated
				userClaims := claims.(*auth.CustomClaims)
				key = userClaims.Subject
				limiterInstance = rl.apiGlobal
				limitType = "user"
			} else {
				// Unauthenticated
				key = c.ClientIP()
				limiterInstance = rl.apiPublic
				limitType = "ip"
			}
		} else {
			key = c.ClientIP()
			limiterInstance = rl.apiPublic
			limitType = "ip"
		}

		ctx := c.Request.Context()
		context, err := limiterInstance.Get(ctx, key)
		if err != nil {
			// If Redis fails, what do we do? Fail open or closed?
			// Fail open is safer for availability.
			logging.Error(ctx, "Rate limiter store failed", zap.Error(err))
			c.Next()
			return
		}

		// Set headers
		c.Header("X-RateLimit-Limit", strconv.FormatInt(context.Limit, 10))
		c.Header("X-RateLimit-Remaining", strconv.FormatInt(context.Remaining, 10))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(context.Reset, 10))

		if context.Reached {
			metrics.RateLimitExceeded.WithLabelValues(c.FullPath(), limitType).Inc()
			c.Header("Retry-After", strconv.FormatInt(context.Reset-time.Now().Unix(), 10)) // approximate
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":       "Too many requests",
				"retry_after": context.Reset,
			})
			return
		}

		metrics.RateLimitRequests.WithLabelValues(c.FullPath()).Inc()
		c.Next()
	}
}

// MiddlewareForEndpoint returns a Gin middleware that enforces a specific endpoint rate limit
func (rl *RateLimiter) MiddlewareForEndpoint(endpointType string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var limiterInstance *limiter.Limiter

		switch endpointType {
		case "rooms":
			limiterInstance = rl.apiRooms
		case "messages":
			limiterInstance = rl.apiMessages
		default:
			// Fallback to global user limit if unknown
			limiterInstance = rl.apiGlobal
		}

		// Requirement: "per user". If not authenticated, what do we do?
		// "100/min per user" implies these are protected endpoints.
		// If unauthenticated, they should probably be blocked by auth middleware anyway.
		// But in case they aren't, we can limit by IP using the public limit?
		// Or using the specific limit keyed by IP.

		var key string

		claims, exists := c.Get("claims")
		if exists {
			userClaims := claims.(*auth.CustomClaims)
			key = userClaims.Subject
		} else {
			key = c.ClientIP()
		}

		ctx := c.Request.Context()
		context, err := limiterInstance.Get(ctx, key)
		if err != nil {
			logging.Error(ctx, "Rate limiter store failed", zap.Error(err))
			c.Next()
			return
		}

		if context.Reached {
			metrics.RateLimitExceeded.WithLabelValues(c.FullPath(), endpointType).Inc()
			c.Header("X-RateLimit-Retry-After", strconv.FormatInt(context.Reset, 10))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":       "Too many requests",
				"retry_after": context.Reset,
			})
			return
		}

		metrics.RateLimitRequests.WithLabelValues(c.FullPath()).Inc()
		c.Next()
	}
}

// CheckWebSocket checks if a WebSocket connection should be allowed
// Returns true if allowed, false if limit exceeded (and writes error)
func (rl *RateLimiter) CheckWebSocket(c *gin.Context) bool {
	ctx := c.Request.Context()

	// 1. IP Limit
	ip := c.ClientIP()
	ipContext, err := rl.wsIP.Get(ctx, ip)
	if err != nil {
		logging.Error(ctx, "WS Rate limiter store failed (IP)", zap.Error(err))
		return true // Fail open
	}

	if ipContext.Reached {
		metrics.RateLimitExceeded.WithLabelValues("websocket_connect", "ip").Inc()
		c.Header("X-RateLimit-Retry-After", strconv.FormatInt(ipContext.Reset, 10))
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many connections from this IP"})
		return false
	}

	// 2. User Limit (if authenticated)
	// Attempts to get claims from context (populated by auth middleware or previous step)
	// In ServeWs, we extract token manually. So middleware might not have run or set "claims".
	// But `ServeWs` does `claims, err := h.authenticateUser(tokenResult.Token)`.
	// We need to call this check AFTER authentication in ServeWs.

	// However, `ServeWs` in `hub.go` does auth then upgrade.
	// So we can pass the user ID if available.

	return true
}

// CheckWebSocketUser checks the user-specific limit for WebSockets.
// Call this after successfully authenticating the user.
func (rl *RateLimiter) CheckWebSocketUser(ctx context.Context, userID string) error {
	userContext, err := rl.wsUser.Get(ctx, userID)
	if err != nil {
		logging.Error(ctx, "WS Rate limiter store failed (User)", zap.Error(err))
		return nil // Fail open
	}

	if userContext.Reached {
		metrics.RateLimitExceeded.WithLabelValues("websocket_connect", "user").Inc()
		return fmt.Errorf("rate limit exceeded for user")
	}

	return nil
}

// StandardMiddleware allows using the standard ulule/limiter middleware if preferred
// not used currently, opting for custom logic above
func (rl *RateLimiter) StandardMiddleware() gin.HandlerFunc {
	middleware := mgin.NewMiddleware(rl.apiPublic)
	return middleware
}
