package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Metrics for video conferencing platform
// Declared in the session package to keep metrics close to business logic
// and avoid coupling between packages.
//
// Naming convention: namespace_subsystem_name
// - namespace: video_conference (application-level grouping)
// - subsystem: websocket, room, webrtc (feature-level grouping)
// - name: specific metric (connections_active, events_total, etc.)
//
// Metric Types:
// - Gauge: Current state (connections, rooms, participants)
// - Counter: Cumulative events (messages processed, errors)
// - Histogram: Latency distributions (processing time)

var (
	// ActiveWebSocketConnections tracks the current number of active WebSocket connections (Gauge - current state)
	ActiveWebSocketConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "video_conference",
		Subsystem: "websocket",
		Name:      "connections_active",
		Help:      "Current number of active WebSocket connections",
	})

	// ActiveRooms tracks the current number of active rooms (Gauge - current state)
	ActiveRooms = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "video_conference",
		Subsystem: "room",
		Name:      "rooms_active",
		Help:      "Current number of active rooms",
	})

	// RoomParticipants tracks the number of participants in each room (GaugeVec with room_id label - current state per room)
	// Using Gauge instead of Histogram because we want current participant count per room,
	// not distribution of historical counts
	RoomParticipants = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "video_conference",
		Subsystem: "room",
		Name:      "participants_count",
		Help:      "Number of participants in each room",
	}, []string{"room_id"})

	// WebsocketEvents tracks the total number of WebSocket events processed (CounterVec - cumulative)
	WebsocketEvents = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "video_conference",
		Subsystem: "websocket",
		Name:      "events_total",
		Help:      "Total WebSocket events processed",
	}, []string{"event_type", "status"})

	// MessageProcessingDuration tracks the time spent processing WebSocket messages (HistogramVec - latency distribution)
	MessageProcessingDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "video_conference",
		Subsystem: "websocket",
		Name:      "message_processing_seconds",
		Help:      "Time spent processing WebSocket messages",
		Buckets:   []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1},
	}, []string{"event_type"})

	// WebrtcConnectionAttempts tracks the total number of WebRTC connection attempts (CounterVec - cumulative)
	WebrtcConnectionAttempts = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "video_conference",
		Subsystem: "webrtc",
		Name:      "connection_attempts_total",
		Help:      "Total WebRTC connection attempts",
	}, []string{"status"})

	// CircuitBreakerState tracks the current state of the circuit breaker (GaugeVec)
	// 0: Closed (Healthy), 1: Open (Failure), 2: Half-Open (Recovering)
	CircuitBreakerState = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "video_conference",
		Subsystem: "circuit_breaker",
		Name:      "state",
		Help:      "Current state of the circuit breaker (0: Closed, 1: Open, 2: Half-Open)",
	}, []string{"service"})

	// CircuitBreakerFailures tracks the total number of requests rejected by the circuit breaker
	CircuitBreakerFailures = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "video_conference",
		Subsystem: "circuit_breaker",
		Name:      "failures_total",
		Help:      "Total requests rejected by the circuit breaker",
	}, []string{"service"})

	// RateLimitExceeded tracks the total number of requests that exceeded the rate limit
	RateLimitExceeded = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "video_conference",
		Subsystem: "rate_limit",
		Name:      "exceeded_total",
		Help:      "Total number of requests that exceeded the rate limit",
	}, []string{"endpoint", "reason"})

	// RateLimitRequests tracks the total number of requests checked against the rate limiter
	RateLimitRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "video_conference",
		Subsystem: "rate_limit",
		Name:      "requests_total",
		Help:      "Total number of requests checked against the rate limiter",
	}, []string{"endpoint"})

	// RedisOperationsTotal tracks the total number of Redis operations (CounterVec)
	RedisOperationsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "video_conference",
		Subsystem: "redis",
		Name:      "operations_total",
		Help:      "Total number of Redis operations",
	}, []string{"operation", "status"})

	// RedisOperationDuration tracks the duration of Redis operations (HistogramVec)
	RedisOperationDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "video_conference",
		Subsystem: "redis",
		Name:      "operation_duration_seconds",
		Help:      "Duration of Redis operations",
		Buckets:   prometheus.DefBuckets,
	}, []string{"operation"})
)

func IncConnection() {
	ActiveWebSocketConnections.Inc()
}

func DecConnection() {
	ActiveWebSocketConnections.Dec()
}
