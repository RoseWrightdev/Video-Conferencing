package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHandleRaiseHand tests the hand raising functionality
func TestHandleRaiseHand(t *testing.T) {
	t.Run("should raise hand successfully", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClient("participant1")
		client.Role = RoleTypeParticipant

		room.addParticipant(client)

		payload := RaiseHandPayload{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		}

		msg := Message{Event: EventRaiseHand, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(client, msg)
		}, "Router should not panic for raise hand")

		_, handRaised := room.raisingHand[client.ID]
		assert.True(t, handRaised, "Client should be in raising hand map")
	})

	t.Run("should lower hand successfully", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClient("participant1")
		client.Role = RoleTypeParticipant

		room.addParticipant(client)

		raisePayload := RaiseHandPayload{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		}
		room.raiseHand(raisePayload)
		require.True(t, len(room.raisingHand) > 0, "Hand should be raised first")

		payload := LowerHandPayload{
			ClientId:    client.ID,
			DisplayName: client.DisplayName,
		}

		msg := Message{Event: EventLowerHand, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(client, msg)
		}, "Router should not panic for lower hand")

		_, handRaised := room.raisingHand[client.ID]
		assert.False(t, handRaised, "Client should not be in raising hand map after lowering")
	})
}
