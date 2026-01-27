package room

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func TestNewRoom(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	assert.Equal(t, types.RoomIDType("test-room"), room.ID)
	assert.NotNil(t, room.clients)
	assert.NotNil(t, room.chatHistory)
	assert.Equal(t, 100, room.maxChatHistoryLength)
}

func TestIsRoomEmpty(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Initially empty
	assert.True(t, room.IsRoomEmpty())

	// Add a host
	host := NewMockClient("host1", "Host", types.RoleTypeHost)
	room.addHostLocked(ctx, host)
	assert.False(t, room.IsRoomEmpty())

	// Remove host, add participant
	room.disconnectClientLocked(ctx, host)
	participant := NewMockClient("user1", "User", types.RoleTypeParticipant)
	room.addParticipantLocked(ctx, participant)
	assert.False(t, room.IsRoomEmpty())

	// Remove participant, should be empty
	room.disconnectClientLocked(ctx, participant)
	assert.True(t, room.IsRoomEmpty())
}

func TestHandleClientConnect_FirstUser(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "First User", types.RoleTypeWaiting)

	room.HandleClientConnect(client)

	// First user should be auto-promoted to host
	assert.Equal(t, client, room.clients[client.ID])
	assert.Equal(t, types.RoleTypeHost, client.GetRole())
}

func TestHandleClientConnect_SubsequentUsers(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Add first user as host
	host := NewMockClient("host1", "Host", types.RoleTypeHost)
	room.addHostLocked(ctx, host)
	room.ownerID = host.ID

	// Second user should go to waiting
	client := NewMockClient("user2", "User 2", types.RoleTypeWaiting)
	room.HandleClientConnect(client)

	assert.Equal(t, client, room.clients[client.ID])
	assert.Equal(t, types.RoleTypeWaiting, client.GetRole())
}

func TestHandleClientConnect_DuplicateConnection(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Add first client as host
	oldClient := NewMockClient("user1", "Old Client", types.RoleTypeHost)
	room.addHostLocked(ctx, oldClient)
	room.ownerID = oldClient.ID
	assert.Equal(t, oldClient, room.clients[oldClient.ID])

	// Connect second client with same ID (simulating refresh)
	newClient := NewMockClient("user1", "New Client", types.RoleTypeHost)
	room.HandleClientConnect(newClient)

	// Old client should be replaced
	assert.Equal(t, newClient, room.clients[newClient.ID])
	assert.Equal(t, 1, len(room.clients))
}

func TestHandleClientDisconnect(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}

	roomCleanupCalled := false
	onEmptyCallback := func(_ types.RoomIDType) {
		roomCleanupCalled = true
	}

	room := NewRoom(context.Background(), "test-room", onEmptyCallback, mockBus, nil)
	client := NewMockClient("user1", "User", types.RoleTypeParticipant)

	room.addParticipantLocked(ctx, client)
	assert.Equal(t, client, room.clients[client.ID])

	// Disconnect
	room.HandleClientDisconnect(client)

	// Client should be removed
	_, ok := room.clients[client.ID]
	assert.False(t, ok)

	// Room should trigger cleanup callback
	time.Sleep(100 * time.Millisecond)
	assert.True(t, roomCleanupCalled)
}

func TestBroadcast(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Add host and participant
	host := NewMockClient("host1", "Host", types.RoleTypeHost)
	participant := NewMockClient("user1", "User", types.RoleTypeParticipant)

	room.addHostLocked(ctx, host)
	room.addParticipantLocked(ctx, participant)

	// Create a message to broadcast
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test-chat",
				Content: "Hello",
			},
		},
	}

	// Broadcast
	room.Broadcast(msg)

	// Allow goroutines to process
	time.Sleep(100 * time.Millisecond)

	// Both clients should receive the message
	assert.Greater(t, len(host.SentMessages), 0)
	assert.Greater(t, len(participant.SentMessages), 0)
}

