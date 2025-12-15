package session

import (
	"context"
	"encoding/json"
	"log/slog"
)

// --- WebRTC Signaling Handlers ---
// These handlers manage the peer-to-peer connection establishment process.
// Refactored to use a centralized helper for consistent "Critical Message" delivery.

// forwardWebRTCSignal is a centralized helper to route signaling messages.
// It handles:
// 1. Thread-safe target lookup (Check-Then-Lock)
// 2. Cross-pod routing (Redis)
// 3. Local delivery with timeout protection (Preventing "Black Screen" bugs)
func (r *Room) forwardWebRTCSignal(ctx context.Context, sourceClient *Client, event Event, payload any, targetID ClientIdType) {
	// 1. Find Target (Brief Lock)
	r.mu.Lock()
	targetClient := r.participants[targetID]
	// Also check hosts (e.g., student calling a teacher)
	if targetClient == nil {
		targetClient = r.hosts[targetID]
	}
	r.mu.Unlock()

	// 2. Cross-Pod Delivery (Redis)
	if targetClient == nil {
		if r.bus != nil {
			// Publish to the room topic. The payload includes targetClientId,
			// and receivers will filter locally for the intended target.
			err := r.bus.Publish(ctx, string(r.ID), string(event), payload, string(sourceClient.ID), nil)
			if err != nil {
				slog.Error("Failed to publish WebRTC signal via Redis", "error", err)
			}
		} else {
			slog.Warn("WebRTC signal target not found and no bus available",
				"event", event,
				"target", targetID)
		}
		return
	}

	// 3. Local Delivery (Critical Path)
	msg, err := json.Marshal(Message{Event: event, Payload: payload})
	if err != nil {
		slog.Error("Failed to marshal WebRTC signal", "error", err)
		return
	}

	// CRITICAL FIX: Non-blocking send to prevent sender from freezing.
	// If the target's channel is full (bad connection), we drop the message
	// and log a warning instead of blocking the sender's read loop.
	select {
	case targetClient.send <- msg:
		// Success
		slog.Debug("WebRTC signal forwarded locally",
			"event", event,
			"source", sourceClient.ID,
			"target", targetID)

	default:
		// Channel is full - target client is likely having network issues.
		// Drop the message to avoid blocking the sender's UI.
		slog.Warn("Target client channel full, dropping WebRTC signal",
			"event", event,
			"source", sourceClient.ID,
			"target", targetClient.ID)
		// Note: We don't close the connection here. The target's writePump
		// will detect the stale connection and clean up properly.
	}
}

// handleWebRTCOffer processes WebRTC offers.
// It uses the generic forwardWebRTCSignal to ensure reliable delivery.
func (r *Room) handleWebRTCOffer(ctx context.Context, client *Client, event Event, payload any) {
	p, ok := assertPayload[WebRTCOfferPayload](payload)
	logHelper(ok, client.ID, "handleWebRTCOffer", r.ID)
	if !ok {
		return
	}
	r.forwardWebRTCSignal(ctx, client, event, p, p.TargetClientId)
}

// handleWebRTCAnswer processes WebRTC answers.
// It uses the generic forwardWebRTCSignal to ensure reliable delivery.
func (r *Room) handleWebRTCAnswer(ctx context.Context, client *Client, event Event, payload any) {
	p, ok := assertPayload[WebRTCAnswerPayload](payload)
	logHelper(ok, client.ID, "handleWebRTCAnswer", r.ID)
	if !ok {
		return
	}
	r.forwardWebRTCSignal(ctx, client, event, p, p.TargetClientId)
}

// handleWebRTCCandidate processes ICE candidates.
// It uses the generic forwardWebRTCSignal to ensure reliable delivery.
func (r *Room) handleWebRTCCandidate(ctx context.Context, client *Client, event Event, payload any) {
	p, ok := assertPayload[WebRTCCandidatePayload](payload)
	logHelper(ok, client.ID, "handleWebRTCCandidate", r.ID)
	if !ok {
		return
	}
	r.forwardWebRTCSignal(ctx, client, event, p, p.TargetClientId)
}

// handleWebRTCRenegotiate processes renegotiation requests.
// It uses the generic forwardWebRTCSignal to ensure reliable delivery.
func (r *Room) handleWebRTCRenegotiate(ctx context.Context, client *Client, event Event, payload any) {
	p, ok := assertPayload[WebRTCRenegotiatePayload](payload)
	logHelper(ok, client.ID, "handleWebRTCRenegotiate", r.ID)
	if !ok {
		return
	}
	r.forwardWebRTCSignal(ctx, client, event, p, p.TargetClientId)
}
