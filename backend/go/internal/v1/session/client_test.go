package session

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

// MockConn is a mock implementation of our wsConnection interface.
type MockConn struct {
	ReadMessages    chan []byte
	WrittenMessages chan []byte
	CloseCalled     chan bool
	ReadError       error
	WriteError      error
}

// SetWriteDeadline sets the write deadline for the connection.
func (m *MockConn) SetWriteDeadline(t time.Time) error {
	return nil // No-op for mock
}

// newMockConn creates a properly initialized MockConn for testing.
func newMockConn() *MockConn {
	return &MockConn{
		ReadMessages:    make(chan []byte, 5),
		WrittenMessages: make(chan []byte, 5),
		CloseCalled:     make(chan bool, 1),
	}
}

// ReadMessage reads the next message from the mock connection.
// It returns the message type, the message data, and an error, if any.
// If a predefined ReadError is set, it returns that error.
// If the ReadMessages channel is closed, it returns a websocket.CloseError with CloseNormalClosure code.
// Otherwise, it returns the next message from the ReadMessages channel as a TextMessage.
func (m *MockConn) ReadMessage() (int, []byte, error) {
	if m.ReadError != nil {
		return 0, nil, m.ReadError
	}
	msg, ok := <-m.ReadMessages
	if !ok {
		return 0, nil, &websocket.CloseError{Code: websocket.CloseNormalClosure}
	}
	return websocket.TextMessage, msg, nil
}

// WriteMessage simulates writing a message to a connection. It sends the provided data
// to the WrittenMessages channel unless WriteError is set, in which case it returns the error.
// This method is typically used in tests to mock WebSocket or similar message-based connections.
func (m *MockConn) WriteMessage(Event int, data []byte) error {
	if m.WriteError != nil {
		return m.WriteError
	}
	m.WrittenMessages <- data
	return nil
}

// Close signals that the connection is being closed by sending a value to the CloseCalled channel.
// If the channel is full, the signal is dropped. Always returns nil to satisfy the io.Closer interface.
func (m *MockConn) Close() error {
	select {
	case m.CloseCalled <- true:
	default:
	}
	return nil
}

// MockRoom is a mock implementation of a Room for testing the client.
type MockRoom struct {
	mu               sync.Mutex
	handledMessage   chan Message
	clientLeftCalled chan *Client
}

// newMockRoom creates and returns a new instance of MockRoom with initialized channels
// for handled messages and client left notifications. This is typically used for testing
// purposes to simulate room behavior in unit tests.
func newMockRoom() *MockRoom {
	return &MockRoom{
		handledMessage:   make(chan Message, 5),
		clientLeftCalled: make(chan *Client, 1),
	}
}

// router processes an incoming Message from a Client and sends it to the handledMessage channel.
// It acquires a lock to ensure thread-safe access to the handledMessage channel.
func (m *MockRoom) router(ctx context.Context, c *Client, data any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handledMessage <- data.(Message)
}

// handleClientDisconnect is called when a client disconnects; it notifies the test via channel.
func (m *MockRoom) handleClientDisconnect(c *Client) {
	select {
	case m.clientLeftCalled <- c:
	default:
	}
}

// --- Tests ---
func TestClient_readPump(t *testing.T) {
	t.Run("should handle messages and pass to room", func(t *testing.T) {
		mockConn := newMockConn()
		mockRoom := newMockRoom()
		client := &Client{conn: mockConn, room: mockRoom, ID: "test-user", rateLimitEnabled: false}

		go client.readPump()

		// Send a valid message
		chatMsg := Message{Event: Event(EventAddChat), Payload: AddChatPayload{ChatContent: "hello"}}
		msgBytes, _ := json.Marshal(chatMsg)
		mockConn.ReadMessages <- msgBytes

		// Verify the room's router was called
		select {
		case handled := <-mockRoom.handledMessage:
			assert.Equal(t, Event(EventAddChat), handled.Event)
		case <-time.After(100 * time.Millisecond):
			t.Fatal("timed out waiting for room to handle message")
		}

		// Close the connection to stop the pump
		close(mockConn.ReadMessages)
	})

	t.Run("should continue on json unmarshal error", func(t *testing.T) {
		mockConn := newMockConn()
		mockRoom := newMockRoom()
		client := &Client{conn: mockConn, room: mockRoom, rateLimitEnabled: false}

		go client.readPump()

		// Send invalid JSON
		mockConn.ReadMessages <- []byte("{not_json}")

		// Send a valid message afterwards to ensure the loop didn't break
		chatMsg := Message{Event: Event(EventAddChat)}
		msgBytes, _ := json.Marshal(chatMsg)
		mockConn.ReadMessages <- msgBytes

		select {
		case <-mockRoom.handledMessage:
			// Success, the pump continued
		case <-time.After(100 * time.Millisecond):
			t.Fatal("readPump should have continued after unmarshal error")
		}
		close(mockConn.ReadMessages)
	})

	t.Run("should exit and clean up on read error", func(t *testing.T) {
		mockConn := newMockConn()
		mockConn.ReadError = errors.New("network error")
		mockRoom := newMockRoom()
		client := &Client{conn: mockConn, room: mockRoom, rateLimitEnabled: false}

		// Run the pump directly as it will exit immediately
		client.readPump()

		// Verify that handleClientLeft was called
		select {
		case leftClient := <-mockRoom.clientLeftCalled:
			assert.Equal(t, client, leftClient)
		case <-time.After(100 * time.Millisecond):
			t.Fatal("timed out waiting for handleClientLeft to be called")
		}

		// Verify that the connection was closed
		select {
		case <-mockConn.CloseCalled:
			// Success
		case <-time.After(100 * time.Millisecond):
			t.Fatal("timed out waiting for connection to be closed")
		}
	})
}

func TestClient_writePump(t *testing.T) {
	t.Run("should write messages from send channel", func(t *testing.T) {
		mockConn := newMockConn()
		client := &Client{
			conn:             mockConn,
			send:             make(chan []byte, 1),
			rateLimitEnabled: false,
		}

		go client.writePump()

		testMessage := []byte("hello from server")
		client.send <- testMessage

		select {
		case written := <-mockConn.WrittenMessages:
			assert.Equal(t, testMessage, written)
		case <-time.After(100 * time.Millisecond):
			t.Fatal("timed out waiting for message to be written")
		}
		close(client.send)
	})

	t.Run("should exit and close on write error", func(t *testing.T) {
		mockConn := newMockConn()
		mockConn.WriteError = errors.New("write error")
		client := &Client{
			conn:             mockConn,
			send:             make(chan []byte, 1),
			rateLimitEnabled: false,
		}

		go client.writePump()

		client.send <- []byte("this will fail")

		// Verify that the connection was closed
		select {
		case <-mockConn.CloseCalled:
			// Success
		case <-time.After(100 * time.Millisecond):
			t.Fatal("timed out waiting for connection to be closed on write error")
		}
	})
}
