package session

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// room_methods_test.go contains unit tests for the state manipulation methods in room_methods.go.
// These tests ensure that the direct, non-thread-safe operations on a Room's state
// behave as expected.

func TestAddParticipant(t *testing.T) {
	room := NewTestRoom("test-room", nil)
	client := newTestClient("client-1")

	room.addParticipant(context.Background(), client)

	// Assert that the client was added to the participants map
	_, exists := room.participants[client.ID]
	assert.True(t, exists, "Client should be in the participants map")

	// Assert the client's role was updated
	assert.Equal(t, RoleTypeParticipant, client.Role, "Client's role should be participant")

	// Assert the client was added to the draw order queue
	assert.Equal(t, 1, room.clientDrawOrderQueue.Len(), "Draw order queue should have one element")
	assert.Equal(t, client, room.clientDrawOrderQueue.Front().Value, "Client should be in the draw order queue")
	assert.NotNil(t, client.drawOrderElement, "Client's draw order element should be set")
}

func TestDeleteParticipant(t *testing.T) {
	room := NewTestRoom("test-room", nil)
	client := newTestClient("client-1")
	room.addParticipant(context.Background(), client)

	// Sanity check
	require.Equal(t, 1, len(room.participants), "Pre-condition: one participant should exist")
	require.Equal(t, 1, room.clientDrawOrderQueue.Len(), "Pre-condition: draw queue should have one element")

	room.deleteParticipant(context.Background(), client)

	// Assert the client was removed from the map
	_, exists := room.participants[client.ID]
	assert.False(t, exists, "Client should be removed from the participants map")

	// Assert the client was removed from the draw order queue
	assert.Equal(t, 0, room.clientDrawOrderQueue.Len(), "Draw order queue should be empty")
	assert.Nil(t, client.drawOrderElement, "Client's draw order element should be nil after removal")
}

func TestAddHost(t *testing.T) {
	room := NewTestRoom("test-room", nil)
	client := newTestClient("host-1")

	room.addHost(context.Background(), client)

	_, exists := room.hosts[client.ID]
	assert.True(t, exists, "Client should be in the hosts map")
	assert.Equal(t, RoleTypeHost, client.Role, "Client's role should be host")
	assert.Equal(t, 1, room.clientDrawOrderQueue.Len(), "Draw order queue should have one element")
}

func TestDeleteHost(t *testing.T) {
	room := NewTestRoom("test-room", nil)
	client := newTestClient("host-1")
	room.addHost(context.Background(), client)

	require.Equal(t, 1, len(room.hosts))
	room.deleteHost(context.Background(), client)

	_, exists := room.hosts[client.ID]
	assert.False(t, exists, "Client should be removed from the hosts map")
	assert.Equal(t, 0, room.clientDrawOrderQueue.Len(), "Draw order queue should be empty")
}

func TestAddWaiting(t *testing.T) {
	room := NewTestRoom("test-room", nil)
	client := newTestClient("waiting-client")

	// This is the corrected implementation logic
	client.Role = RoleTypeWaiting
	element := room.waitingDrawOrderStack.PushFront(client)
	client.drawOrderElement = element
	room.waiting[client.ID] = client

	_, exists := room.waiting[client.ID]
	assert.True(t, exists, "Client should be in the waiting map")
	assert.Equal(t, RoleTypeWaiting, client.Role, "Client's role should be waiting")
	assert.Equal(t, 1, room.waitingDrawOrderStack.Len(), "Waiting draw order stack should have one element")

	// Also ensure it wasn't added to the hosts map by mistake
	_, inHosts := room.hosts[client.ID]
	assert.False(t, inHosts, "Client should not be in the hosts map")
}

func TestDeleteWaiting(t *testing.T) {
	room := NewTestRoom("test-room", nil)
	client := newTestClient("waiting-client")

	// Manually add to waiting for the test
	room.waiting[client.ID] = client
	client.drawOrderElement = room.waitingDrawOrderStack.PushFront(client)

	require.Equal(t, 1, len(room.waiting))
	room.deleteWaiting(client)

	_, exists := room.waiting[client.ID]
	assert.False(t, exists, "Client should be removed from the waiting map")
	assert.Equal(t, 0, room.waitingDrawOrderStack.Len(), "Waiting draw order stack should be empty")
}

func TestAddScreenshare(t *testing.T) {
	room := NewTestRoom("test-room", nil)
	client := newTestClient("screenshare-client")

	room.addScreenshare(client)

	_, exists := room.sharingScreen[client.ID]
	assert.True(t, exists, "Client should be in the sharingScreen map")
	assert.Equal(t, RoleTypeScreenshare, client.Role, "Client's role should be screenshare")
	assert.Equal(t, 1, room.clientDrawOrderQueue.Len(), "Draw order queue should have one element")
}

func TestDeleteScreenshare(t *testing.T) {
	room := NewTestRoom("test-room", nil)
	client := newTestClient("screenshare-client")
	room.addScreenshare(client)

	require.Equal(t, 1, len(room.sharingScreen))
	room.deleteScreenshare(client)

	_, exists := room.sharingScreen[client.ID]
	assert.False(t, exists, "Client should be removed from the sharingScreen map")
	assert.Equal(t, 0, room.clientDrawOrderQueue.Len(), "Draw order queue should be empty")
}

func TestIsRoomEmpty(t *testing.T) {
	t.Run("should be empty when no one is present", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		assert.True(t, room.isRoomEmpty(), "Room with no clients should be empty")
	})

	t.Run("should NOT be empty if a participant is present", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		room.addParticipant(context.Background(), newTestClient("p1"))
		assert.False(t, room.isRoomEmpty(), "Room with a participant should not be empty")
	})

	t.Run("should NOT be empty if a host is present", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		room.addHost(context.Background(), newTestClient("h1"))
		assert.False(t, room.isRoomEmpty(), "Room with a host should not be empty")
	})

	t.Run("should be considered empty if only waiting clients are present", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		// Manually add a client to the waiting map
		room.waiting["wait-1"] = newTestClient("wait-1")
		assert.True(t, room.isRoomEmpty(), "Room with only waiting clients should be considered empty")
	})
}
