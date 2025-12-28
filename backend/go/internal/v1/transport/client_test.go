package transport

import (
	"context"
	"sync"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"google.golang.org/protobuf/proto"
)

// MockRoom implements types.Roomer interface for testing
type MockRoom struct {
	mu                   sync.Mutex
	routerCalls          int
	disconnectCalls      int
	createSFUCalls       int
	handleSFUSignalCalls int
	lastMessage          *pb.WebSocketMessage
}

func (m *MockRoom) GetID() types.RoomIdType { return "test-room" }
func (m *MockRoom) BuildRoomStateProto(ctx context.Context) *pb.RoomStateEvent {
	return &pb.RoomStateEvent{}
}

func (m *MockRoom) Router(ctx context.Context, client types.ClientInterface, msg *pb.WebSocketMessage) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.routerCalls++
	m.lastMessage = msg
}

func (m *MockRoom) HandleClientDisconnect(c types.ClientInterface) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.disconnectCalls++
}

func (m *MockRoom) CreateSFUSession(ctx context.Context, client types.ClientInterface) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.createSFUCalls++
	return nil
}

func (m *MockRoom) HandleSFUSignal(ctx context.Context, client types.ClientInterface, signal *pb.SignalRequest) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handleSFUSignalCalls++
}

// Helper to create a client for testing
func newTestClient(id string, name string, role types.RoleType) *Client {
	return &Client{
		ID:           types.ClientIdType(id),
		DisplayName:  types.DisplayNameType(name),
		Role:         role,
		send:         make(chan []byte, 256),
		prioritySend: make(chan []byte, 256),
	}
}

func TestClientGetRole(t *testing.T) {
	client := newTestClient("user1", "User", types.RoleTypeParticipant)

	// Test thread-safe read
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			role := client.GetRole()
			assert.Equal(t, types.RoleTypeParticipant, role)
		}()
	}
	wg.Wait()
}

func TestClientSetRole(t *testing.T) {
	client := newTestClient("user1", "User", types.RoleTypeWaiting)

	// Test thread-safe write
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client.SetRole(types.RoleTypeParticipant)
		}()
	}
	wg.Wait()

	assert.Equal(t, types.RoleTypeParticipant, client.GetRole())
}

func TestClientSendProto(t *testing.T) {
	client := newTestClient("user1", "User", types.RoleTypeParticipant)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test-chat",
				Content: "Hello",
			},
		},
	}

	client.SendProto(msg)

	// Should have message in send channel
	select {
	case data := <-client.send:
		var received pb.WebSocketMessage
		err := proto.Unmarshal(data, &received)
		assert.NoError(t, err)
		assert.NotNil(t, received.GetChatEvent())
	case <-time.After(1 * time.Second):
		t.Fatal("Message not sent")
	}
}

func TestClientSendProto_Priority(t *testing.T) {
	client := newTestClient("user1", "User", types.RoleTypeParticipant)

	// RoomState messages should go to priority channel
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_RoomState{
			RoomState: &pb.RoomStateEvent{
				Participants: []*pb.ParticipantInfo{},
			},
		},
	}

	client.SendProto(msg)

	// Should have message in prioritySend channel
	select {
	case data := <-client.prioritySend:
		var received pb.WebSocketMessage
		err := proto.Unmarshal(data, &received)
		assert.NoError(t, err)
		assert.NotNil(t, received.GetRoomState())
	case <-time.After(1 * time.Second):
		t.Fatal("Priority message not sent")
	}
}

func TestClientSendProto_ClosedClient(t *testing.T) {
	client := newTestClient("user1", "User", types.RoleTypeParticipant)

	// Mark client as closed
	client.mu.Lock()
	client.closed = true
	client.mu.Unlock()

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	// Should not panic or block when sending to closed client
	client.SendProto(msg)

	// Verify no message was sent
	select {
	case <-client.send:
		t.Fatal("Message should not have been sent to closed client")
	case <-time.After(100 * time.Millisecond):
		// Expected - no message sent
	}
}

