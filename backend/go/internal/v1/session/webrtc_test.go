package session

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHandleWebRTCOffer tests WebRTC offer handling
func TestHandleWebRTCOffer(t *testing.T) {
	t.Run("should forward offer to target client", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		// Create sender and target clients
		sender := newTestClient("sender1")
		sender.DisplayName = "Sender User"
		sender.Role = RoleTypeParticipant

		target := newTestClient("target1")
		target.DisplayName = "Target User"
		target.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), sender)
		room.addParticipant(context.Background(), target)

		// Create WebRTC offer payload
		payload := WebRTCOfferPayload{
			ClientInfo: ClientInfo{
				ClientId:    sender.ID,
				DisplayName: sender.DisplayName,
			},
			TargetClientId: target.ID,
			SDP:            "v=0\r\no=- 123456789 123456789 IN IP4 0.0.0.0\r\n...",
			Type:           "offer",
		}

		msg := Message{Event: EventOffer, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), sender, msg)
		}, "Router should not panic for WebRTC offer")

		// Check that target received the offer
		select {
		case msgBytes := <-target.send:
			var receivedMsg Message
			err := json.Unmarshal(msgBytes, &receivedMsg)
			require.NoError(t, err)
			assert.Equal(t, EventOffer, receivedMsg.Event)

			// Verify payload structure
			receivedPayload, ok := receivedMsg.Payload.(map[string]interface{})
			require.True(t, ok, "Payload should be a map")
			assert.Equal(t, string(sender.ID), receivedPayload["clientId"])
			assert.Equal(t, string(target.ID), receivedPayload["targetClientId"])
			assert.Equal(t, "offer", receivedPayload["type"])
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Target client should have received the offer")
		}
	})

	t.Run("should handle invalid payload", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		sender := newTestClient("sender1")
		room.addParticipant(context.Background(), sender)

		msg := Message{Event: EventOffer, Payload: "invalid"}

		assert.NotPanics(t, func() {
			room.router(context.Background(), sender, msg)
		}, "Router should not panic with invalid payload")
	})

	t.Run("should handle non-existent target client", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		sender := newTestClient("sender1")
		sender.DisplayName = "Sender User"
		room.addParticipant(context.Background(), sender)

		payload := WebRTCOfferPayload{
			ClientInfo: ClientInfo{
				ClientId:    sender.ID,
				DisplayName: sender.DisplayName,
			},
			TargetClientId: "non-existent",
			SDP:            "v=0\r\n...",
			Type:           "offer",
		}

		msg := Message{Event: EventOffer, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), sender, msg)
		}, "Router should not panic for non-existent target")
	})
}

// TestHandleWebRTCAnswer tests WebRTC answer handling
func TestHandleWebRTCAnswer(t *testing.T) {
	t.Run("should forward answer to target client", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		// Create answerer and target clients
		answerer := newTestClient("answerer1")
		answerer.DisplayName = "Answerer User"
		answerer.Role = RoleTypeParticipant

		target := newTestClient("target1")
		target.DisplayName = "Target User"
		target.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), answerer)
		room.addParticipant(context.Background(), target)

		// Create WebRTC answer payload
		payload := WebRTCAnswerPayload{
			ClientInfo: ClientInfo{
				ClientId:    answerer.ID,
				DisplayName: answerer.DisplayName,
			},
			TargetClientId: target.ID,
			SDP:            "v=0\r\no=- 987654321 987654321 IN IP4 0.0.0.0\r\n...",
			Type:           "answer",
		}

		msg := Message{Event: EventAnswer, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), answerer, msg)
		}, "Router should not panic for WebRTC answer")

		// Check that target received the answer
		select {
		case msgBytes := <-target.send:
			var receivedMsg Message
			err := json.Unmarshal(msgBytes, &receivedMsg)
			require.NoError(t, err)
			assert.Equal(t, EventAnswer, receivedMsg.Event)

			// Verify payload structure
			receivedPayload, ok := receivedMsg.Payload.(map[string]interface{})
			require.True(t, ok, "Payload should be a map")
			assert.Equal(t, string(answerer.ID), receivedPayload["clientId"])
			assert.Equal(t, string(target.ID), receivedPayload["targetClientId"])
			assert.Equal(t, "answer", receivedPayload["type"])
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Target client should have received the answer")
		}
	})

	t.Run("should handle invalid payload", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		answerer := newTestClient("answerer1")
		room.addParticipant(context.Background(), answerer)

		msg := Message{Event: EventAnswer, Payload: nil}

		assert.NotPanics(t, func() {
			room.router(context.Background(), answerer, msg)
		}, "Router should not panic with nil payload")
	})
}

