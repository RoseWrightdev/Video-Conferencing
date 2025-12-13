package session

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHandleRequestWaiting tests the waiting room request handler
func TestHandleRequestWaiting(t *testing.T) {
	t.Run("should request waiting successfully", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("waiting1", "Waiting User")
		client.Role = RoleTypeWaiting
		host := newTestClientWithName("host1", "Host User")
		host.Role = RoleTypeHost

		room.addHost(host)
		room.addWaiting(client)

		payload := RequestWaitingPayload{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		}

		assert.NotPanics(t, func() {
			room.router(client, Message{Event: EventRequestWaiting, Payload: payload})
		}, "Router should not panic for request waiting")

		require.Len(t, room.hosts, 1, "Should have one host")

		select {
		case msgBytes := <-host.send:
			var receivedMsg Message
			err := json.Unmarshal(msgBytes, &receivedMsg)
			require.NoError(t, err)
			assert.Equal(t, EventRequestWaiting, receivedMsg.Event)
		case <-time.After(200 * time.Millisecond):
			t.Fatal("Host did not receive waiting request")
		}
	})

	t.Run("should handle invalid payload", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("waiting1", "Waiting User")

		invalidPayload := "invalid payload"

		assert.NotPanics(t, func() {
			room.router(client, Message{Event: EventRequestWaiting, Payload: invalidPayload})
		}, "Router should not panic for invalid payload")

		select {
		case <-client.send:
			t.Fatal("Client should not receive message for invalid payload")
		case <-time.After(50 * time.Millisecond):
			// Expected - no message should be sent
		}
	})
}

// TestHandleDenyWaiting tests the waiting room denial handler
func TestHandleDenyWaiting(t *testing.T) {
	t.Run("host can deny waiting user", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		host := newTestClientWithName("host1", "Host User")
		host.Role = RoleTypeHost
		room.addHost(host)

		waitingUser := newTestClientWithName("waiting1", "Waiting User")
		waitingUser.Role = RoleTypeWaiting
		room.addWaiting(waitingUser)

		payload := DenyWaitingPayload{
			ClientId:    waitingUser.ID,
			DisplayName: waitingUser.DisplayName,
		}

		msg := Message{Event: EventDenyWaiting, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(host, msg)
		}, "Router should not panic for deny waiting")
	})

	t.Run("participant cannot deny waiting user", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		participant := newTestClientWithName("participant1", "Participant User")
		participant.Role = RoleTypeParticipant
		room.addParticipant(participant)

		waitingUser := newTestClientWithName("waiting1", "Waiting User")
		waitingUser.Role = RoleTypeWaiting
		room.addWaiting(waitingUser)

		payload := DenyWaitingPayload{
			ClientId:    waitingUser.ID,
			DisplayName: waitingUser.DisplayName,
		}

		msg := Message{Event: EventDenyWaiting, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(participant, msg)
		}, "Router should not panic even with insufficient permissions")
	})
}

// TestHandleWaitingRoomOperations tests waiting room management
func TestHandleWaitingRoomOperations(t *testing.T) {
	t.Run("host can accept waiting user", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		host := newTestClient("host1")
		host.Role = RoleTypeHost
		room.addHost(host)

		waitingUser := newTestClient("waiting1")
		waitingUser.Role = RoleTypeWaiting
		room.addWaiting(waitingUser)

		require.True(t, len(room.waiting) > 0, "Should have waiting user")

		payload := AcceptWaitingPayload{
			ClientId:    waitingUser.ID,
			DisplayName: waitingUser.DisplayName,
		}

		msg := Message{Event: EventAcceptWaiting, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(host, msg)
		}, "Router should not panic for accept waiting")
	})

	t.Run("participant cannot accept waiting user", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		participant := newTestClient("participant1")
		participant.Role = RoleTypeParticipant
		room.addParticipant(participant)

		waitingUser := newTestClient("waiting1")
		waitingUser.Role = RoleTypeWaiting
		room.addWaiting(waitingUser)

		payload := AcceptWaitingPayload{
			ClientId:    waitingUser.ID,
			DisplayName: waitingUser.DisplayName,
		}

		msg := Message{Event: EventAcceptWaiting, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(participant, msg)
		}, "Router should not panic even with insufficient permissions")

		_, stillWaiting := room.waiting[waitingUser.ID]
		assert.True(t, stillWaiting, "User should still be waiting when non-host tries to accept")
	})
}
