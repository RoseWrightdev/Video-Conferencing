package session

import (
	"encoding/json"
	"log/slog"
)

// --- WebRTC Signaling Handlers ---
// These handlers manage the peer-to-peer connection establishment process
// required for audio and video streaming between participants.

// handleWebRTCOffer processes WebRTC offers for establishing peer-to-peer connections.
// This handler forwards SDP offers from one participant to another to initiate
// the WebRTC connection negotiation process.
//
// Operation Flow:
//  1. Validate the offer payload structure
//  2. Verify both source and target clients exist in the room
//  3. Forward the offer directly to the target client
//  4. Log the signaling attempt for debugging
//
// Direct Forwarding:
// Unlike broadcast handlers, this sends the offer directly to the specific
// target client. WebRTC signaling is always point-to-point between two peers.
//
// Security Considerations:
//   - Only participants can send offers (waiting users cannot)
//   - Target client must exist in the room
//   - Both clients must have appropriate permissions
//
// Use Cases:
//   - Initiating video/audio calls between participants
//   - Starting screen sharing sessions
//   - Establishing data channels for file sharing
//
// Parameters:
//   - client: The client sending the WebRTC offer
//   - event: The event type (should be EventOffer)
//   - payload: The raw payload containing SDP offer and target client ID
func (r *Room) handleWebRTCOffer(client *Client, event Event, payload any) {
	p, ok := assertPayload[WebRTCOfferPayload](payload)
	logHelper(ok, client.ID, GetFuncName(), r.ID)
	if !ok {
		return
	}

	// Find the target client to send the offer to
	targetClient := r.participants[p.TargetClientId]

	// Also check hosts in case the target is a host
	if targetClient == nil {
		targetClient = r.hosts[p.TargetClientId]
	}

	if targetClient == nil {
		slog.Warn("WebRTC offer target client not found",
			"SourceClientId", client.ID,
			"TargetClientId", p.TargetClientId,
			"RoomId", r.ID)
		return
	}

	// Forward the offer directly to the target client
	if msg, err := json.Marshal(Message{Event: event, Payload: p}); err == nil {
		select {
		case targetClient.send <- msg:
			slog.Info("WebRTC offer forwarded successfully",
				"SourceClientId", client.ID,
				"TargetClientId", p.TargetClientId,
				"RoomId", r.ID)
		default:
			slog.Warn("Failed to forward WebRTC offer - target client channel full",
				"SourceClientId", client.ID,
				"TargetClientId", p.TargetClientId,
				"RoomId", r.ID)
		}
	} else {
		slog.Error("Failed to marshal WebRTC offer", "error", err, "ClientId", client.ID, "RoomId", r.ID)
	}
}

// handleWebRTCAnswer processes WebRTC answers responding to connection offers.
// This handler forwards SDP answers from the receiving peer back to the
// initiating peer to complete the WebRTC connection handshake.
//
// Operation Flow:
//  1. Validate the answer payload structure
//  2. Verify both source and target clients exist in the room
//  3. Forward the answer directly to the target client (original offer sender)
//  4. Log the signaling completion for debugging
//
// Connection Completion:
// After a successful offer/answer exchange, peers can begin exchanging
// ICE candidates to establish the optimal connection path.
//
// Error Handling:
//   - Missing target clients are logged and ignored
//   - JSON marshalling errors are logged but don't crash the handler
//   - Channel full scenarios are handled gracefully
//
// Parameters:
//   - client: The client sending the WebRTC answer
//   - event: The event type (should be EventAnswer)
//   - payload: The raw payload containing SDP answer and target client ID
func (r *Room) handleWebRTCAnswer(client *Client, event Event, payload any) {
	p, ok := assertPayload[WebRTCAnswerPayload](payload)
	logHelper(ok, client.ID, GetFuncName(), r.ID)
	if !ok {
		return
	}

	// Find the target client to send the answer to (original offer sender)
	targetClient := r.participants[p.TargetClientId]

	// Also check hosts
	if targetClient == nil {
		targetClient = r.hosts[p.TargetClientId]
	}

	if targetClient == nil {
		slog.Warn("WebRTC answer target client not found",
			"SourceClientId", client.ID,
			"TargetClientId", p.TargetClientId,
			"RoomId", r.ID)
		return
	}

	// Forward the answer directly to the target client
	if msg, err := json.Marshal(Message{Event: event, Payload: p}); err == nil {
		select {
		case targetClient.send <- msg:
			slog.Info("WebRTC answer forwarded successfully",
				"SourceClientId", client.ID,
				"TargetClientId", p.TargetClientId,
				"RoomId", r.ID)
		default:
			slog.Warn("Failed to forward WebRTC answer - target client channel full",
				"SourceClientId", client.ID,
				"TargetClientId", p.TargetClientId,
				"RoomId", r.ID)
		}
	} else {
		slog.Error("Failed to marshal WebRTC answer", "error", err, "ClientId", client.ID, "RoomId", r.ID)
	}
}