// TestHandleWebRTCCandidate tests ICE candidate handling
func TestHandleWebRTCCandidate(t *testing.T) {
	t.Run("should forward candidate to target client", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		// Create sender and target clients
		sender := newTestClient("sender1")
		sender.DisplayName = "Sender User"
		sender.Role = RoleTypeParticipant

		target := newTestClient("target1")
		target.DisplayName = "Target User"
		target.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), sender)
		room.addParticipant(context.Background(), target)

		// Create ICE candidate payload
		sdpMid := "0"
		sdpMLineIndex := 0
		payload := WebRTCCandidatePayload{
			ClientInfo: ClientInfo{
				ClientId:    sender.ID,
				DisplayName: sender.DisplayName,
			},
			TargetClientId: target.ID,
			Candidate:      "candidate:1 1 UDP 2130706431 192.168.1.100 54400 typ host",
			SDPMid:         &sdpMid,
			SDPMLineIndex:  &sdpMLineIndex,
		}

		msg := Message{Event: EventCandidate, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), sender, msg)
		}, "Router should not panic for ICE candidate")

		// Check that target received the candidate
		select {
		case msgBytes := <-target.send:
			var receivedMsg Message
			err := json.Unmarshal(msgBytes, &receivedMsg)
			require.NoError(t, err)
			assert.Equal(t, EventCandidate, receivedMsg.Event)

			// Verify payload structure
			receivedPayload, ok := receivedMsg.Payload.(map[string]interface{})
			require.True(t, ok, "Payload should be a map")
			assert.Equal(t, string(sender.ID), receivedPayload["clientId"])
			assert.Equal(t, string(target.ID), receivedPayload["targetClientId"])
			assert.Contains(t, receivedPayload["candidate"], "candidate:1")
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Target client should have received the candidate")
		}
	})

	t.Run("should handle candidate with minimal fields", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		sender := newTestClient("sender1")
		sender.DisplayName = "Sender User"
		target := newTestClient("target1")
		target.DisplayName = "Target User"

		room.addParticipant(context.Background(), sender)
		room.addParticipant(context.Background(), target)

		// Create minimal ICE candidate payload (without optional fields)
		payload := WebRTCCandidatePayload{
			ClientInfo: ClientInfo{
				ClientId:    sender.ID,
				DisplayName: sender.DisplayName,
			},
			TargetClientId: target.ID,
			Candidate:      "candidate:2 1 TCP 1518280447 192.168.1.100 9 typ host tcptype active",
			SDPMid:         nil, // Optional field
			SDPMLineIndex:  nil, // Optional field
		}

		msg := Message{Event: EventCandidate, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), sender, msg)
		}, "Router should not panic for minimal candidate")

		// Verify message is still forwarded
		select {
		case <-target.send:
			// Success - message was forwarded
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Target client should have received the minimal candidate")
		}
	})
}

// TestHandleWebRTCRenegotiate tests connection renegotiation handling
func TestHandleWebRTCRenegotiate(t *testing.T) {
	t.Run("should forward renegotiation request to target client", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		// Create initiator and target clients
		initiator := newTestClient("initiator1")
		initiator.DisplayName = "Initiator User"
		initiator.Role = RoleTypeParticipant

		target := newTestClient("target1")
		target.DisplayName = "Target User"
		target.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), initiator)
		room.addParticipant(context.Background(), target)

		// Create renegotiation payload
		payload := WebRTCRenegotiatePayload{
			ClientInfo: ClientInfo{
				ClientId:    initiator.ID,
				DisplayName: initiator.DisplayName,
			},
			TargetClientId: target.ID,
			Reason:         "screen sharing enabled",
		}

		msg := Message{Event: EventRenegotiate, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), initiator, msg)
		}, "Router should not panic for renegotiation request")

		// Check that target received the renegotiation request
		select {
		case msgBytes := <-target.send:
			var receivedMsg Message
			err := json.Unmarshal(msgBytes, &receivedMsg)
			require.NoError(t, err)
			assert.Equal(t, EventRenegotiate, receivedMsg.Event)

			// Verify payload structure
			receivedPayload, ok := receivedMsg.Payload.(map[string]interface{})
			require.True(t, ok, "Payload should be a map")
			assert.Equal(t, string(initiator.ID), receivedPayload["clientId"])
			assert.Equal(t, string(target.ID), receivedPayload["targetClientId"])
			assert.Equal(t, "screen sharing enabled", receivedPayload["reason"])
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Target client should have received the renegotiation request")
		}
	})

	t.Run("should handle renegotiation without reason", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		initiator := newTestClient("initiator1")
		initiator.DisplayName = "Initiator User"
		target := newTestClient("target1")
		target.DisplayName = "Target User"

		room.addParticipant(context.Background(), initiator)
		room.addParticipant(context.Background(), target)

		// Create renegotiation payload without reason
		payload := WebRTCRenegotiatePayload{
			ClientInfo: ClientInfo{
				ClientId:    initiator.ID,
				DisplayName: initiator.DisplayName,
			},
			TargetClientId: target.ID,
			Reason:         "", // Empty reason
		}

		msg := Message{Event: EventRenegotiate, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), initiator, msg)
		}, "Router should not panic for renegotiation without reason")

		// Verify message is still forwarded
		select {
		case <-target.send:
			// Success - message was forwarded
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Target client should have received the renegotiation request")
		}
	})
}

