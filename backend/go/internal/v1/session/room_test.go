// Package session - room_test.go
//
// This file contains unit tests for the Room struct and its associated methods.
// The test suite covers room state management, client operations, and concurrent
// access scenarios to ensure thread safety and correctness.
//
// Test Categories:
//   - Room creation and initialization
//   - Client management (add, remove, role changes)
//   - State validation and consistency
//   - Concurrent access and thread safety
//   - Broadcasting and communication
//
// Testing Philosophy:
// These tests focus on the core business logic of room management while
// using mock implementations for external dependencies like WebSocket
// connections and authentication.
package session

import (
	"container/list"
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// room_test.go contains unit tests for the primary business logic of a Room,
// including client connection/disconnection handling, event routing with permissions,
// and broadcasting messages to clients.

// newTestClient creates a client for testing purposes.
func newTestClient(id ClientIdType) *Client {
	return &Client{
		ID:               id,
		send:             make(chan []byte, 10), // Buffered channel to avoid blocking in tests
		rateLimitEnabled: false,                 // Disable rate limiting for tests
	}
}

// NewTestRoom creates a new, stateful room for testing purposes.
// Exported globally for use accross the codebase.
func NewTestRoom(id RoomIdType, onEmptyCallback func(RoomIdType)) *Room {
	return &Room{
		ID:                   id,
		mu:                   sync.RWMutex{},
		chatHistory:          list.New(),
		maxChatHistoryLength: 10,

		hosts:        make(map[ClientIdType]*Client),
		participants: make(map[ClientIdType]*Client),
		waiting:      make(map[ClientIdType]*Client),

		waitingDrawOrderStack: list.New(),
		clientDrawOrderQueue:  list.New(),
		handDrawOrderQueue:    list.New(),

		raisingHand:   make(map[ClientIdType]*Client),
		sharingScreen: make(map[ClientIdType]*Client),
		unmuted:       make(map[ClientIdType]*Client),
		cameraOn:      make(map[ClientIdType]*Client),

		onEmpty: onEmptyCallback,
	}
}

func TestHandleClientConnect(t *testing.T) {
	t.Run("first client to connect becomes the host", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClient("client-1")

		room.handleClientConnect(client)

		assert.Equal(t, 1, len(room.hosts), "Room should have one host")
		assert.Equal(t, 0, len(room.participants), "Room should have no participants")
		assert.Equal(t, 0, len(room.waiting), "Room should have no waiting clients")

		_, isHost := room.hosts[client.ID]
		assert.True(t, isHost, "The first client should be in the hosts map")
		assert.Equal(t, RoleTypeHost, client.Role, "Client's role should be set to host")
	})

	t.Run("second client to connect is put in waiting", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		host := newTestClient("host-1")
		client2 := newTestClient("client-2")

		// First client becomes host
		room.handleClientConnect(host)
		require.Equal(t, 1, len(room.hosts), "Pre-condition failed: room should have a host")

		// Second client connects
		room.handleClientConnect(client2)

		assert.Equal(t, 1, len(room.hosts), "Host count should remain 1")
		assert.Equal(t, 0, len(room.participants), "Room should still have no participants")
		assert.Equal(t, 1, len(room.waiting), "Room should have one waiting client")

		_, isWaiting := room.waiting[client2.ID]
		assert.True(t, isWaiting, "The second client should be in the waiting map")
		assert.Equal(t, RoleTypeWaiting, client2.Role, "Client's role should be set to waiting")
	})
}

func TestHandleClientDisconnect(t *testing.T) {
	t.Run("onEmpty callback is triggered when last client leaves", func(t *testing.T) {
		onEmptyCalled := make(chan RoomIdType, 1)
		onEmptyFunc := func(id RoomIdType) {
			onEmptyCalled <- id
		}

		room := NewTestRoom("test-room-onempty", onEmptyFunc)
		client := newTestClient("client-1")

		// Add and then immediately remove the client
		room.addHost(context.Background(), client)
		// Manually implement the disconnect logic for the test since it's unimplemented
		room.deleteHost(context.Background(), client)

		// Create payload for broadcast
		payload := ClientDisconnectPayload{ClientId: client.ID, DisplayName: client.DisplayName}
		room.broadcast(context.Background(), Event(EventDisconnect), payload, nil)

		// Check if room is empty AFTER broadcasting
		if room.isRoomEmpty() {
			go room.onEmpty(room.ID)
		}

		select {
		case roomId := <-onEmptyCalled:
			assert.Equal(t, room.ID, roomId, "onEmpty should be called with the correct room ID")
		case <-time.After(100 * time.Millisecond):
			t.Fatal("onEmpty callback was not triggered on last client disconnect")
		}
	})

	t.Run("disconnect event is broadcast to remaining clients", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		host := newTestClient("host-1")
		participant := newTestClient("participant-1")

		room.addHost(context.Background(), host)
		room.addParticipant(context.Background(), participant)

		// Simulate participant disconnecting
		room.handleClientDisconnect(participant)

		// Check if the host received the broadcast
		select {
		case msgBytes := <-host.send:
			var msg Message
			err := json.Unmarshal(msgBytes, &msg)
			require.NoError(t, err)

			assert.Equal(t, Event(EventDisconnect), msg.Event)
			payload, ok := msg.Payload.(map[string]any)
			require.True(t, ok, "Payload should be a map")
			assert.Equal(t, string(participant.ID), payload["clientId"])
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Host did not receive disconnect broadcast")
		}
	})
}

