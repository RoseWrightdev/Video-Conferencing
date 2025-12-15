// Package session - client.go
//
// This file implements the Client struct and related functionality for managing
// individual WebSocket connections within video conference rooms. Each client
// represents a single user's connection and handles bidirectional communication
// between the user's browser and the room server.
//
// Client Architecture:
// - Each client runs two goroutines: readPump and writePump
// - readPump continuously reads messages from the WebSocket connection
// - writePump handles outgoing messages to the client
// - The Client struct maintains connection state and room membership
//
// Connection Management:
// - Automatic reconnection handling and graceful disconnection
// - Message queuing with buffered channels to prevent blocking
// - Connection cleanup and resource management
//
// Interface Design:
// - wsConnection interface allows for easy testing with mock connections
// - Roomer interface enables testing with mock rooms
// - Clean separation of concerns between connection handling and business logic
package session

import (
	"container/list"
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"
	"github.com/gorilla/websocket"
)

// --- Connection and Room Interfaces ---

// wsConnection defines the interface for WebSocket connection operations.
// This abstraction allows for easy testing by enabling mock implementations
// while providing the essential methods needed for real-time communication.
//
// The interface supports the core WebSocket operations:
//   - Reading incoming messages from the client
//   - Writing outgoing messages to the client
//   - Closing the connection when cleanup is needed
//
// Implementation Note:
// In production, this is typically satisfied by *websocket.Conn from the
// gorilla/websocket package. In tests, mock implementations can simulate
// various connection scenarios including errors and disconnections.
type wsConnection interface {
	ReadMessage() (messageType int, p []byte, err error) // Read the next message from the connection
	WriteMessage(messageType int, data []byte) error     // Write a message to the connection
	Close() error                                        // Close the connection
	SetWriteDeadline(t time.Time) error
}

// Roomer defines the interface for room operations that a Client needs.
// This abstraction enables clean separation between client connection handling
// and room business logic, facilitating unit testing and modular design.
//
// The interface provides two essential operations:
//   - Message routing: Forward client messages to appropriate room handlers
//   - Disconnection handling: Cleanup when clients leave the room
//
// Design Benefits:
//   - Enables testing with MockRoom implementations
//   - Reduces coupling between Client and Room structs
//   - Allows for different room implementations if needed
//   - Simplifies dependency injection for testing
//
// Production Usage:
// In production, this interface is implemented by the Room struct,
// providing full room functionality including state management,
// permission checking, and message broadcasting.
type Roomer interface {
	router(ctx context.Context, c *Client, data any) // Route incoming messages to appropriate handlers
	handleClientDisconnect(c *Client)                 // Handle client disconnection cleanup
}

// Client represents a single user's connection to a video conference room.
// Each client maintains its WebSocket connection, room membership, and position
// in various room queues for UI ordering and feature management.
//
// Connection Management:
// The client handles bidirectional WebSocket communication through two
// dedicated goroutines (readPump and writePump) that manage message flow
// between the user's browser and the room server.
//
// State Management:
// The client tracks its identity, role, and position in room draw orders:
//   - ID and DisplayName: User identification from JWT token
//   - Role: Current permission level (waiting, participant, host, screenshare)
//   - drawOrderElement: Position in various UI ordering queues
//
// Channel Design:
// The send channel provides buffered message queuing to prevent goroutines
// from blocking when sending messages to the client. If the buffer fills,
// messages may be dropped rather than blocking the entire room.
//
// Room Integration:
// The client communicates with its room through the Roomer interface,
// enabling clean separation of concerns and easier testing.
type Client struct {
	conn             wsConnection    // WebSocket connection for real-time communication
	send             chan []byte     // Buffered channel for outgoing messages
	room             Roomer          // Room interface for business logic operations
	ID               ClientIdType    // Unique identifier from JWT token
	DisplayName      DisplayNameType // Human-readable name for UI display
	Role             RoleType        // Current permission level in the room
	drawOrderElement *list.Element   // Position reference in room draw order queues
	mu               sync.RWMutex    // Protects concurrent access to Client fields (like Role)
	lastMessageTime  time.Time
	rateLimitEnabled bool // Enable rate limiting (disabled for tests)
}