func TestClientSendProto_ChannelFull(t *testing.T) {
	// Create client with small buffer
	client := &Client{
		ID:          "user1",
		DisplayName: "User",
		Role:        types.RoleTypeParticipant,
		send:        make(chan []byte, 1),
	}

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	// Fill the channel
	client.SendProto(msg)

	// Try to send when full (should not block)
	client.SendProto(msg)
	// If we get here, the test passes (didn't block)
}

func TestClientReadPump(t *testing.T) {
	mockRoom := &MockRoom{}
	mockConn := &MockConnection{}

	// Prepare a test message
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_Chat{
			Chat: &pb.ChatRequest{
				Content: "Test message",
			},
		},
	}
	data, _ := proto.Marshal(msg)

	msgSent := false
	mockConn.ReadMessageFunc = func() (int, []byte, error) {
		if !msgSent {
			msgSent = true
			return websocket.BinaryMessage, data, nil
		}
		time.Sleep(100 * time.Millisecond)
		return 0, nil, assert.AnError // Exit pump
	}

	client := &Client{
		ID:          "user1",
		DisplayName: "User",
		Role:        types.RoleTypeParticipant,
		conn:        mockConn,
		room:        mockRoom,
		send:        make(chan []byte, 256),
	}

	// Start read pump in goroutine
	go client.readPump()

	// Wait for processing
	time.Sleep(200 * time.Millisecond)

	// Room router should have been called
	mockRoom.mu.Lock()
	assert.Greater(t, mockRoom.routerCalls, 0)
	mockRoom.mu.Unlock()
}

func TestClientReadPump_InvalidProto(t *testing.T) {
	mockRoom := &MockRoom{}
	mockConn := &MockConnection{}

	msgSent := false
	mockConn.ReadMessageFunc = func() (int, []byte, error) {
		if !msgSent {
			msgSent = true
			return websocket.BinaryMessage, []byte("invalid proto"), nil
		}
		return 0, nil, assert.AnError
	}

	client := &Client{
		ID:          "user1",
		DisplayName: "User",
		Role:        types.RoleTypeParticipant,
		conn:        mockConn,
		room:        mockRoom,
		send:        make(chan []byte, 256),
	}

	// Start read pump in goroutine
	go client.readPump()

	// Wait for processing
	time.Sleep(200 * time.Millisecond)

	// Router should not have been called due to invalid proto
	mockRoom.mu.Lock()
	assert.Equal(t, 0, mockRoom.routerCalls)
	mockRoom.mu.Unlock()
}

func TestClientWritePump(t *testing.T) {
	mockConn := &MockConnection{}
	writeChan := make(chan []byte, 1)
	mockConn.WriteMessageFunc = func(mt int, data []byte) error {
		writeChan <- data
		return nil
	}

	client := &Client{
		ID:          "user1",
		DisplayName: "User",
		Role:        types.RoleTypeParticipant,
		conn:        mockConn,
		send:        make(chan []byte, 256),
	}

	// Start write pump
	go client.writePump()

	// Send a message
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}
	data, _ := proto.Marshal(msg)
	client.send <- data

	// Wait for processing
	select {
	case written := <-writeChan:
		assert.Equal(t, data, written)
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Message was not written")
	}

	// Close to stop
	client.mu.Lock()
	client.closed = true
	client.mu.Unlock()
	close(client.send)
}

func TestClientConcurrentSend(t *testing.T) {
	client := newTestClient("user1", "User", types.RoleTypeParticipant)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	// Send from multiple goroutines
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client.SendProto(msg)
		}()
	}
	wg.Wait()

	// Should have messages in channel
	assert.Greater(t, len(client.send), 0)
}

func TestClientCloseOnce(t *testing.T) {
	client := newTestClient("user1", "User", types.RoleTypeParticipant)

	// Close multiple times (should not panic)
	for i := 0; i < 5; i++ {
		client.closeOnce.Do(func() {
			close(client.send)
		})
	}

	// Channel should be closed
	_, ok := <-client.send
	assert.False(t, ok)
}

func TestClientRateLimitEnabled(t *testing.T) {
	client := &Client{
		rateLimitEnabled: true,
	}

	assert.True(t, client.rateLimitEnabled)

	clientNoLimit := &Client{
		rateLimitEnabled: false,
	}

	assert.False(t, clientNoLimit.rateLimitEnabled)
}
