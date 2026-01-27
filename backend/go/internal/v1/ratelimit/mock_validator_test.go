package ratelimit

import (
	"fmt"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
)

// MockValidator is a mock TokenValidator for testing
type MockValidator struct {
	ValidateTokenFunc func(tokenString string) (*auth.CustomClaims, error)
}

// ValidateToken implements types.TokenValidator
func (m *MockValidator) ValidateToken(tokenString string) (*auth.CustomClaims, error) {
	if m.ValidateTokenFunc != nil {
		return m.ValidateTokenFunc(tokenString)
	}
	// Default: return error (invalid token)
	return nil, fmt.Errorf("invalid token")
}
