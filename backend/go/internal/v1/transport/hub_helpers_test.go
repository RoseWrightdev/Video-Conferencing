package transport

import (
	"net/http/httptest"
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

// Tests for extractToken

func TestExtractToken_FromHeader(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false, newMockRateLimiter())

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	// Simulate token in Sec-WebSocket-Protocol header
	c.Request = httptest.NewRequest("GET", "/ws", nil)
	c.Request.Header.Set("Sec-WebSocket-Protocol", "access_token, test-token-123")

	result, err := hub.extractToken(c)

	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.True(t, result.FromHeader)
	assert.True(t, result.HasAccessTokenProtocol)
}

func TestExtractToken_FromQuery(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false, newMockRateLimiter())

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)

	// Simulate token in query param
	c.Request = httptest.NewRequest("GET", "/ws?token=test-token-query", nil)

	result, err := hub.extractToken(c)

	assert.NoError(t, err)
	assert.NotNil(t, result)
	assert.False(t, result.FromHeader)
	assert.Equal(t, "test-token-query", result.Token)
}

func TestExtractToken_Missing(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false, newMockRateLimiter())

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/ws", nil)

	result, err := hub.extractToken(c)

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "token not provided")
}

// Tests for validateOrigin

func TestValidateOrigin_Allowed(t *testing.T) {
	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "http://localhost:3000")

	allowedOrigins := []string{"http://localhost:3000", "https://example.com"}

	err := validateOrigin(req, allowedOrigins)
	assert.NoError(t, err)
}

func TestValidateOrigin_Blocked(t *testing.T) {
	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "http://evil.com")

	allowedOrigins := []string{"http://localhost:3000", "https://example.com"}

	err := validateOrigin(req, allowedOrigins)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "origin not allowed")
}

func TestValidateOrigin_EmptyAllowed(t *testing.T) {
	req := httptest.NewRequest("GET", "/ws", nil)
	// No Origin header

	allowedOrigins := []string{"http://localhost:3000"}

	err := validateOrigin(req, allowedOrigins)
	assert.NoError(t, err) // Empty origin allows non-browser clients
}

func TestValidateOrigin_InvalidURL(t *testing.T) {
	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "://invalid-url")

	allowedOrigins := []string{"http://localhost:3000"}

	err := validateOrigin(req, allowedOrigins)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid origin URL")
}

func TestValidateOrigin_SchemeAndHostMatchRequired(t *testing.T) {
	req := httptest.NewRequest("GET", "/ws", nil)
	req.Header.Set("Origin", "https://localhost:3000") // Different scheme

	allowedOrigins := []string{"http://localhost:3000"} // http not https

	err := validateOrigin(req, allowedOrigins)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "origin not allowed")
}

// Tests for authenticateUser

func TestAuthenticateUser_Valid(t *testing.T) {
	validator := &MockTokenValidator{shouldFail: false}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false, newMockRateLimiter())

	claims, err := hub.authenticateUser("valid-token")

	assert.NoError(t, err)
	assert.NotNil(t, claims)
	assert.Equal(t, "test-user-123", claims.Subject)
}

func TestAuthenticateUser_Invalid(t *testing.T) {
	validator := &MockTokenValidator{shouldFail: true}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false, newMockRateLimiter())

	claims, err := hub.authenticateUser("invalid-token")

	assert.Error(t, err)
	assert.Nil(t, claims)
	assert.Contains(t, err.Error(), "invalid token")
}

// Tests for setupClientConnection

func TestSetupClientConnection_WithUsername(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false, newMockRateLimiter())

	mockConn := &MockConnection{}
	claims := &auth.CustomClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "user-123",
		},
		Name:  "Test User",
		Email: "test@example.com",
	}

	client, r := hub.setupClientConnection(&clientSetupParams{
		RoomID:   "test-room",
		UserID:   "user-123",
		Username: "custom-username",
		Claims:   claims,
		DevMode:  false,
		Conn:     mockConn,
	})

	assert.NotNil(t, client)
	assert.NotNil(t, r)
	assert.Equal(t, types.ClientIdType("user-123"), client.ID)
	assert.Equal(t, types.DisplayNameType("custom-username"), client.DisplayName)
	assert.True(t, client.rateLimitEnabled)
}

func TestSetupClientConnection_WithoutUsername(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false, newMockRateLimiter())

	mockConn := &MockConnection{}
	claims := &auth.CustomClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "user-123",
		},
		Name:  "JWT Name",
		Email: "test@example.com",
	}

	client, r := hub.setupClientConnection(&clientSetupParams{
		RoomID:   "test-room",
		UserID:   "user-123",
		Username: "",
		Claims:   claims,
		DevMode:  false,
		Conn:     mockConn,
	})

	assert.NotNil(t, client)
	assert.NotNil(t, r)
	assert.Equal(t, types.DisplayNameType("JWT Name"), client.DisplayName)
}

func TestSetupClientConnection_FallbackToEmail(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, false, newMockRateLimiter())

	mockConn := &MockConnection{}
	claims := &auth.CustomClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "user-123",
		},
		Name:  "",
		Email: "alice@example.com",
	}

	client, r := hub.setupClientConnection(&clientSetupParams{
		RoomID:   "test-room",
		UserID:   "user-123",
		Username: "",
		Claims:   claims,
		DevMode:  false,
		Conn:     mockConn,
	})

	assert.NotNil(t, client)
	assert.NotNil(t, r)
	assert.Equal(t, types.DisplayNameType("alice"), client.DisplayName)
}

func TestSetupClientConnection_DevModeOverride(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}
	hub := NewHub(validator, mockBus, true, newMockRateLimiter())

	mockConn := &MockConnection{}
	claims := &auth.CustomClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: "dev-user-123",
		},
		Name: "Dev User",
	}

	client, r := hub.setupClientConnection(&clientSetupParams{
		RoomID:   "test-room",
		UserID:   "dev-user-123",
		Username: "unique-dev-username",
		Claims:   claims,
		DevMode:  true,
		Conn:     mockConn,
	})

	assert.NotNil(t, client)
	assert.NotNil(t, r)
	assert.Equal(t, types.ClientIdType("unique-dev-username"), client.ID)
	assert.False(t, client.rateLimitEnabled)
}
