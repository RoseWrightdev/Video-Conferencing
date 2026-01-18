package ratelimit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/config"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
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

	rl, err := NewRateLimiter(cfg, rc)
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
	rl, err := NewRateLimiter(cfg, nil)
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

	r := gin.New()
	// Mock auth middleware to inject claims
	r.Use(func(c *gin.Context) {
		claims := &auth.CustomClaims{}
		claims.Subject = "user1"
		c.Set("claims", claims)
		c.Request.Header.Set("Authorization", "Bearer token")
		c.Next()
	})
	r.Use(rl.GlobalMiddleware())
	r.GET("/test-user", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	// Global user limit is 10
	for i := 0; i < 10; i++ {
		req, _ := http.NewRequest("GET", "/test-user", nil)
		resp := httptest.NewRecorder()
		r.ServeHTTP(resp, req)
		assert.Equal(t, http.StatusOK, resp.Code)
		assert.Equal(t, "10", resp.Header().Get("X-RateLimit-Limit"))
	}

	// 11th should fail
	req, _ := http.NewRequest("GET", "/test-user", nil)
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
