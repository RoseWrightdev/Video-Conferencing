package transport

import (
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Fix Origin Validation
func TestValidateOrigin_Strict(t *testing.T) {
	allowed := []string{"https://trusted.com", "http://localhost:3000"}

	tests := []struct {
		name        string
		origin      string
		expectError bool
		expectLog   string
	}{
		{
			name:        "Allowed Origin",
			origin:      "https://trusted.com",
			expectError: false,
		},
		{
			name:        "Allowed Localhost",
			origin:      "http://localhost:3000",
			expectError: false,
		},
		{
			name:        "Subdomain (Should Fail Strict Match)",
			origin:      "https://evil.trusted.com",
			expectError: true,
		},
		{
			name:        "Prefix Match (Should Fail)",
			origin:      "https://trusted.com.evil.com",
			expectError: true,
		},
		{
			name:        "Null Origin (Should Fail)",
			origin:      "null",
			expectError: true,
		},
		{
			name:        "Empty Origin (Should Fail - Enforce Browser Client)",
			origin:      "",
			expectError: true,
		},
		{
			name:        "Evil Origin",
			origin:      "http://evil.com",
			expectError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}

			err := validateOrigin(req, allowed)

			if tc.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
