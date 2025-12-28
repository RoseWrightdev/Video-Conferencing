package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/transport"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
)

func main() {
	// Load .env file for local development.
	// Try multiple paths to handle different ways of running the app
	envPaths := []string{".env", "../../../.env", "../../.env"}
	var envLoaded bool

	for _, path := range envPaths {
		if err := godotenv.Load(path); err == nil {
			slog.Info("Loaded environment from", "path", path)
			envLoaded = true
			break
		}
	}

	if !envLoaded {
		slog.Warn("No .env file found in any expected location, relying on environment variables")
	}

	// Get Auth0 configuration from environment variables.
	auth0Domain := os.Getenv("AUTH0_DOMAIN")
	auth0Audience := os.Getenv("AUTH0_AUDIENCE")
	skipAuth := os.Getenv("SKIP_AUTH") == "true"
	developmentMode := os.Getenv("DEVELOPMENT_MODE") == "true"

	if developmentMode {
		slog.Info("Running in DEVELOPMENT MODE")
	}

	var authValidator *auth.Validator
	if !skipAuth {
		// FALLBACK: If in dev mode and credentials missing, auto-skip
		if developmentMode && (auth0Domain == "" || auth0Audience == "") {
			slog.Warn("⚠️  Development Mode: Auth0 credentials missing. Auto-enabling SKIP_AUTH.")
			skipAuth = true
		} else if auth0Domain == "" || auth0Audience == "" {
			slog.Error("AUTH0_DOMAIN and AUTH0_AUDIENCE must be set in environment when SKIP_AUTH=false")
			return
		}
	}

	if !skipAuth {
		// Create the Auth0 token validator.
		var err error
		authValidator, err = auth.NewValidator(context.Background(), auth0Domain, auth0Audience)
		if err != nil {
			slog.Error("Failed to create auth validator", "error", err)
			return
		}
		slog.Info("✅ Auth0 validator initialized", "domain", auth0Domain, "audience", auth0Audience)
	} else {
		slog.Warn("⚠️ Authentication DISABLED for development - DO NOT USE IN PRODUCTION")
		authValidator = nil
	}

	// --- Redis Bus Initialization (Optional) ---
	// Initialize Redis for distributed pub/sub if enabled
	var busService *bus.Service
	redisEnabled := os.Getenv("REDIS_ENABLED") == "true"
	if redisEnabled {
		redisAddr := os.Getenv("REDIS_ADDR")
		redisPassword := os.Getenv("REDIS_PASSWORD")

		if redisAddr == "" {
			redisAddr = "localhost:6379" // Default Redis address
		}

		var err error
		busService, err = bus.NewService(redisAddr, redisPassword)
		if err != nil {
			slog.Error("Failed to connect to Redis, running in single-instance mode", "error", err)
			busService = nil // Fallback to single-instance mode
		} else {
			slog.Info("✅ Redis pub/sub initialized for distributed messaging", "addr", redisAddr)
		}
	} else {
		slog.Info("Running in single-instance mode (Redis disabled)")
	}

	// --- Create Hubs with Dependencies ---
	// Each feature gets its own hub, configured with the same dependencies.
	var validator types.TokenValidator
	if authValidator != nil {
		validator = authValidator
	} else {
		validator = &auth.MockValidator{}
	}

	hub := transport.NewHub(validator, busService, developmentMode)

	// --- Set up Server ---
	router := gin.Default()
	// Cors
	config := cors.DefaultConfig()
	allowedOrigins := auth.GetAllowedOriginsFromEnv("ALLOWED_ORIGINS", []string{"http://localhost:3000"})
	config.AllowOrigins = allowedOrigins
	router.Use(cors.New(config))

	// Error handling
	router.Use(gin.Recovery())

	// Routing
	wsGroup := router.Group("/ws")
	{
		wsGroup.GET("/hub/:roomId", hub.ServeWs)
	}

	// Prometheus metrics endpoint
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	// Start the server.
	srv := &http.Server{
		Addr:    ":8080",
		Handler: router,
	}

	// --- Graceful Shutdown ---
	// Start the server in a goroutine so it doesn't block.
	go func() {
		slog.Info("API server starting on :8080")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Failed to run server", "error", err)
			syscall.Kill(os.Getpid(), syscall.SIGTERM)
		}
	}()

	// Wait for an interrupt signal to gracefully shut down the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("Shutting down server...")

	// The context is used to inform the server it has 5 seconds to finish
	// the requests it is currently handling
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Shutdown HTTP server
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("Server forced to shutdown:", "error", err)
	}

	// Close Redis connection if it was initialized
	if busService != nil {
		if err := busService.Close(); err != nil {
			slog.Error("Failed to close Redis connection:", "error", err)
		} else {
			slog.Info("Redis connection closed")
		}
	}

	slog.Info("Server exiting")
}
