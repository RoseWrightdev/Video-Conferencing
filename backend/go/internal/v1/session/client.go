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
	"log/slog"
	"sync"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"
	"github.com/gorilla/websocket"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"google.golang.org/protobuf/proto"
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
	router(ctx context.Context, client *Client, msg *pb.WebSocketMessage)
	handleClientDisconnect(c *Client)                // Handle client disconnection cleanup
	CreateSFUSession(ctx context.Context, client *Client) error
	HandleSFUSignal(ctx context.Context, client *Client, signal *pb.SignalRequest)
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
func (c *Client) readPump() {
	defer func() {
		c.room.handleClientDisconnect(c)
		c.conn.Close()
		metrics.DecConnection()
	}()

	for {
        // Read Binary
		messageType, data, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		if messageType != websocket.BinaryMessage {
			continue
		}

        // Decode Proto
		var msg pb.WebSocketMessage
		if err := proto.Unmarshal(data, &msg); err != nil {
			slog.Warn("Failed to unmarshal proto", "ClientId", c.ID, "error", err)
			continue
		}

		// PASS TO ROUTER
		ctx := context.Background()
		c.room.router(ctx, c, &msg)
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	writeWait := 10 * time.Second

	for message := range c.send {
		c.conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := c.conn.WriteMessage(websocket.BinaryMessage, message); err != nil {
			slog.Error("error writing message", "error", err)
			return
		}
	}
	c.conn.WriteMessage(websocket.CloseMessage, []byte{})
}

func (c *Client) sendProto(msg *pb.WebSocketMessage) {
	data, err := proto.Marshal(msg)
	if err != nil {
		slog.Error("Failed to marshal proto response", "error", err)
		return
	}
	// Thread-safe send
	select {
	case c.send <- data:
	default:
		slog.Warn("Client send channel full", "clientId", c.ID)
	}
}