// Thread-safe reader
func (c *Client) GetRole() RoleType {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Role
}

// Thread-safe writer
func (c *Client) SetRole(role RoleType) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Role = role
}

// readPump continuously processes incoming WebSocket messages from the client.
// This method runs in its own goroutine and handles the complete message lifecycle
// from reception through routing to the appropriate room handlers.
//
// Message Processing Flow:
//  1. Read raw message bytes from WebSocket connection
//  2. Unmarshal JSON into Message struct with event and payload
//  3. Route the parsed message to the room for handling
//  4. Handle connection errors and cleanup
//
// Error Handling:
//   - Connection errors trigger graceful disconnection and room cleanup
//   - JSON unmarshaling errors are logged but don't close the connection
//   - Unexpected close errors are logged with additional detail
//
// Cleanup Guarantee:
// The defer statement ensures that regardless of how this method exits,
// the client will be properly removed from the room and the connection
// will be closed, preventing resource leaks.
//
// Concurrency:
// This method is designed to run as a goroutine and handles the read side
// of the client's bidirectional communication channel.
func (c *Client) readPump() {
	defer func() {
		c.room.handleClientDisconnect(c)
		c.conn.Close()

		// Metrics: Track WebSocket disconnection
		metrics.DecConnection()
	}()

	for {
		const messageRateLimit = 200 * time.Millisecond // Max 5 messages/sec

		if c.rateLimitEnabled && time.Since(c.lastMessageTime) < messageRateLimit {
			slog.Warn("Rate limit exceeded", "id", c.ID)
			continue // Drop the message silently
		}
		c.lastMessageTime = time.Now()

		_, rawBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Warn("Unexpected client close", "ClientId", c.ID, "error", err)
			}
			break
		}

		// We define a temporary struct here with json.RawMessage.
		var incoming struct {
			Event   Event
			Payload json.RawMessage
		}

		if err := json.Unmarshal(rawBytes, &incoming); err != nil {
			slog.Warn("Failed to unmarshal message", "ClientId", c.ID, "error", err)
			continue
		}

		// Now we pass the optimized 'incoming' data to the router.
		// We reconstruct the standard Message struct, but Payload is now []byte (fast!)
		msg := Message{
			Event:   incoming.Event,
			Payload: incoming.Payload,
		}

		// Create request-scoped context with timeout for handler chain
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		c.room.router(ctx, c, msg)
		cancel() // Prevent memory leak
	}
}

// writePump continuously sends queued messages to the client's WebSocket connection.
// This method runs in its own goroutine and handles the complete outgoing message
// lifecycle from channel reception through WebSocket transmission.
//
// Message Flow:
//  1. Read JSON message bytes from the buffered send channel
//  2. Write message to WebSocket connection as text frame
//  3. Handle write errors and connection cleanup
//
// Channel Design:
// The method blocks on reading from the send channel, which is fed by the
// room's broadcast mechanism and direct message sending. The buffered channel
// design prevents blocking when multiple messages are queued simultaneously.
//
// Error Handling:
// Any write error immediately terminates the pump and closes the connection.
// This ensures that clients with broken connections are quickly disconnected
// rather than accumulating in a broken state.
//
// Connection Cleanup:
// The defer statement guarantees the WebSocket connection is closed when
// the method exits, regardless of the exit condition (channel close or error).
//
// Concurrency:
// This method is designed to run as a goroutine and handles the write side
// of the client's bidirectional communication channel. It coordinates with
// readPump to provide full-duplex communication.
func (c *Client) writePump() {
	defer c.conn.Close()

	// Define a timeout duration (e.g., 10 seconds)
	writeWait := 10 * time.Second

	for message := range c.send {
		c.conn.SetWriteDeadline(time.Now().Add(writeWait))

		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			slog.Error("error writing message", "error", err)
			return
		}
	}
	// Loop finishes naturally when 'close(c.send)' is called
	// Send Close Message to client (polite websocket teardown)
	c.conn.WriteMessage(websocket.CloseMessage, []byte{})
}
