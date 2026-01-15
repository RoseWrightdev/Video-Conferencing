package transport

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

func TestServeWs_Unauthorized(t *testing.T) {
	gin.SetMode(gin.TestMode)

	validator := &MockTokenValidator{shouldFail: true}
	hub := NewHub(validator, nil, false, newMockRateLimiter())

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("GET", "/ws/room1", nil)
	c.Params = gin.Params{{Key: "roomId", Value: "room1"}}

	hub.ServeWs(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestServeWs_NoToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	validator := &MockTokenValidator{}
	hub := NewHub(validator, nil, false, newMockRateLimiter())

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("GET", "/ws/room1", nil)
	c.Params = gin.Params{{Key: "roomId", Value: "room1"}}

	hub.ServeWs(c)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestServeWs_InvalidOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	validator := &MockTokenValidator{}
	hub := NewHub(validator, nil, false, newMockRateLimiter())

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("GET", "/ws/room1?token=valid", nil)
	c.Request.Header.Set("Origin", "http://evil.com")
	c.Params = gin.Params{{Key: "roomId", Value: "room1"}}

	hub.ServeWs(c)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestHandleConnection(t *testing.T) {
	gin.SetMode(gin.TestMode)

	validator := &MockTokenValidator{}
	hub := NewHub(validator, nil, false, newMockRateLimiter())

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Params = gin.Params{{Key: "roomId", Value: "room1"}}

	claims := &auth.CustomClaims{
		RegisteredClaims: jwt.RegisteredClaims{Subject: "user1"},
	}

	conn := &MockConnection{}

	// Should not panic, should setup client and room
	hub.HandleConnection(c, conn, claims)

	assert.Contains(t, hub.rooms, types.RoomIdType("room1"))
}
