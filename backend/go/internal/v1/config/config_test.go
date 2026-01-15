package config

import (
	"os"
	"strings"
	"testing"
)

// setupTestEnv sets up environment variables for testing
func setupTestEnv(t *testing.T) func() {
	// Save original env vars
	origVars := map[string]string{
		"JWT_SECRET":    os.Getenv("JWT_SECRET"),
		"PORT":          os.Getenv("PORT"),
		"RUST_SFU_ADDR": os.Getenv("RUST_SFU_ADDR"),
		"REDIS_ENABLED": os.Getenv("REDIS_ENABLED"),
		"REDIS_ADDR":    os.Getenv("REDIS_ADDR"),
		"GO_ENV":        os.Getenv("GO_ENV"),
		"LOG_LEVEL":     os.Getenv("LOG_LEVEL"),
	}

	// Clear all env vars
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("PORT")
	os.Unsetenv("RUST_SFU_ADDR")
	os.Unsetenv("REDIS_ENABLED")
	os.Unsetenv("REDIS_ADDR")
	os.Unsetenv("GO_ENV")
	os.Unsetenv("LOG_LEVEL")

	// Return cleanup function
	return func() {
		for key, val := range origVars {
			if val != "" {
				os.Setenv(key, val)
			} else {
				os.Unsetenv(key)
			}
		}
	}
}

func TestValidateEnv_ValidConfiguration(t *testing.T) {
	cleanup := setupTestEnv(t)
	defer cleanup()

	// Set valid environment variables
	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-purposes")
	os.Setenv("PORT", "8080")
	os.Setenv("RUST_SFU_ADDR", "localhost:50051")
	os.Setenv("REDIS_ENABLED", "false")

	cfg, err := ValidateEnv()
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if cfg.JWTSecret != "this-is-a-very-long-secret-key-for-testing-purposes" {
		t.Errorf("Expected JWT_SECRET to be set correctly")
	}
	if cfg.Port != "8080" {
		t.Errorf("Expected PORT to be '8080', got '%s'", cfg.Port)
	}
	if cfg.RustSFUAddr != "localhost:50051" {
		t.Errorf("Expected RUST_SFU_ADDR to be 'localhost:50051', got '%s'", cfg.RustSFUAddr)
	}
	if cfg.GoEnv != "production" {
		t.Errorf("Expected GO_ENV to default to 'production', got '%s'", cfg.GoEnv)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("Expected LOG_LEVEL to default to 'info', got '%s'", cfg.LogLevel)
	}
}

func TestValidateEnv_MissingJWTSecret(t *testing.T) {
	cleanup := setupTestEnv(t)
	defer cleanup()

	os.Setenv("PORT", "8080")
	os.Setenv("RUST_SFU_ADDR", "localhost:50051")

	_, err := ValidateEnv()
	if err == nil {
		t.Fatal("Expected error for missing JWT_SECRET, got nil")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET is required") {
		t.Errorf("Expected error message about JWT_SECRET, got: %v", err)
	}
}

func TestValidateEnv_ShortJWTSecret(t *testing.T) {
	cleanup := setupTestEnv(t)
	defer cleanup()

	os.Setenv("JWT_SECRET", "short")
	os.Setenv("PORT", "8080")
	os.Setenv("RUST_SFU_ADDR", "localhost:50051")

	_, err := ValidateEnv()
	if err == nil {
		t.Fatal("Expected error for short JWT_SECRET, got nil")
	}
	if !strings.Contains(err.Error(), "must be at least 32 characters") {
		t.Errorf("Expected error message about JWT_SECRET length, got: %v", err)
	}
}

func TestValidateEnv_MissingPort(t *testing.T) {
	cleanup := setupTestEnv(t)
	defer cleanup()

	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-purposes")
	os.Setenv("RUST_SFU_ADDR", "localhost:50051")

	_, err := ValidateEnv()
	if err == nil {
		t.Fatal("Expected error for missing PORT, got nil")
	}
	if !strings.Contains(err.Error(), "PORT is required") {
		t.Errorf("Expected error message about PORT, got: %v", err)
	}
}

