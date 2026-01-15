package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
)

// Config holds validated environment configuration
type Config struct {
	// Required variables
	JWTSecret   string
	RedisAddr   string
	RustSFUAddr string
	Port        string

	// Optional variables with defaults
	GoEnv         string
	LogLevel      string
	RedisEnabled  bool
	RedisPassword string

	// Auth0 (existing, not validated here)
	Auth0Domain     string
	Auth0Audience   string
	SkipAuth        bool
	DevelopmentMode bool
	AllowedOrigins  string

	// Rate Limits
	RateLimitApiGlobal   string
	RateLimitApiPublic   string
	RateLimitApiRooms    string
	RateLimitApiMessages string
	RateLimitWsIp        string
	RateLimitWsUser      string
}

// ValidateEnv validates all required environment variables and returns a Config object
// Returns an error if any required variable is missing or invalid
func ValidateEnv() (*Config, error) {
	cfg := &Config{}
	var errors []string

	// Required: JWT_SECRET (minimum 32 characters)
	cfg.JWTSecret = os.Getenv("JWT_SECRET")
	if cfg.JWTSecret == "" {
		errors = append(errors, "JWT_SECRET is required")
	} else if len(cfg.JWTSecret) < 32 {
		errors = append(errors, fmt.Sprintf("JWT_SECRET must be at least 32 characters (got %d)", len(cfg.JWTSecret)))
	}

	// Required: PORT (valid port number)
	cfg.Port = os.Getenv("PORT")
	if cfg.Port == "" {
		errors = append(errors, "PORT is required")
	} else {
		port, err := strconv.Atoi(cfg.Port)
		if err != nil || port < 1 || port > 65535 {
			errors = append(errors, fmt.Sprintf("PORT must be a valid port number between 1 and 65535 (got '%s')", cfg.Port))
		}
	}

	// Required: RUST_SFU_ADDR (format: host:port)
	cfg.RustSFUAddr = os.Getenv("RUST_SFU_ADDR")
	if cfg.RustSFUAddr == "" {
		errors = append(errors, "RUST_SFU_ADDR is required")
	} else if !isValidHostPort(cfg.RustSFUAddr) {
		errors = append(errors, fmt.Sprintf("RUST_SFU_ADDR must be in format 'host:port' (got '%s')", cfg.RustSFUAddr))
	}

	// Conditional: REDIS_ADDR (required if REDIS_ENABLED=true)
	cfg.RedisEnabled = os.Getenv("REDIS_ENABLED") == "true"
	if cfg.RedisEnabled {
		cfg.RedisAddr = os.Getenv("REDIS_ADDR")
		if cfg.RedisAddr == "" {
			// Default to localhost:6379 if not specified
			cfg.RedisAddr = "localhost:6379"
			slog.Warn("REDIS_ADDR not set, using default", "addr", cfg.RedisAddr)
		} else if !isValidHostPort(cfg.RedisAddr) {
			errors = append(errors, fmt.Sprintf("REDIS_ADDR must be in format 'host:port' (got '%s')", cfg.RedisAddr))
		}
		cfg.RedisPassword = os.Getenv("REDIS_PASSWORD")
	}

	// Optional: GO_ENV (defaults to "production")
	cfg.GoEnv = os.Getenv("GO_ENV")
	if cfg.GoEnv == "" {
		cfg.GoEnv = "production"
	}

	// Optional: LOG_LEVEL (defaults to "info")
	cfg.LogLevel = os.Getenv("LOG_LEVEL")
	if cfg.LogLevel == "" {
		cfg.LogLevel = "info"
	}

	// Existing variables (not validated here, kept for compatibility)
	cfg.Auth0Domain = os.Getenv("AUTH0_DOMAIN")
	cfg.Auth0Audience = os.Getenv("AUTH0_AUDIENCE")
	cfg.SkipAuth = os.Getenv("SKIP_AUTH") == "true"
	cfg.DevelopmentMode = os.Getenv("DEVELOPMENT_MODE") == "true"
	cfg.AllowedOrigins = os.Getenv("ALLOWED_ORIGINS")

	// Rate Limits (Defaults: M = Minute, H = Hour)
	cfg.RateLimitApiGlobal = getEnvOrDefault("RATE_LIMIT_API_GLOBAL", "1000-M")
	cfg.RateLimitApiPublic = getEnvOrDefault("RATE_LIMIT_API_PUBLIC", "100-M")
	cfg.RateLimitApiRooms = getEnvOrDefault("RATE_LIMIT_API_ROOMS", "100-M")
	cfg.RateLimitApiMessages = getEnvOrDefault("RATE_LIMIT_API_MESSAGES", "500-M")
	cfg.RateLimitWsIp = getEnvOrDefault("RATE_LIMIT_WS_IP", "100-M")
	cfg.RateLimitWsUser = getEnvOrDefault("RATE_LIMIT_WS_USER", "10-M")

	// If there are validation errors, return them
	if len(errors) > 0 {
		return nil, fmt.Errorf("environment validation failed:\n  - %s", strings.Join(errors, "\n  - "))
	}

	// Log validated configuration (with secrets redacted)
	logValidatedConfig(cfg)

	return cfg, nil
}

// isValidHostPort checks if a string is in the format "host:port"
func isValidHostPort(addr string) bool {
	parts := strings.Split(addr, ":")
	if len(parts) != 2 {
		return false
	}

	// Validate port is a number
	port, err := strconv.Atoi(parts[1])
	if err != nil || port < 1 || port > 65535 {
		return false
	}

	// Validate host is not empty
	if parts[0] == "" {
		return false
	}

	return true
}

// logValidatedConfig logs the validated configuration with secrets redacted
func logValidatedConfig(cfg *Config) {
	slog.Info("✅ Environment configuration validated successfully")
	slog.Info("Configuration",
		"jwt_secret", redactSecret(cfg.JWTSecret),
		"port", cfg.Port,
		"rust_sfu_addr", cfg.RustSFUAddr,
		"redis_enabled", cfg.RedisEnabled,
		"redis_addr", cfg.RedisAddr,
		"go_env", cfg.GoEnv,
		"log_level", cfg.LogLevel,
		"development_mode", cfg.DevelopmentMode,
		"rate_limit_api_global", cfg.RateLimitApiGlobal,
	)
}

// getEnvOrDefault returns the value of the environment variable or a default value if not set
func getEnvOrDefault(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

// redactSecret redacts a secret by showing only the first 8 characters
func redactSecret(secret string) string {
	if len(secret) <= 8 {
		return "***"
	}
	return secret[:8] + "***"
}
