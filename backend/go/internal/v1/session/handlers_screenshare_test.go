package session

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestHandleDenyScreenshare tests the screenshare denial handler
func TestHandleDenyScreenshare(t *testing.T) {
	t.Run("host can deny screenshare", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		host := newTestClientWithName("host1", "Host User")
		host.Role = RoleTypeHost
		room.addHost(host)

		participant := newTestClientWithName("participant1", "Participant User")
		participant.Role = RoleTypeParticipant
		room.addParticipant(participant)

		payload := DenyScreensharePayload{
			ClientId:    participant.ID,
			DisplayName: participant.DisplayName,
		}

		msg := Message{Event: EventDenyScreenshare, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(host, msg)
		}, "Router should not panic for deny screenshare")
	})

	t.Run("participant cannot deny screenshare", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		participant := newTestClientWithName("participant1", "Participant User")
		participant.Role = RoleTypeParticipant
		room.addParticipant(participant)

		otherParticipant := newTestClientWithName("participant2", "Other Participant")
		otherParticipant.Role = RoleTypeParticipant
		room.addParticipant(otherParticipant)

		payload := DenyScreensharePayload{
			ClientId:    otherParticipant.ID,
			DisplayName: otherParticipant.DisplayName,
		}

		msg := Message{Event: EventDenyScreenshare, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(participant, msg)
		}, "Router should not panic even with insufficient permissions")
	})
}

// TestHandleScreenshareOperations tests screen sharing management
func TestHandleScreenshareOperations(t *testing.T) {
	t.Run("participant can request screenshare", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		participant := newTestClient("participant1")
		participant.Role = RoleTypeParticipant
		room.addParticipant(participant)

		payload := RequestScreensharePayload{
			ClientId:    participant.ID,
			DisplayName: participant.DisplayName,
		}

		msg := Message{Event: EventRequestScreenshare, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(participant, msg)
		}, "Router should not panic for screenshare request")
	})

	t.Run("host can accept screenshare", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		host := newTestClient("host1")
		host.Role = RoleTypeHost
		room.addHost(host)

		participant := newTestClient("participant1")
		participant.Role = RoleTypeParticipant
		room.addParticipant(participant)

		payload := AcceptScreensharePayload{
			ClientId:    participant.ID,
			DisplayName: participant.DisplayName,
		}

		msg := Message{Event: EventAcceptScreenshare, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(host, msg)
		}, "Router should not panic for screenshare acceptance")
	})
}

// TestHandleAcceptScreenshareEdgeCases tests edge cases in handleAcceptScreenshare
func TestHandleAcceptScreenshareEdgeCases(t *testing.T) {
	t.Run("handleAcceptScreenshare with non-existent client", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		host := newTestClientWithName("host1", "Host User")
		host.Role = RoleTypeHost
		room.addHost(host)

		payload := AcceptScreensharePayload{
			ClientId:    "non-existent-client",
			DisplayName: "Non Existent",
		}

		assert.NotPanics(t, func() {
			room.handleAcceptScreenshare(host, EventAcceptScreenshare, payload)
		}, "handleAcceptScreenshare should handle non-existent client gracefully")
	})

	t.Run("handleAcceptScreenshare finds and adds existing client", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		host := newTestClientWithName("host1", "Host User")
		host.Role = RoleTypeHost
		room.addHost(host)

		participant := newTestClientWithName("participant1", "Participant User")
		participant.Role = RoleTypeParticipant
		room.addParticipant(participant)

		payload := AcceptScreensharePayload{
			ClientId:    participant.ID,
			DisplayName: participant.DisplayName,
		}

		assert.NotPanics(t, func() {
			room.handleAcceptScreenshare(host, EventAcceptScreenshare, payload)
		}, "handleAcceptScreenshare should handle existing client")

		_, isScreensharing := room.sharingScreen[participant.ID]
		assert.True(t, isScreensharing, "Client should be added to screenshare")
	})
}

// TestHandleDenyScreenshareEdgeCases tests edge cases in handleDenyScreenshare
func TestHandleDenyScreenshareEdgeCases(t *testing.T) {
	t.Run("handleDenyScreenshare with non-existent client", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		host := newTestClientWithName("host1", "Host User")
		host.Role = RoleTypeHost
		room.addHost(host)

		payload := DenyScreensharePayload{
			ClientId:    "non-existent-client",
			DisplayName: "Non Existent",
		}

		assert.NotPanics(t, func() {
			room.handleDenyScreenshare(host, EventDenyScreenshare, payload)
		}, "handleDenyScreenshare should handle non-existent client gracefully")
	})

	t.Run("handleDenyScreenshare finds and notifies existing client", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		host := newTestClientWithName("host1", "Host User")
		host.Role = RoleTypeHost
		room.addHost(host)

		participant := newTestClientWithName("participant1", "Participant User")
		participant.Role = RoleTypeParticipant
		room.addParticipant(participant)

		payload := DenyScreensharePayload{
			ClientId:    participant.ID,
			DisplayName: participant.DisplayName,
		}

		assert.NotPanics(t, func() {
			room.handleDenyScreenshare(host, EventDenyScreenshare, payload)
		}, "handleDenyScreenshare should handle existing client")

		select {
		case msg := <-participant.send:
			assert.NotNil(t, msg, "Participant should receive denial message")
		case <-time.After(10 * time.Millisecond):
			t.Error("Expected participant to receive denial message")
		}
	})
}
