package health

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLiveness(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name           string
		expectedStatus int
		expectedBody   string
	}{
		{
			name:           "liveness always returns 200",
			expectedStatus: http.StatusOK,
			expectedBody:   "alive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create handler
			handler := NewHandler(nil)

			// Create test request
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest("GET", "/health/live", nil)

			// Call handler
			handler.Liveness(c)

			// Assert response
			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Contains(t, w.Body.String(), tt.expectedBody)
			assert.Contains(t, w.Body.String(), "timestamp")
		})
	}
}

func TestReadiness_NilRedis(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Create handler with nil Redis (single-instance mode)
	handler := &Handler{
		redisService: nil,
		sfuEnabled:   false,
	}

	// Create test request
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/health/ready", nil)

	// Call handler
	handler.Readiness(c)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "ready")
	assert.Contains(t, w.Body.String(), "healthy")
}

type MockSFUChecker struct {
	status string
}

func (m *MockSFUChecker) Check(ctx context.Context, addr string) string {
	return m.status
}

func TestReadiness_ResponseFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Use mock checker that returns healthy
	handler := &Handler{
		redisService: nil,
		sfuEnabled:   true,
		sfuAddr:      "localhost:50051",
		sfuChecker:   &MockSFUChecker{status: "healthy"},
	}

	// Create test request
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/health/ready", nil)

	// Call handler
	handler.Readiness(c)

	// Assert response structure
	require.Equal(t, http.StatusOK, w.Code)

	body := w.Body.String()
	assert.Contains(t, body, "status")
	assert.Contains(t, body, "checks")
	assert.Contains(t, body, "timestamp")
	assert.Contains(t, body, "redis")
	assert.Contains(t, body, "rust_sfu")
}

func TestReadiness_SFUDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Create handler with SFU checks disabled
	handler := &Handler{
		redisService: nil,
		sfuEnabled:   false,
	}

	// Create test request
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/health/ready", nil)

	// Call handler
	handler.Readiness(c)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	body := w.Body.String()
	assert.Contains(t, body, "ready")
	assert.Contains(t, body, "redis")
	// SFU check should not be present when disabled
	assert.NotContains(t, body, "rust_sfu")
}

func TestLivenessEndpoint_AlwaysSucceeds(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Even with unhealthy dependencies, liveness should return 200
	handler := &Handler{
		redisService: nil,
		sfuEnabled:   true,
		sfuAddr:      "invalid:9999",
	}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/health/live", nil)

	handler.Liveness(c)

	// Liveness should always succeed
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "alive")
}

func TestNewHandler_DefaultValues(t *testing.T) {
	// Test that NewHandler sets appropriate defaults
	handler := NewHandler(nil)

	assert.NotNil(t, handler)
	assert.NotEmpty(t, handler.sfuAddr)
	// SFU should be enabled by default
	assert.True(t, handler.sfuEnabled)
}
