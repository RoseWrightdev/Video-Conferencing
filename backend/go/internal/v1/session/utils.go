// Package session - utils.go
//
// This file contains utility functions used throughout the session package.
// These utilities provide common functionality for environment configuration,
// debugging, and cross-cutting concerns.
//
// Utility Categories:
//   - Environment configuration helpers
//   - Debug and logging utilities
//   - Common helper functions
package session

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
)

// GetAllowedOriginsFromEnv reads and parses CORS allowed origins from environment variables.
// This function provides flexible CORS configuration for different deployment environments
// while offering sensible defaults for local development.
//
// Environment Variable Format:
// The function expects a comma-separated list of URLs in the specified environment variable:
//
//	ALLOWED_ORIGINS="http://localhost:3000,https://myapp.com,https://staging.myapp.com"
//
// Development Fallback:
// If the environment variable is not set, the function returns the provided
// default origins and logs a warning. This ensures the application works
// out-of-the-box in development environments.
//
// Security Considerations:
// - Always validate origins in production environments
// - Avoid wildcard origins in production
// - Consider using specific domains rather than broad patterns
//
// Parameters:
//   - envVarName: Name of the environment variable to read (e.g., "ALLOWED_ORIGINS")
//   - defaultEnvs: Fallback origins to use if environment variable is not set
//
// Returns:
//   - Slice of origin strings parsed from the environment variable or defaults
func GetAllowedOriginsFromEnv(envVarName string, defaultEnvs []string) []string {
	// Example: ALLOWED_ORIGINS="http://localhost:3000,https://your-app.com"
	originsStr := os.Getenv(envVarName)
	if originsStr == "" {
		// Provide sensible defaults for local development if the env var isn't set.
		slog.Warn(fmt.Sprintf("%s environment variable not set. Using default development origins:\n%s", envVarName, defaultEnvs))
		return defaultEnvs
	}
	return strings.Split(originsStr, ",")
}
