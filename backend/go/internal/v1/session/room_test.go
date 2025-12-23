package session

import (
	"context"
	"sync"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

// MockWSConnection implements wsConnection interface for testing
type MockWSConnection struct {
	mu            sync.Mutex
	readMessages  [][]byte
	writeMessages [][]byte
	readIndex     int
	closed        bool
}

func (m *MockWSConnection) ReadMessage() (messageType int, p []byte, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.readIndex >= len(m.readMessages) {
		time.Sleep(100 * time.Millisecond) // Simulate blocking read
		return 0, nil, websocket.ErrCloseSent
	}

	msg := m.readMessages[m.readIndex]
	m.readIndex++
	return websocket.BinaryMessage, msg, nil
}

func (m *MockWSConnection) WriteMessage(messageType int, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.writeMessages = append(m.writeMessages, data)
	return nil
}

func (m *MockWSConnection) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.closed = true
	return nil
}

func (m *MockWSConnection) SetWriteDeadline(t time.Time) error {
	return nil
}

func (m *MockWSConnection) IsClosed() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.closed
}

func TestNewRoom(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	assert.Equal(t, RoomIdType("test-room"), room.ID)
	assert.NotNil(t, room.hosts)
	assert.NotNil(t, room.participants)
	assert.NotNil(t, room.waiting)
	assert.NotNil(t, room.chatHistory)
	assert.Equal(t, 100, room.maxChatHistoryLength)
}

func TestIsRoomEmpty(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Initially empty
	assert.True(t, room.isRoomEmpty())

	// Add a host
	host := createTestClient("host1", "Host", RoleTypeHost)
	room.addHost(ctx, host)
	assert.False(t, room.isRoomEmpty())

	// Remove host, add participant
	room.deleteHost(ctx, host)
	participant := createTestClient("user1", "User", RoleTypeParticipant)
	room.addParticipant(ctx, participant)
	assert.False(t, room.isRoomEmpty())

	// Remove participant, should be empty
	room.deleteParticipant(ctx, participant)
	assert.True(t, room.isRoomEmpty())
}

func TestHandleClientConnect_FirstUser(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "First User", RoleTypeWaiting)

	room.handleClientConnect(client)

	// First user should be auto-promoted to host
	assert.Contains(t, room.hosts, client.ID)
	assert.Equal(t, RoleTypeHost, client.Role)
	assert.NotContains(t, room.waiting, client.ID)
}

func TestHandleClientConnect_SubsequentUsers(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Add first user as host
	host := createTestClient("host1", "Host", RoleTypeHost)
	room.addHost(ctx, host)

	// Second user should go to waiting
	client := createTestClient("user2", "User 2", RoleTypeWaiting)
	room.handleClientConnect(client)

	assert.Contains(t, room.waiting, client.ID)
	assert.Equal(t, RoleTypeWaiting, client.Role)
	assert.NotContains(t, room.participants, client.ID)
}

func TestHandleClientConnect_DuplicateConnection(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Add first client as host
	oldClient := createTestClient("user1", "Old Client", RoleTypeHost)
	room.addHost(ctx, oldClient)
	assert.Contains(t, room.hosts, oldClient.ID)

	// Connect second client with same ID (simulating refresh)
	newClient := createTestClient("user1", "New Client", RoleTypeHost)
	room.handleClientConnect(newClient)

	// Old client should be replaced
	// Since first user, should still be host
	assert.Contains(t, room.hosts, newClient.ID)
	assert.Equal(t, 1, len(room.hosts))
}

func TestHandleClientDisconnect(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}

	roomCleanupCalled := false
	onEmptyCallback := func(roomId RoomIdType) {
		roomCleanupCalled = true
	}

	room := NewRoom("test-room", onEmptyCallback, mockBus, nil)
	client := createTestClient("user1", "User", RoleTypeParticipant)

	room.addParticipant(ctx, client)
	assert.Contains(t, room.participants, client.ID)

	// Disconnect
	room.handleClientDisconnect(client)

	// Client should be removed
	assert.NotContains(t, room.participants, client.ID)

	// Room should trigger cleanup callback
	time.Sleep(100 * time.Millisecond)
	assert.True(t, roomCleanupCalled)
}

func TestBroadcast(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Add host and participant
	host := createTestClient("host1", "Host", RoleTypeHost)
	participant := createTestClient("user1", "User", RoleTypeParticipant)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)

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
	assert.Greater(t, len(host.send), 0)
	assert.Greater(t, len(participant.send), 0)
}

func TestBroadcastRoomState(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	room.addHost(ctx, host)

	// Broadcast room state
	room.BroadcastRoomState(ctx)

	// Allow time for async operations
	time.Sleep(100 * time.Millisecond)

	// Host should receive room state
	assert.Greater(t, len(host.send), 0)
}

func TestSendRoomStateToClient(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	room.addHost(ctx, host)

	// Send state to client
	room.sendRoomStateToClient(host)

	// Client should receive a message
	assert.Greater(t, len(host.send), 0)
}

func TestRouter(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	client := createTestClient("user1", "User", RoleTypeHost)
	room.addHost(ctx, client)

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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Should not panic
			room.router(ctx, client, tt.message)
		})
	}
}

func TestConcurrentClientOperations(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	var wg sync.WaitGroup
	numClients := 10

	// Add multiple clients concurrently
	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			client := createTestClient(string(rune(id)), "User", RoleTypeParticipant)
			room.handleClientConnect(client)
		}(i)
	}

	wg.Wait()

	// First should be host, rest in waiting
	totalClients := len(room.hosts) + len(room.participants) + len(room.waiting)
	assert.Equal(t, numClients, totalClients)
}

func TestWaitingRoomOrdering(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Add multiple users to waiting
	user1 := createTestClient("user1", "User 1", RoleTypeWaiting)
	user2 := createTestClient("user2", "User 2", RoleTypeWaiting)
	user3 := createTestClient("user3", "User 3", RoleTypeWaiting)

	room.addWaiting(user1)
	room.addWaiting(user2)
	room.addWaiting(user3)

	// Stack should maintain FIFO order (PushFront means newest first)
	assert.Equal(t, 3, room.waitingDrawOrderStack.Len())

	// Front should be most recent (user3)
	front := room.waitingDrawOrderStack.Front()
	assert.Equal(t, user3, front.Value)
}