func TestBroadcastRoomState(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	host := NewMockClient("host1", "Host", types.RoleTypeHost)
	room.addHostLocked(ctx, host)

	// Broadcast room state
	room.BroadcastRoomState(ctx)

	// Allow time for async operations
	time.Sleep(100 * time.Millisecond)

	// Host should receive room state
	assert.Greater(t, len(host.SentMessages), 0)
}

func TestSendRoomStateToClient(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	host := NewMockClient("host1", "Host", types.RoleTypeHost)
	room.addHostLocked(context.Background(), host)

	// Send state to client
	room.sendRoomStateToClient(host)

	// Client should receive a message
	assert.Greater(t, len(host.SentMessages), 0)
}

func TestRouter(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	client := NewMockClient("user1", "User", types.RoleTypeHost)
	room.addHostLocked(ctx, client)

	tests := []struct {
		name    string
		message *pb.WebSocketMessage
	}{
		{
			name: "Chat message",
			message: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_Chat{
					Chat: &pb.ChatRequest{
						Content: "Hello",
					},
				},
			},
		},
		{
			name: "Toggle media",
			message: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_ToggleMedia{
					ToggleMedia: &pb.ToggleMediaRequest{
						Kind:      "audio",
						IsEnabled: true,
					},
				},
			},
		},
		{
			name: "Toggle hand",
			message: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_ToggleHand{
					ToggleHand: &pb.ToggleHandRequest{
						IsRaised: true,
					},
				},
			},
		},
		{
			name: "Join (SFU Session)",
			message: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_Join{
					Join: &pb.JoinRequest{
						Token:       "test-token",
						RoomId:      "test-room",
						DisplayName: "User",
					},
				},
			},
		},
	}

	mockSfu := &MockSFUProvider{}
	room.sfu = mockSfu

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			room.Router(ctx, client, tt.message)
			if tt.name == "Join (SFU Session)" {
				assert.True(t, mockSfu.CreateSessionCalled)
			}
		})
	}
}

func TestConcurrentClientOperations(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	var wg sync.WaitGroup
	numClients := 10

	// Add multiple clients concurrently
	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			client := NewMockClient(fmt.Sprintf("user-%d", id), "User", types.RoleTypeParticipant)
			room.HandleClientConnect(client)
		}(i)
	}

	wg.Wait()

	// All clients should be added
	totalClients := len(room.clients)
	assert.Equal(t, numClients, totalClients)
}

func TestWaitingRoomOrdering(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Add multiple users to waiting
	user1 := NewMockClient("user1", "User 1", types.RoleTypeWaiting)
	user2 := NewMockClient("user2", "User 2", types.RoleTypeWaiting)
	user3 := NewMockClient("user3", "User 3", types.RoleTypeWaiting)

	room.addWaitingLocked(user1)
	room.addWaitingLocked(user2)
	room.addWaitingLocked(user3)

	// Stack should maintain FIFO order (PushFront means newest first)
	assert.Equal(t, 3, room.waitingDrawOrderStack.Len())

	// Front should be most recent (user3)
	front := room.waitingDrawOrderStack.Front()
	assert.Equal(t, user3, front.Value)
}

func TestCloseRoom(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	host := NewMockClient("host1", "Host", types.RoleTypeHost)
	participant := NewMockClient("user1", "User", types.RoleTypeParticipant)

	r.addHostLocked(ctx, host)
	r.addParticipantLocked(ctx, participant)

	// Close the room
	r.CloseRoom("End of meeting")

	// Both clients should be disconnected
	assert.True(t, host.isDisconnected)
	assert.True(t, participant.isDisconnected)

	// Both clients should receive the room_closed message
	assert.Greater(t, len(host.SentMessages), 0)
	assert.Greater(t, len(participant.SentMessages), 0)

	msg := host.SentMessages[len(host.SentMessages)-1]
	adminEvent := msg.GetAdminEvent()
	assert.NotNil(t, adminEvent)
	assert.Equal(t, "room_closed", adminEvent.Action)
}