// handleWebRTCCandidate processes ICE candidates for WebRTC connectivity.
// This handler forwards ICE candidates between peers to help establish
// the optimal network path for peer-to-peer communication.
//
// ICE Candidate Purpose:
// ICE (Interactive Connectivity Establishment) candidates contain information
// about potential network paths (IP addresses, ports, protocols) that peers
// can use to connect directly, handling NAT traversal and firewall issues.
//
// Continuous Exchange:
// Unlike offers/answers which are sent once, ICE candidates may be exchanged
// multiple times throughout the connection process as the ICE agent discovers
// new potential connection paths.
//
// Operation Flow:
//  1. Validate the candidate payload structure
//  2. Verify both source and target clients exist in the room
//  3. Forward the candidate directly to the target client
//  4. Continue until connection is established or fails
//
// Parameters:
//   - client: The client sending the ICE candidate
//   - event: The event type (should be EventCandidate)
//   - payload: The raw payload containing ICE candidate data and target client ID
func (r *Room) handleWebRTCCandidate(client *Client, event Event, payload any) {
	p, ok := assertPayload[WebRTCCandidatePayload](payload)
	logHelper(ok, client.ID, GetFuncName(), r.ID)
	if !ok {
		return
	}

	// Find the target client to send the candidate to
	targetClient := r.participants[p.TargetClientId]

	// Also check hosts
	if targetClient == nil {
		targetClient = r.hosts[p.TargetClientId]
	}

	if targetClient == nil {
		slog.Warn("WebRTC candidate target client not found",
			"SourceClientId", client.ID,
			"TargetClientId", p.TargetClientId,
			"RoomId", r.ID)
		return
	}

	// Forward the candidate directly to the target client
	if msg, err := json.Marshal(Message{Event: event, Payload: p}); err == nil {
		select {
		case targetClient.send <- msg:
			// Debug level logging for candidates since there can be many
			slog.Debug("WebRTC candidate forwarded",
				"SourceClientId", client.ID,
				"TargetClientId", p.TargetClientId,
				"RoomId", r.ID)
		default:
			slog.Warn("Failed to forward WebRTC candidate - target client channel full",
				"SourceClientId", client.ID,
				"TargetClientId", p.TargetClientId,
				"RoomId", r.ID)
		}
	} else {
		slog.Error("Failed to marshal WebRTC candidate", "error", err, "ClientId", client.ID, "RoomId", r.ID)
	}
}

// handleWebRTCRenegotiate processes requests to renegotiate WebRTC connections.
// This handler forwards renegotiation requests between peers when connection
// parameters need to change (e.g., adding/removing video streams).
//
// Renegotiation Triggers:
//   - Camera turned on/off
//   - Microphone muted/unmuted
//   - Screen sharing started/stopped
//   - Video quality changes
//   - Additional data channels needed
//
// Operation Flow:
//  1. Validate the renegotiation payload
//  2. Verify both source and target clients exist
//  3. Forward the renegotiation request to the target client
//  4. Target client will initiate a new offer/answer exchange
//
// Connection State:
// During renegotiation, the existing connection remains active while
// new parameters are negotiated, ensuring no interruption in communication.
//
// Parameters:
//   - client: The client requesting renegotiation
//   - event: The event type (should be EventRenegotiate)
//   - payload: The raw payload containing renegotiation request and target client ID
func (r *Room) handleWebRTCRenegotiate(client *Client, event Event, payload any) {
	p, ok := assertPayload[WebRTCRenegotiatePayload](payload)
	logHelper(ok, client.ID, GetFuncName(), r.ID)
	if !ok {
		return
	}

	// Find the target client to send the renegotiation request to
	targetClient := r.participants[p.TargetClientId]

	// Also check hosts
	if targetClient == nil {
		targetClient = r.hosts[p.TargetClientId]
	}

	if targetClient == nil {
		slog.Warn("WebRTC renegotiate target client not found",
			"SourceClientId", client.ID,
			"TargetClientId", p.TargetClientId,
			"RoomId", r.ID)
		return
	}

	// Forward the renegotiation request directly to the target client
	if msg, err := json.Marshal(Message{Event: event, Payload: p}); err == nil {
		select {
		case targetClient.send <- msg:
			slog.Info("WebRTC renegotiation request forwarded",
				"SourceClientId", client.ID,
				"TargetClientId", p.TargetClientId,
				"Reason", p.Reason,
				"RoomId", r.ID)
		default:
			slog.Warn("Failed to forward WebRTC renegotiation - target client channel full",
				"SourceClientId", client.ID,
				"TargetClientId", p.TargetClientId,
				"RoomId", r.ID)
		}
	} else {
		slog.Error("Failed to marshal WebRTC renegotiation", "error", err, "ClientId", client.ID, "RoomId", r.ID)
	}
}
