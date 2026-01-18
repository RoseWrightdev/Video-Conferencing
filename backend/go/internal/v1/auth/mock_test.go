package auth

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMockValidator_ValidateToken_WithValidJWT(t *testing.T) {
	mock := &MockValidator{}

	// Create a valid JWT structure (header.payload.signature)
	payload := map[string]interface{}{
		"sub":   "test-user-123",
		"name":  "Test User",
		"email": "test@example.com",
	}
	payloadBytes, _ := json.Marshal(payload)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadBytes)

	// Create fake JWT
	token := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + encodedPayload + ".fake-signature"

	claims, err := mock.ValidateToken(token)
	assert.NoError(t, err)
	assert.NotNil(t, claims)
	assert.Equal(t, "test-user-123", claims.Subject)
	assert.Equal(t, "Test User", claims.Name)
	assert.Equal(t, "test@example.com", claims.Email)
}

func TestMockValidator_ValidateToken_WithInvalidJWT(t *testing.T) {
	mock := &MockValidator{}

	// Invalid JWT (not 3 parts)
	claims, err := mock.ValidateToken("invalid-token")
	assert.NoError(t, err)
	assert.NotNil(t, claims)
	// Should use defaults
	assert.Equal(t, "dev-user-123", claims.Subject)
	assert.Equal(t, "Dev User", claims.Name)
	assert.Equal(t, "dev@example.com", claims.Email)
}

func TestMockValidator_ValidateToken_WithPartialClaims(t *testing.T) {
	mock := &MockValidator{}

	// JWT with only sub claim
	payload := map[string]interface{}{
		"sub": "partial-user",
	}
	payloadBytes, _ := json.Marshal(payload)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadBytes)

	token := "header." + encodedPayload + ".signature"

	claims, err := mock.ValidateToken(token)
	assert.NoError(t, err)
	assert.NotNil(t, claims)
	assert.Equal(t, "partial-user", claims.Subject)
	assert.Equal(t, "Dev User", claims.Name)         // Default
	assert.Equal(t, "dev@example.com", claims.Email) // Default
}