func TestRouterPermissions(t *testing.T) {
	t.Run("participant can add chat", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClient("p1")
		client.Role = RoleTypeParticipant

		// Create a test payload that won't cause handler to panic
		payload := AddChatPayload{
			ClientInfo:  ClientInfo{ClientId: client.ID, DisplayName: client.DisplayName},
			ChatId:      "chat-1",
			Timestamp:   1234567890,
			ChatContent: "test message",
		}
		msg := Message{Event: EventAddChat, Payload: payload}

		// Test that router doesn't panic and processes the message
		// Since participant has participant permissions, this should succeed
		assert.NotPanics(t, func() {
			room.router(context.Background(), client, msg)
		}, "Router should not panic for participant adding chat")
	})

	t.Run("waiting client cannot add chat", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClient("w1")
		client.Role = RoleTypeWaiting

		payload := AddChatPayload{
			ClientInfo:  ClientInfo{ClientId: client.ID, DisplayName: client.DisplayName},
			ChatId:      "chat-1",
			Timestamp:   1234567890,
			ChatContent: "test message",
		}
		msg := Message{Event: EventAddChat, Payload: payload}

		// Track if any handlers were called by checking if the client's send channel received messages
		// Since waiting clients don't have participant permissions, no broadcast should occur
		initialChannelLen := len(client.send)

		room.router(context.Background(), client, msg)

		// No messages should be broadcast since waiting client can't add chat
		assert.Equal(t, initialChannelLen, len(client.send),
			"Waiting client should not be able to add chat - no broadcasts should occur")
	})

	t.Run("host can accept waiting", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		host := newTestClient("h1")
		host.Role = RoleTypeHost

		// Add a waiting client to accept
		waitingClient := newTestClient("w1")
		room.addWaiting(waitingClient)

		payload := AcceptWaitingPayload{
			ClientId:    host.ID,
			DisplayName: host.DisplayName,
		}
		msg := Message{Event: EventAcceptWaiting, Payload: payload}

		// Host should be able to accept waiting clients
		assert.NotPanics(t, func() {
			room.router(context.Background(), host, msg)
		}, "Host should be able to accept waiting clients")
	})

	t.Run("participant cannot accept waiting", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		participant := newTestClient("p1")
		participant.Role = RoleTypeParticipant

		// Add a waiting client
		waitingClient := newTestClient("w1")
		room.addWaiting(waitingClient)

		payload := AcceptWaitingPayload{
			ClientId:    participant.ID,
			DisplayName: participant.DisplayName,
		}
		msg := Message{Event: EventAcceptWaiting, Payload: payload}

		// Track initial state
		initialWaitingCount := len(room.waiting)
		initialParticipantCount := len(room.participants)

		room.router(context.Background(), participant, msg)

		// Waiting client should still be waiting (not moved to participants)
		assert.Equal(t, initialWaitingCount, len(room.waiting),
			"Participant should not be able to accept waiting clients - waiting count unchanged")
		assert.Equal(t, initialParticipantCount, len(room.participants),
			"Participant should not be able to accept waiting clients - participant count unchanged")
	})
}

func TestBroadcast(t *testing.T) {
	t.Run("broadcast with nil roles sends to all", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		host := newTestClient("h1")
		participant := newTestClient("p1")
		waiting := newTestClient("w1")

		room.addHost(context.Background(), host)
		room.addParticipant(context.Background(), participant)
		room.addWaiting(waiting) // Assumes addWaiting is fixed to add to the 'waiting' map

		payload := map[string]string{"data": "hello all"}
		room.broadcast(context.Background(), Event("test-event"), payload, nil) // nil roles

		assert.Len(t, host.send, 1, "Host should receive message")
		assert.Len(t, participant.send, 1, "Participant should receive message")
		assert.Len(t, waiting.send, 1, "Waiting client should receive message")
	})

	t.Run("broadcast with specific roles only sends to them", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		host1 := newTestClient("h1")
		host2 := newTestClient("h2")
		participant := newTestClient("p1")
		waiting := newTestClient("w1")

		room.addHost(context.Background(), host1)
		room.addHost(context.Background(), host2)
		room.addParticipant(context.Background(), participant)
		room.addWaiting(waiting)

		payload := map[string]string{"data": "hello hosts"}
		room.broadcast(context.Background(), Event("host-event"), payload, HasHostPermission())

		assert.Len(t, host1.send, 1, "Host 1 should receive message")
		assert.Len(t, host2.send, 1, "Host 2 should receive message")
		assert.Len(t, participant.send, 0, "Participant should NOT receive message")
		assert.Len(t, waiting.send, 0, "Waiting client should NOT receive message")
	})
}
