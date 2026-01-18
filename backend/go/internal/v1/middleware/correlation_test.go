package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestCorrelationID_GeneratesNew(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CorrelationID())

	// Check content inside handler
	r.GET("/test", func(c *gin.Context) {
		// Header in request should be empty
		id := c.GetHeader(HeaderXCorrelationID)
		assert.Empty(t, id)

		// Check context
		ctxVal, exists := c.Get(string(logging.CorrelationIDKey))
		assert.True(t, exists)
		assert.NotEmpty(t, ctxVal)
	})

	req, _ := http.NewRequest("GET", "/test", nil)
	resp := httptest.NewRecorder()

	r.ServeHTTP(resp, req)

	// Check response header
	assert.Equal(t, http.StatusOK, resp.Code)
	assert.NotEmpty(t, resp.Header().Get(HeaderXCorrelationID))
}

func TestCorrelationID_PropagatesExisting(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(CorrelationID())

	existingID := "existing-uuid-123"

	r.GET("/test", func(c *gin.Context) {
		id := c.GetHeader(HeaderXCorrelationID)
		assert.Equal(t, existingID, id)

		ctxVal, exists := c.Get(string(logging.CorrelationIDKey))
		assert.True(t, exists)
		assert.Equal(t, existingID, ctxVal)
	})

	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set(HeaderXCorrelationID, existingID)
	resp := httptest.NewRecorder()

	r.ServeHTTP(resp, req)

	assert.Equal(t, http.StatusOK, resp.Code)
	assert.Equal(t, existingID, resp.Header().Get(HeaderXCorrelationID))
}
