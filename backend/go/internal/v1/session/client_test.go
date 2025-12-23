package session

import (
	"context"
	"sync"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"google.golang.org/protobuf/proto"
)

// MockRoom implements Roomer interface for testing
type MockRoom struct {
	mu                   sync.Mutex
	routerCalls          int
	disconnectCalls      int
	createSFUCalls       int
	handleSFUSignalCalls int
	lastMessage          *pb.WebSocketMessage
}

func (m *MockRoom) router(ctx context.Context, client *Client, msg *pb.WebSocketMessage) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.routerCalls++
	m.lastMessage = msg
}

func (m *MockRoom) handleClientDisconnect(c *Client) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.disconnectCalls++
}

func (m *MockRoom) CreateSFUSession(ctx context.Context, client *Client) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.createSFUCalls++
	return nil
}

func (m *MockRoom) HandleSFUSignal(ctx context.Context, client *Client, signal *pb.SignalRequest) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handleSFUSignalCalls++
}

func TestClientGetRole(t *testing.T) {
	client := createTestClient("user1", "User", RoleTypeParticipant)

	// Test thread-safe read
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			role := client.GetRole()
			assert.Equal(t, RoleTypeParticipant, role)
		}()
	}
	wg.Wait()
}

func TestClientSetRole(t *testing.T) {
	client := createTestClient("user1", "User", RoleTypeWaiting)

	// Test thread-safe write
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			client.SetRole(RoleTypeParticipant)
		}()
	}
	wg.Wait()

	assert.Equal(t, RoleTypeParticipant, client.GetRole())
}

func TestClientSendProto(t *testing.T) {
	client := createTestClient("user1", "User", RoleTypeParticipant)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test-chat",
				Content: "Hello",
			},
		},
	}

	client.sendProto(msg)

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

func TestClientSendProto_ChannelFull(t *testing.T) {
	// Create client with small buffer
	client := &Client{
		ID:          "user1",
		DisplayName: "User",
		Role:        RoleTypeParticipant,
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
	client.sendProto(msg)

	// Try to send when full (should not block)
	client.sendProto(msg)
	// If we get here, the test passes (didn't block)
}

func TestClientReadPump(t *testing.T) {
	mockRoom := &MockRoom{}
	mockConn := &MockWSConnection{}

	// Prepare a test message
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_Chat{
			Chat: &pb.ChatRequest{
				Content: "Test message",
			},
		},
	}
	data, _ := proto.Marshal(msg)
	mockConn.readMessages = [][]byte{data}

	client := &Client{
		ID:          "user1",
		DisplayName: "User",
		Role:        RoleTypeParticipant,
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

func TestClientWritePump(t *testing.T) {
	mockConn := &MockWSConnection{}

	client := &Client{
		ID:          "user1",
		DisplayName: "User",
		Role:        RoleTypeParticipant,
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

	// Close send channel to stop write pump
	close(client.send)

	// Wait for processing
	time.Sleep(200 * time.Millisecond)

	// Message should be written
	assert.Greater(t, len(mockConn.writeMessages), 0)
}

func TestClientConcurrentSend(t *testing.T) {
	client := createTestClient("user1", "User", RoleTypeParticipant)

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
			client.sendProto(msg)
		}()
	}
	wg.Wait()

	// Should have messages in channel
	assert.Greater(t, len(client.send), 0)
}

func TestClientCloseOnce(t *testing.T) {
	client := createTestClient("user1", "User", RoleTypeParticipant)

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

func TestMockWSConnection(t *testing.T) {
	conn := &MockWSConnection{
		readMessages: [][]byte{
			[]byte("message1"),
			[]byte("message2"),
		},
	}

	// Read messages
	_, msg1, err := conn.ReadMessage()
	assert.NoError(t, err)
	assert.Equal(t, []byte("message1"), msg1)

	_, msg2, err := conn.ReadMessage()
	assert.NoError(t, err)
	assert.Equal(t, []byte("message2"), msg2)

	// Write message
	err = conn.WriteMessage(websocket.BinaryMessage, []byte("response"))
	assert.NoError(t, err)
	assert.Equal(t, 1, len(conn.writeMessages))

	// Close
	err = conn.Close()
	assert.NoError(t, err)
	assert.True(t, conn.IsClosed())
}

func TestClientRateLimitEnabled(t *testing.T) {
	client := &Client{
		ID:               "user1",
		DisplayName:      "User",
		Role:             RoleTypeParticipant,
		send:             make(chan []byte, 256),
		rateLimitEnabled: true,
	}

	assert.True(t, client.rateLimitEnabled)

	clientNoLimit := &Client{
		ID:               "user2",
		DisplayName:      "User 2",
		Role:             RoleTypeParticipant,
		send:             make(chan []byte, 256),
		rateLimitEnabled: false,
	}

	assert.False(t, clientNoLimit.rateLimitEnabled)
}
