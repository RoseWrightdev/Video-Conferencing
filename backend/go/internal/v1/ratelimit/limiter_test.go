package ratelimit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/config"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestLimiter(t *testing.T) (*RateLimiter, *miniredis.Miniredis) {
	mr, err := miniredis.Run()
	require.NoError(t, err)

	rc := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	cfg := &config.Config{
		RateLimitAPIGlobal:   "10-M", // 10 per minute
		RateLimitAPIPublic:   "5-M",  // 5 per minute
		RateLimitAPIRooms:    "5-M",
		RateLimitAPIMessages: "5-M",
		RateLimitWsIP:        "5-M",
		RateLimitWsUser:      "5-M",
	}

	// Create mock validator that accepts all tokens
	mockValidator := &MockValidator{
		ValidateTokenFunc: func(tokenString string) (*auth.CustomClaims, error) {
			// Parse the token to extract claims for testing
			token, _, err := jwt.NewParser().ParseUnverified(tokenString, &auth.CustomClaims{})
			if err != nil {
				return nil, err
			}
			claims, ok := token.Claims.(*auth.CustomClaims)
			if !ok {
				return nil, err
			}
			return claims, nil
		},
	}

	rl, err := NewRateLimiter(cfg, rc, mockValidator)
	require.NoError(t, err)

	return rl, mr
}

func TestNewRateLimiter_Memory(t *testing.T) {
	cfg := &config.Config{
		RateLimitAPIGlobal:   "10-M",
		RateLimitAPIPublic:   "5-M",
		RateLimitAPIRooms:    "5-M",
		RateLimitAPIMessages: "5-M",
		RateLimitWsIP:        "5-M",
		RateLimitWsUser:      "5-M",
	}
	mockValidator := &MockValidator{}
	rl, err := NewRateLimiter(cfg, nil, mockValidator)
	assert.NoError(t, err)
	assert.NotNil(t, rl)
	// Verify it falls back to memory (no redis client)
	assert.Nil(t, rl.redisClient)
}

func TestGlobalMiddleware_Public(t *testing.T) {
	rl, mr := newTestLimiter(t)
	defer mr.Close()

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(rl.GlobalMiddleware())
	r.GET("/test", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	// Make 5 requests (limit is 5)
	for i := 0; i < 5; i++ {
		req, _ := http.NewRequest("GET", "/test", nil)
		resp := httptest.NewRecorder()
		r.ServeHTTP(resp, req)
		assert.Equal(t, http.StatusOK, resp.Code)
		assert.Equal(t, "5", resp.Header().Get("X-RateLimit-Limit"))
	}

	// 6th request should fail
	req, _ := http.NewRequest("GET", "/test", nil)
	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, req)
	assert.Equal(t, http.StatusTooManyRequests, resp.Code)
}

func TestGlobalMiddleware_User(t *testing.T) {
	rl, mr := newTestLimiter(t)
	defer mr.Close()

	// Create a valid JWT token for testing
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &auth.CustomClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user1",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
		},
	})
	tokenString, _ := token.SignedString([]byte("test-secret"))

	r := gin.New()
	r.Use(rl.GlobalMiddleware())
	r.GET("/test-user", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	// Global user limit is 10
	for i := 0; i < 10; i++ {
		req, _ := http.NewRequest("GET", "/test-user", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)
		resp := httptest.NewRecorder()
		r.ServeHTTP(resp, req)
		assert.Equal(t, http.StatusOK, resp.Code)
		assert.Equal(t, "10", resp.Header().Get("X-RateLimit-Limit"))
	}

	// 11th should fail
	req, _ := http.NewRequest("GET", "/test-user", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, req)
	assert.Equal(t, http.StatusTooManyRequests, resp.Code)
}

func TestMiddlewareForEndpoint(t *testing.T) {
	rl, mr := newTestLimiter(t)
	defer mr.Close()

	r := gin.New()
	// Endpoint MW for "rooms" (limit 5)
	r.POST("/rooms", rl.MiddlewareForEndpoint("rooms"), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	for i := 0; i < 5; i++ {
		req, _ := http.NewRequest("POST", "/rooms", nil)
		resp := httptest.NewRecorder()
		r.ServeHTTP(resp, req)
		assert.Equal(t, http.StatusOK, resp.Code)
	}

	req, _ := http.NewRequest("POST", "/rooms", nil)
	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, req)
	assert.Equal(t, http.StatusTooManyRequests, resp.Code)
}

