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
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/config"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/health"
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

	// Validate environment variables before starting the server
	cfg, err := config.ValidateEnv()
	if err != nil {
		slog.Error("Environment validation failed", "error", err)
		os.Exit(1)
	}

	// Get Auth0 configuration from validated config
	auth0Domain := cfg.Auth0Domain
	auth0Audience := cfg.Auth0Audience
	skipAuth := cfg.SkipAuth
	developmentMode := cfg.DevelopmentMode

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
	if cfg.RedisEnabled {
		var err error
		busService, err = bus.NewService(cfg.RedisAddr, cfg.RedisPassword)
		if err != nil {
			slog.Error("Failed to connect to Redis, running in single-instance mode", "error", err)
			busService = nil // Fallback to single-instance mode
		} else {
			slog.Info("✅ Redis pub/sub initialized for distributed messaging", "addr", cfg.RedisAddr)
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
	allowedOrigins := auth.GetAllowedOriginsFromEnv(cfg.AllowedOrigins, []string{"http://localhost:3000"})
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

	// Health check endpoints
	healthHandler := health.NewHandler(busService)
	router.GET("/health/live", healthHandler.Liveness)
	router.GET("/health/ready", healthHandler.Readiness)

	// Start the server.
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// --- Graceful Shutdown ---
	// Start the server in a goroutine so it doesn't block.
	go func() {
		slog.Info("API server starting", "port", cfg.Port)
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

	// The context is used to inform the server it has 30 seconds to finish
	// the requests it is currently handling
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Close all active rooms and WebSocket connections gracefully
	if err := hub.Shutdown(ctx); err != nil {
		slog.Error("Error during Hub shutdown:", "error", err)
	}

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
