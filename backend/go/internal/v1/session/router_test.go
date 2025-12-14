package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestHandlerErrorPaths tests error handling in various handlers
func TestHandlerErrorPaths(t *testing.T) {
	t.Run("handleAddChat with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant
		room.addParticipant(client)

		assert.NotPanics(t, func() {
			room.handleAddChat(client, EventAddChat, "invalid payload")
		}, "handleAddChat should not panic with invalid payload")
	})

	t.Run("handleDeleteChat with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant
		room.addParticipant(client)

		assert.NotPanics(t, func() {
			room.handleDeleteChat(client, EventDeleteChat, "invalid payload")
		}, "handleDeleteChat should not panic with invalid payload")
	})

	t.Run("handleRaiseHand with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant
		room.addParticipant(client)

		assert.NotPanics(t, func() {
			room.handleRaiseHand(client, EventRaiseHand, "invalid payload")
		}, "handleRaiseHand should not panic with invalid payload")
	})

	t.Run("handleLowerHand with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant
		room.addParticipant(client)

		assert.NotPanics(t, func() {
			room.handleLowerHand(client, EventLowerHand, "invalid payload")
		}, "handleLowerHand should not panic with invalid payload")
	})

	t.Run("handleRequestScreenshare with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant
		room.addParticipant(client)

		assert.NotPanics(t, func() {
			room.handleRequestScreenshare(client, EventRequestScreenshare, "invalid payload")
		}, "handleRequestScreenshare should not panic with invalid payload")
	})

	t.Run("handleAcceptScreenshare with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("host1", "Host User")
		client.Role = RoleTypeHost
		room.addHost(client)

		assert.NotPanics(t, func() {
			room.handleAcceptScreenshare(client, EventAcceptScreenshare, "invalid payload")
		}, "handleAcceptScreenshare should not panic with invalid payload")
	})

	t.Run("handleDenyScreenshare with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("host1", "Host User")
		client.Role = RoleTypeHost
		room.addHost(client)

		assert.NotPanics(t, func() {
			room.handleDenyScreenshare(client, EventDenyScreenshare, "invalid payload")
		}, "handleDenyScreenshare should not panic with invalid payload")
	})

	t.Run("handleAcceptWaiting with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("host1", "Host User")
		client.Role = RoleTypeHost
		room.addHost(client)

		assert.NotPanics(t, func() {
			room.handleAcceptWaiting(client, EventAcceptWaiting, "invalid payload")
		}, "handleAcceptWaiting should not panic with invalid payload")
	})

	t.Run("handleDenyWaiting with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("host1", "Host User")
		client.Role = RoleTypeHost
		room.addHost(client)

		assert.NotPanics(t, func() {
			room.handleDenyWaiting(client, EventDenyWaiting, "invalid payload")
		}, "handleDenyWaiting should not panic with invalid payload")
	})

	t.Run("handleGetRecentChats with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant
		room.addParticipant(client)

		assert.NotPanics(t, func() {
			room.handleGetRecentChats(client, EventGetRecentChats, "invalid payload")
		}, "handleGetRecentChats should not panic with invalid payload")
	})

	t.Run("handleRequestWaiting with invalid payload type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("waiting1", "Waiting User")
		client.Role = RoleTypeWaiting
		room.addWaiting(client)

		assert.NotPanics(t, func() {
			room.handleRequestWaiting(client, EventRequestWaiting, "invalid payload")
		}, "handleRequestWaiting should not panic with invalid payload")
	})
}

// TestRoutingEdgeCases tests edge cases in the router function
func TestRoutingEdgeCases(t *testing.T) {
	t.Run("router with unknown event type", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("test-user", "Test User")
		client.Role = RoleTypeParticipant
		room.addParticipant(client)

		unknownEvent := Event("unknown_event")
		msg := Message{Event: unknownEvent, Payload: map[string]string{"test": "data"}}

		assert.NotPanics(t, func() {
			room.router(client, msg)
		}, "Router should handle unknown event types gracefully")
	})

	t.Run("router with client having unknown role", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("test-user", "Test User")
		client.Role = RoleType("unknown_role")

		msg := Message{Event: EventAddChat, Payload: AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			ChatContent: "Test message",
		}}

		assert.NotPanics(t, func() {
			room.router(client, msg)
		}, "Router should handle unknown roles gracefully")
	})
}

// TestRouterPermissionEdgeCases tests router permission checking edge cases
func TestRouterPermissionEdgeCases(t *testing.T) {
	t.Run("waiting client tries participant actions", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("waiting-user", "Waiting User")
		client.Role = RoleTypeWaiting
		room.addWaiting(client)

		msg := Message{Event: EventAddChat, Payload: AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			ChatContent: "Unauthorized message",
		}}

		initialChatCount := room.chatHistory.Len()

		assert.NotPanics(t, func() {
			room.router(client, msg)
		}, "Router should handle unauthorized actions gracefully")

		assert.Equal(t, initialChatCount, room.chatHistory.Len(), "Unauthorized chat should not be added")
	})

	t.Run("participant tries host actions", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		participant := newTestClientWithName("participant1", "Participant User")
		participant.Role = RoleTypeParticipant
		room.addParticipant(participant)

		waitingUser := newTestClientWithName("waiting1", "Waiting User")
		waitingUser.Role = RoleTypeWaiting
		room.addWaiting(waitingUser)

		msg := Message{Event: EventAcceptWaiting, Payload: AcceptWaitingPayload{
			ClientId:    waitingUser.ID,
			DisplayName: waitingUser.DisplayName,
		}}

		initialWaitingCount := len(room.waiting)

		assert.NotPanics(t, func() {
			room.router(participant, msg)
		}, "Router should handle unauthorized host actions gracefully")

		assert.Equal(t, initialWaitingCount, len(room.waiting), "Unauthorized accept should not work")
		assert.Contains(t, room.waiting, waitingUser.ID, "User should still be waiting")
	})
}