func TestCheckWebSocket_IP(t *testing.T) {
	rl, mr := newTestLimiter(t)
	defer mr.Close()

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request, _ = http.NewRequest("GET", "/ws", nil)

	// Consume 5
	for i := 0; i < 5; i++ {
		allowed := rl.CheckWebSocket(ctx)
		assert.True(t, allowed)
	}

	// 6th should fail
	allowed := rl.CheckWebSocket(ctx)
	assert.False(t, allowed)
}

func TestCheckWebSocketUser(t *testing.T) {
	rl, mr := newTestLimiter(t)
	defer mr.Close()

	ctx := context.Background()
	// Consume 5
	for i := 0; i < 5; i++ {
		err := rl.CheckWebSocketUser(ctx, "user1")
		assert.NoError(t, err)
	}

	// 6th
	err := rl.CheckWebSocketUser(ctx, "user1")
	assert.Error(t, err)
}

func TestRedisFailure(t *testing.T) {
	rl, mr := newTestLimiter(t)

	// Kill redis to simulate failure
	mr.Close()

	// Should fail open (allow request) but log error
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(rl.GlobalMiddleware())
	r.GET("/fail-open", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req, _ := http.NewRequest("GET", "/fail-open", nil)
	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, req)

	assert.Equal(t, http.StatusOK, resp.Code)
}

// TestGlobalMiddleware_AuthBypass_Reproduction verifies that the rate limiter
// logic flaw (ToCToU) is fixed. It ensures that the rate limiter does NOT
// rely on context "claims" (which might not be set if RL runs first) but checks the token itself.
func TestGlobalMiddleware_AuthBypass_Reproduction(t *testing.T) {
	// Setup: Strict IP limit (1/min), Generous User limit (100/min)
	mr, err := miniredis.Run()
	require.NoError(t, err)
	defer mr.Close()

	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	cfg := &config.Config{
		RateLimitAPIGlobal:   "100-M", // Generous User Limit
		RateLimitAPIPublic:   "1-M",   // Strict IP Limit
		RateLimitAPIRooms:    "10-M",
		RateLimitAPIMessages: "10-M",
		RateLimitWsIP:        "10-M",
		RateLimitWsUser:      "10-M",
	}
	mockValidator := &MockValidator{
		ValidateTokenFunc: func(tokenString string) (*auth.CustomClaims, error) {
			token, _, err := jwt.NewParser().ParseUnverified(tokenString, &auth.CustomClaims{})
			if err != nil {
				return nil, err
			}
			claims, ok := token.Claims.(*auth.CustomClaims)
			if !ok {
				return nil, err
			}
			return claims, nil
		},
	}
	rl, err := NewRateLimiter(cfg, rc, mockValidator)
	require.NoError(t, err)

	// Create valid token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &auth.CustomClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "user-123",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
		},
		Name: "Test User",
	})
	tokenString, err := token.SignedString([]byte("test")) // Secret doesn't matter for reproduction if we just peek
	require.NoError(t, err)

	r := gin.New()
	r.Use(rl.GlobalMiddleware()) // RL runs before Auth (which isn't even here)
	r.GET("/test-bypass", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	// Request 1: Should pass (consumes the 1 IP limit allowed if fallback happens, or 1 User limit)
	req1, _ := http.NewRequest("GET", "/test-bypass", nil)
	req1.Header.Set("Authorization", "Bearer "+tokenString)
	resp1 := httptest.NewRecorder()
	r.ServeHTTP(resp1, req1)
	assert.Equal(t, http.StatusOK, resp1.Code, "Request 1 should pass")

	// Request 2:
	// IF BUG EXISTS: Falls back to IP limit (1/min) -> 2nd request fails with 429
	// IF AUTH FIX WORKS: Uses User limit (100/min) -> 2nd request passes
	req2, _ := http.NewRequest("GET", "/test-bypass", nil)
	req2.Header.Set("Authorization", "Bearer "+tokenString)
	resp2 := httptest.NewRecorder()
	r.ServeHTTP(resp2, req2)
	assert.Equal(t, http.StatusOK, resp2.Code, "Request 2 should pass (User limit), but failed (IP limit fallback)")
}
