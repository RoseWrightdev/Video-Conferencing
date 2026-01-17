package health

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"go.uber.org/zap"
)

// SFUChecker checks the health of the SFU
type SFUChecker interface {
	Check(ctx context.Context, addr string) string
}

// DefaultSFUChecker is the default implementation of SFUChecker
type DefaultSFUChecker struct{}

// Check verifies gRPC connectivity to Rust SFU using health check protocol
func (c *DefaultSFUChecker) Check(ctx context.Context, addr string) string {
	// Create gRPC connection with timeout
	conn, err := grpc.NewClient(
		addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		logging.Error(ctx, "Failed to connect to Rust SFU for health check", zap.Error(err), zap.String("addr", addr))
		return "unhealthy"
	}
	defer func() { _ = conn.Close() }()

	// Create health check client
	healthClient := healthpb.NewHealthClient(conn)

	// Check health status
	resp, err := healthClient.Check(ctx, &healthpb.HealthCheckRequest{
		Service: "", // Empty string checks overall server health
	})
	if err != nil {
		logging.Error(ctx, "Rust SFU health check RPC failed", zap.Error(err))
		return "unhealthy"
	}

	// Verify the service is SERVING
	if resp.Status != healthpb.HealthCheckResponse_SERVING {
		logging.Warn(ctx, "Rust SFU is not serving", zap.String("status", resp.Status.String()))
		return "unhealthy"
	}

	return "healthy"
}

// Handler manages health check endpoints
type Handler struct {
	redisService *bus.Service
	sfuAddr      string
	sfuEnabled   bool
	sfuChecker   SFUChecker
}

// NewHandler creates a new health check handler
func NewHandler(redisService *bus.Service) *Handler {
	sfuAddr := os.Getenv("RUST_SFU_ADDR")
	if sfuAddr == "" {
		sfuAddr = "localhost:50051" // Default for local development
	}

	// Check if SFU health checks should be enabled
	sfuEnabled := os.Getenv("RUST_SFU_HEALTH_CHECK_ENABLED")
	enabled := sfuEnabled != "false" // Enabled by default

	return &Handler{
		redisService: redisService,
		sfuAddr:      sfuAddr,
		sfuEnabled:   enabled,
		sfuChecker:   &DefaultSFUChecker{},
	}
}

// LivenessResponse represents the liveness probe response
type LivenessResponse struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
}

// ReadinessResponse represents the readiness probe response
type ReadinessResponse struct {
	Status    string            `json:"status"`
	Checks    map[string]string `json:"checks"`
	Timestamp string            `json:"timestamp"`
}

// Liveness handles the liveness probe endpoint
// GET /health/live
// Returns 200 if the process is alive (no dependency checks)
func (h *Handler) Liveness(c *gin.Context) {
	response := LivenessResponse{
		Status:    "alive",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	c.JSON(http.StatusOK, response)
}

// Readiness handles the readiness probe endpoint
// GET /health/ready
// Returns 200 only if all critical dependencies are healthy
// Returns 503 if any dependency is unhealthy
func (h *Handler) Readiness(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	checks := make(map[string]string)
	allHealthy := true

	// Check Redis connectivity
	redisStatus := h.checkRedis(ctx)
	checks["redis"] = redisStatus
	if redisStatus != "healthy" {
		allHealthy = false
	}

	// Check Rust SFU connectivity (if enabled)
	if h.sfuEnabled {
		sfuStatus := h.checkRustSFU(ctx)
		checks["rust_sfu"] = sfuStatus
		if sfuStatus != "healthy" {
			allHealthy = false
		}
	}

	status := "ready"
	statusCode := http.StatusOK
	if !allHealthy {
		status = "unavailable"
		statusCode = http.StatusServiceUnavailable
	}

	response := ReadinessResponse{
		Status:    status,
		Checks:    checks,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	c.JSON(statusCode, response)
}

// checkRedis verifies Redis connectivity using PING command
func (h *Handler) checkRedis(ctx context.Context) string {
	// If Redis is not enabled (single-instance mode), consider it healthy
	if h.redisService == nil {
		return "healthy"
	}

	// Try to ping Redis
	if err := h.redisService.Ping(ctx); err != nil {
		logging.Error(ctx, "Redis health check failed", zap.Error(err))
		return "unhealthy"
	}

	return "healthy"
}

// checkRustSFU verifies gRPC connectivity to Rust SFU using health check protocol
func (h *Handler) checkRustSFU(ctx context.Context) string {
	if h.sfuChecker == nil {
		// Fallback or error if not initialized, though NewHandler ensures it is.
		// For safety in tests that might create struct directly without checker:
		return "unhealthy"
	}
	return h.sfuChecker.Check(ctx, h.sfuAddr)
}

// HealthCheckResponse is a generic health check response for backward compatibility
type HealthCheckResponse struct {
	Status string         `json:"status"`
	Data   map[string]any `json:"data,omitempty"`
}

// MarshalJSON implements custom JSON marshaling for better formatting
func (r ReadinessResponse) MarshalJSON() ([]byte, error) {
	type Alias ReadinessResponse
	return json.Marshal(&struct {
		*Alias
	}{
		Alias: (*Alias)(&r),
	})
}
