package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/cc"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/config"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/health"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/middleware"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/ratelimit"
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
			envLoaded = true
			break
		}
	}

	// Temporarily load config to check development mode for logger init
	tempCfg, _ := config.ValidateEnv()

	// Initialize Logger
	if err := logging.Initialize(tempCfg.DevelopmentMode); err != nil {
		panic("Failed to initialize logger: " + err.Error())
	}
	// Ensure buffered logs are flushed
	defer logging.GetLogger().Sync()

	ctx := context.Background()

	if envLoaded {
		logging.Info(ctx, "Loaded environment from .env file")
	} else {
		logging.Warn(ctx, "No .env file found in any expected location, relying on environment variables")
	}

	// Validate environment variables before starting the server
	cfg, err := config.ValidateEnv()
	if err != nil {
		logging.Error(ctx, "Environment validation failed", zap.Error(err))
		os.Exit(1)
	}

	// Get Auth0 configuration from validated config
	auth0Domain := cfg.Auth0Domain
	auth0Audience := cfg.Auth0Audience
	skipAuth := cfg.SkipAuth
	developmentMode := cfg.DevelopmentMode

	if developmentMode {
		logging.Info(ctx, "Running in DEVELOPMENT MODE")
	}

	var authValidator *auth.Validator
	if !skipAuth {
		// FALLBACK: If in dev mode and credentials missing, auto-skip
		if developmentMode && (auth0Domain == "" || auth0Audience == "") {
			logging.Warn(ctx, "⚠️  Development Mode: Auth0 credentials missing. Auto-enabling SKIP_AUTH.")
			skipAuth = true
		} else if auth0Domain == "" || auth0Audience == "" {
			logging.Error(ctx, "AUTH0_DOMAIN and AUTH0_AUDIENCE must be set in environment when SKIP_AUTH=false")
			return
		}
	}

	if !skipAuth {
		// Create the Auth0 token validator.
		var err error
		authValidator, err = auth.NewValidator(context.Background(), auth0Domain, auth0Audience)
		if err != nil {
			logging.Error(ctx, "Failed to create auth validator", zap.Error(err))
			return
		}
		logging.Info(ctx, "✅ Auth0 validator initialized", zap.String("domain", auth0Domain), zap.String("audience", auth0Audience))
	} else {
		logging.Warn(ctx, "⚠️ Authentication DISABLED for development - DO NOT USE IN PRODUCTION")
		authValidator = nil
	}

	// --- Redis Bus Initialization (Optional) ---
	// Initialize Redis for distributed pub/sub if enabled
	var busService *bus.Service
	if cfg.RedisEnabled {
		var err error
		busService, err = bus.NewService(cfg.RedisAddr, cfg.RedisPassword)
		if err != nil {
			logging.Error(ctx, "Failed to connect to Redis, running in single-instance mode", zap.Error(err))
			busService = nil // Fallback to single-instance mode
		} else {
			logging.Info(ctx, "✅ Redis pub/sub initialized for distributed messaging", zap.String("addr", cfg.RedisAddr))
		}
	} else {
		logging.Info(ctx, "Running in single-instance mode (Redis disabled)")
	}

	// --- Rate Limiter Initialization ---
	// Create rate limiter using Redis client (if available)
	var redisClient *redis.Client
	if busService != nil {
		redisClient = busService.Client()
	}
	rateLimiter, err := ratelimit.NewRateLimiter(cfg, redisClient)
	if err != nil {
		logging.Error(ctx, "Failed to initialize rate limiter", zap.Error(err))
		os.Exit(1)
	}
	logging.Info(ctx, "✅ Rate limiter initialized")

	// --- Summary Service (Python) Initialization ---
	// Hardcoded port 50052 as defined in summary-service/main.py
	// In k8s, this would be a service DNS name
	summaryAddr := "localhost:50052"
	if os.Getenv("SUMMARY_SERVICE_ADDR") != "" {
		summaryAddr = os.Getenv("SUMMARY_SERVICE_ADDR")
	}

	var summaryClient *cc.SummaryClient
	var errSummary error
	// Attempt connection but don't block startup
	summaryClient, errSummary = cc.NewSummaryClient(summaryAddr)
	if errSummary != nil {
		logging.Error(ctx, "Failed to connect to Summary Service", zap.Error(errSummary))
		// Continue running, handler will just error out
	} else {
		logging.Info(ctx, "✅ Connected to Summary Service", zap.String("addr", summaryAddr))
		defer summaryClient.Close()
	}

	// --- Create Hubs with Dependencies ---
	// Each feature gets its own hub, configured with the same dependencies.
	var validator types.TokenValidator
	if authValidator != nil {
		validator = authValidator
	} else {
		validator = &auth.MockValidator{}
	}

	hub := transport.NewHub(validator, busService, developmentMode, rateLimiter)

	// --- Set up Server ---
	router := gin.New() // Use New() to avoid default logger
	router.Use(gin.Recovery())

	// Add Correlation ID middleware
	router.Use(middleware.CorrelationID())

	// Cors
	config := cors.DefaultConfig()
	allowedOrigins := auth.GetAllowedOriginsFromEnv(cfg.AllowedOrigins, []string{"http://localhost:3000"})
	config.AllowOrigins = allowedOrigins
	// Expose header so frontend can read it
	config.ExposeHeaders = []string{middleware.HeaderXCorrelationID}
	router.Use(cors.New(config))

	// Rate Limiting
	// Apply global rate limiting middleware
	router.Use(rateLimiter.GlobalMiddleware())

	// Routing
	wsGroup := router.Group("/ws")
	{
		wsGroup.GET("/hub/:roomId", hub.ServeWs)
	}

	// API Endpoints with specific rate limits
	// Note: These are placeholders based on requirements.
	// Real implementation would connect to appropriate handlers.
	apiGroup := router.Group("/api")
	{
		apiGroup.GET("/rooms", rateLimiter.MiddlewareForEndpoint("rooms"), func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "rooms endpoint"})
		})
		apiGroup.GET("/messages", rateLimiter.MiddlewareForEndpoint("messages"), func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "messages endpoint"})
		})

		// New endpoint for frontend logs
		apiGroup.POST("/logs", func(c *gin.Context) {
			// In a real implementation, we would parse and log these properly
			// For now, valid JSON is enough to accept it
			var json map[string]interface{}
			if err := c.ShouldBindJSON(&json); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			// Extract correlation ID if present in body, or take from header (middleware already set it)
			cid := c.GetString(string(logging.CorrelationIDKey))

			// Extract level and message
			level, _ := json["level"].(string)
			msg, _ := json["message"].(string)

			// Log it - we use a specific "frontend" service field if possible,
			// but for now just logging it as incoming log
			logging.GetLogger().Info("Frontend Log",
				zap.String("correlation_id", cid),
				zap.Any("payload", json),
				zap.String("original_level", level),
				zap.String("original_message", msg),
				zap.String("service", "frontend"), // Override service to frontend
			)

			c.Status(http.StatusOK)
		})

		// Summary Endpoint
		apiGroup.POST("/rooms/:roomId/summary", func(c *gin.Context) {
			if summaryClient == nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Summary service unavailable"})
				return
			}
			roomId := c.Param("roomId")

			// Call the RPC
			resp, err := summaryClient.Summarize(c.Request.Context(), roomId)
			if err != nil {
				logging.Error(ctx, "Summary request failed", zap.String("roomId", roomId), zap.Error(err))
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate summary", "details": err.Error()})
				return
			}

			c.JSON(http.StatusOK, resp)
		})
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
		logging.Info(ctx, "API server starting", zap.String("port", cfg.Port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logging.Error(ctx, "Failed to run server", zap.Error(err))
			syscall.Kill(os.Getpid(), syscall.SIGTERM)
		}
	}()

	// Wait for an interrupt signal to gracefully shut down the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logging.Info(ctx, "Shutting down server...")

	// The context is used to inform the server it has 30 seconds to finish
	// the requests it is currently handling
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Close all active rooms and WebSocket connections gracefully
	if err := hub.Shutdown(shutdownCtx); err != nil {
		logging.Error(ctx, "Error during Hub shutdown:", zap.Error(err))
	}

	// Shutdown HTTP server
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logging.Error(ctx, "Server forced to shutdown:", zap.Error(err))
	}

	// Close Redis connection if it was initialized
	if busService != nil {
		if err := busService.Close(); err != nil {
			logging.Error(ctx, "Failed to close Redis connection:", zap.Error(err))
		} else {
			logging.Info(ctx, "Redis connection closed")
		}
	}

	logging.Info(ctx, "Server exiting")
}
