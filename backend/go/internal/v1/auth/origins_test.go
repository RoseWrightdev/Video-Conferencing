package auth

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetAllowedOriginsFromEnv_WithValue(t *testing.T) {
	// Set environment variable
	_ = os.Setenv("TEST_ORIGINS", "http://localhost:3000,https://example.com")
	defer func() { _ = os.Unsetenv("TEST_ORIGINS") }()

	origins := GetAllowedOriginsFromEnv("TEST_ORIGINS", []string{"http://default"})

	assert.Equal(t, 2, len(origins))
	assert.Equal(t, "http://localhost:3000", origins[0])
	assert.Equal(t, "https://example.com", origins[1])
}

func TestGetAllowedOriginsFromEnv_Empty(t *testing.T) {
	// Ensure env var is not set
	_ = os.Unsetenv("TEST_ORIGINS_EMPTY")

	defaults := []string{"http://localhost:3000", "http://localhost:8080"}
	origins := GetAllowedOriginsFromEnv("TEST_ORIGINS_EMPTY", defaults)

	assert.Equal(t, defaults, origins)
}