// TestWebRTCPermissions tests that WebRTC events respect user permissions
func TestWebRTCPermissions(t *testing.T) {
	t.Run("waiting users cannot send WebRTC signals", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		// Create a host and a waiting user
		host := newTestClient("host1")
		host.Role = RoleTypeHost
		room.addHost(context.Background(), host)

		waitingUser := newTestClient("waiting1")
		waitingUser.Role = RoleTypeWaiting
		room.addWaiting(waitingUser)

		// Waiting user tries to send offer
		payload := WebRTCOfferPayload{
			ClientInfo: ClientInfo{
				ClientId:    waitingUser.ID,
				DisplayName: "Waiting User",
			},
			TargetClientId: host.ID,
			SDP:            "v=0\r\n...",
			Type:           "offer",
		}

		msg := Message{Event: EventOffer, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), waitingUser, msg)
		}, "Router should not panic for waiting user WebRTC attempt")

		// Host should not receive the offer (blocked by permissions)
		select {
		case <-host.send:
			t.Fatal("Host should not receive WebRTC signal from waiting user")
		case <-time.After(50 * time.Millisecond):
			// Expected - no message should be sent
		}
	})

	t.Run("participants can exchange WebRTC signals", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		// Create two participants
		participant1 := newTestClient("participant1")
		participant1.DisplayName = "Participant 1"
		participant1.Role = RoleTypeParticipant

		participant2 := newTestClient("participant2")
		participant2.DisplayName = "Participant 2"
		participant2.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), participant1)
		room.addParticipant(context.Background(), participant2)

		// Participant 1 sends offer to participant 2
		payload := WebRTCOfferPayload{
			ClientInfo: ClientInfo{
				ClientId:    participant1.ID,
				DisplayName: participant1.DisplayName,
			},
			TargetClientId: participant2.ID,
			SDP:            "v=0\r\n...",
			Type:           "offer",
		}

		msg := Message{Event: EventOffer, Payload: payload}
		room.router(context.Background(), participant1, msg)

		// Participant 2 should receive the offer
		select {
		case <-participant2.send:
			// Success - participants can exchange WebRTC signals
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Participant 2 should have received WebRTC offer from participant 1")
		}
	})

	t.Run("hosts can exchange WebRTC signals with participants", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		// Create host and participant
		host := newTestClient("host1")
		host.DisplayName = "Host User"
		host.Role = RoleTypeHost

		participant := newTestClient("participant1")
		participant.DisplayName = "Participant User"
		participant.Role = RoleTypeParticipant

		room.addHost(context.Background(), host)
		room.addParticipant(context.Background(), participant)

		// Host sends candidate to participant
		payload := WebRTCCandidatePayload{
			ClientInfo: ClientInfo{
				ClientId:    host.ID,
				DisplayName: host.DisplayName,
			},
			TargetClientId: participant.ID,
			Candidate:      "candidate:1 1 UDP 2130706431 10.0.0.1 54400 typ host",
		}

		msg := Message{Event: EventCandidate, Payload: payload}
		room.router(context.Background(), host, msg)

		// Participant should receive the candidate
		select {
		case <-participant.send:
			// Success - host can send to participant
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Participant should have received WebRTC candidate from host")
		}
	})
}

// TestWebRTCEdgeCases tests edge cases and error conditions
func TestWebRTCEdgeCases(t *testing.T) {
	t.Run("self-targeting should be handled gracefully", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		client := newTestClient("client1")
		client.DisplayName = "Self User"
		room.addParticipant(context.Background(), client)

		// Client tries to send offer to themselves
		payload := WebRTCOfferPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			TargetClientId: client.ID, // Self-targeting
			SDP:            "v=0\r\n...",
			Type:           "offer",
		}

		msg := Message{Event: EventOffer, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), client, msg)
		}, "Router should not panic for self-targeting WebRTC")

		// Client should not receive their own message (depends on implementation)
		select {
		case <-client.send:
			// If implementation forwards to self, that's acceptable
		case <-time.After(50 * time.Millisecond):
			// If implementation blocks self-targeting, that's also acceptable
		}
	})

	t.Run("should handle malformed SDP gracefully", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		sender := newTestClient("sender1")
		sender.DisplayName = "Sender User"
		target := newTestClient("target1")
		target.DisplayName = "Target User"

		room.addParticipant(context.Background(), sender)
		room.addParticipant(context.Background(), target)

		// Send offer with malformed SDP
		payload := WebRTCOfferPayload{
			ClientInfo: ClientInfo{
				ClientId:    sender.ID,
				DisplayName: sender.DisplayName,
			},
			TargetClientId: target.ID,
			SDP:            "malformed sdp content", // Invalid SDP
			Type:           "offer",
		}

		msg := Message{Event: EventOffer, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), sender, msg)
		}, "Router should not panic for malformed SDP")

		// Target should still receive the message (validation is client-side)
		select {
		case <-target.send:
			// Message forwarded regardless of SDP content
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Target should receive message even with malformed SDP")
		}
	})
}
