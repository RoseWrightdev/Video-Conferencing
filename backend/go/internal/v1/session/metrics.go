package session

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
	// Active WebSocket connections (Gauge - current state)
	activeWebSocketConnections = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "video_conference",
		Subsystem: "websocket",
		Name:      "connections_active",
		Help:      "Current number of active WebSocket connections",
	})

	// Active rooms (Gauge - current state)
	activeRooms = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: "video_conference",
		Subsystem: "room",
		Name:      "rooms_active",
		Help:      "Current number of active rooms",
	})

	// Room participants (GaugeVec with room_id label - current state per room)
	// Using Gauge instead of Histogram because we want current participant count per room,
	// not distribution of historical counts
	roomParticipants = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "video_conference",
		Subsystem: "room",
		Name:      "participants_count",
		Help:      "Number of participants in each room",
	}, []string{"room_id"})

	// WebSocket events processed (CounterVec - cumulative)
	websocketEvents = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "video_conference",
		Subsystem: "websocket",
		Name:      "events_total",
		Help:      "Total WebSocket events processed",
	}, []string{"event_type", "status"})

	// Message processing duration (HistogramVec - latency distribution)
	messageProcessingDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "video_conference",
		Subsystem: "websocket",
		Name:      "message_processing_seconds",
		Help:      "Time spent processing WebSocket messages",
		Buckets:   []float64{.001, .005, .01, .025, .05, .1, .25, .5, 1},
	}, []string{"event_type"})

	// WebRTC connection success rate (CounterVec - cumulative)
	webrtcConnectionAttempts = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "video_conference",
		Subsystem: "webrtc",
		Name:      "connection_attempts_total",
		Help:      "Total WebRTC connection attempts",
	}, []string{"status"})
)
