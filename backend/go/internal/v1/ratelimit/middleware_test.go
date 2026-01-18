package ratelimit

import (
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/config"
	"github.com/stretchr/testify/assert"
)

func TestStandardMiddleware(t *testing.T) {
	// Create config with string rate limit values
	cfg := &config.Config{
		RateLimitAPIGlobal:   "100-M",
		RateLimitAPIPublic:   "100-M",
		RateLimitAPIRooms:    "50-M",
		RateLimitAPIMessages: "200-M",
		RateLimitWsIP:        "50-M",
		RateLimitWsUser:      "100-M",
	}

	// Create rate limiter
	rl, err := NewRateLimiter(cfg, nil)
	assert.NoError(t, err)

	// Get standard middleware
	middleware := rl.StandardMiddleware()
	assert.NotNil(t, middleware)
}