func TestValidateEnv_InvalidPort(t *testing.T) {
	cleanup := setupTestEnv(t)
	defer cleanup()

	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-purposes")
	os.Setenv("PORT", "99999")
	os.Setenv("RUST_SFU_ADDR", "localhost:50051")

	_, err := ValidateEnv()
	if err == nil {
		t.Fatal("Expected error for invalid PORT, got nil")
	}
	if !strings.Contains(err.Error(), "PORT must be a valid port number") {
		t.Errorf("Expected error message about invalid PORT, got: %v", err)
	}
}

func TestValidateEnv_InvalidRedisAddr(t *testing.T) {
	cleanup := setupTestEnv(t)
	defer cleanup()

	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-purposes")
	os.Setenv("PORT", "8080")
	os.Setenv("RUST_SFU_ADDR", "localhost:50051")
	os.Setenv("REDIS_ENABLED", "true")
	os.Setenv("REDIS_ADDR", "invalid-format")

	_, err := ValidateEnv()
	if err == nil {
		t.Fatal("Expected error for invalid REDIS_ADDR, got nil")
	}
	if !strings.Contains(err.Error(), "REDIS_ADDR must be in format 'host:port'") {
		t.Errorf("Expected error message about REDIS_ADDR format, got: %v", err)
	}
}

func TestValidateEnv_InvalidRustSFUAddr(t *testing.T) {
	cleanup := setupTestEnv(t)
	defer cleanup()

	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-purposes")
	os.Setenv("PORT", "8080")
	os.Setenv("RUST_SFU_ADDR", "no-port-here")

	_, err := ValidateEnv()
	if err == nil {
		t.Fatal("Expected error for invalid RUST_SFU_ADDR, got nil")
	}
	if !strings.Contains(err.Error(), "RUST_SFU_ADDR must be in format 'host:port'") {
		t.Errorf("Expected error message about RUST_SFU_ADDR format, got: %v", err)
	}
}

func TestValidateEnv_OptionalDefaults(t *testing.T) {
	cleanup := setupTestEnv(t)
	defer cleanup()

	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-purposes")
	os.Setenv("PORT", "8080")
	os.Setenv("RUST_SFU_ADDR", "localhost:50051")

	cfg, err := ValidateEnv()
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if cfg.GoEnv != "production" {
		t.Errorf("Expected GO_ENV to default to 'production', got '%s'", cfg.GoEnv)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("Expected LOG_LEVEL to default to 'info', got '%s'", cfg.LogLevel)
	}
}

func TestValidateEnv_RedisDefaultAddr(t *testing.T) {
	cleanup := setupTestEnv(t)
	defer cleanup()

	os.Setenv("JWT_SECRET", "this-is-a-very-long-secret-key-for-testing-purposes")
	os.Setenv("PORT", "8080")
	os.Setenv("RUST_SFU_ADDR", "localhost:50051")
	os.Setenv("REDIS_ENABLED", "true")
	// Don't set REDIS_ADDR

	cfg, err := ValidateEnv()
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	if cfg.RedisAddr != "localhost:6379" {
		t.Errorf("Expected REDIS_ADDR to default to 'localhost:6379', got '%s'", cfg.RedisAddr)
	}
}

func TestRedactSecret(t *testing.T) {
	tests := []struct {
		name     string
		secret   string
		expected string
	}{
		{"Long secret", "this-is-a-very-long-secret-key", "this-is-***"},
		{"Short secret", "short", "***"},
		{"Exactly 8 chars", "12345678", "***"},
		{"9 chars", "123456789", "12345678***"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := redactSecret(tt.secret)
			if result != tt.expected {
				t.Errorf("Expected '%s', got '%s'", tt.expected, result)
			}
		})
	}
}

func TestIsValidHostPort(t *testing.T) {
	tests := []struct {
		name     string
		addr     string
		expected bool
	}{
		{"Valid localhost", "localhost:8080", true},
		{"Valid IP", "127.0.0.1:3000", true},
		{"Valid hostname", "example.com:443", true},
		{"Missing port", "localhost", false},
		{"Missing host", ":8080", false},
		{"Invalid port", "localhost:99999", false},
		{"Non-numeric port", "localhost:abc", false},
		{"Multiple colons", "localhost:8080:9090", false},
		{"Empty string", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isValidHostPort(tt.addr)
			if result != tt.expected {
				t.Errorf("isValidHostPort('%s') = %v, expected %v", tt.addr, result, tt.expected)
			}
		})
	}
}
