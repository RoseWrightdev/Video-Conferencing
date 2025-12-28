package transport

import (
	"container/list"
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/gorilla/websocket"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"google.golang.org/protobuf/proto"
)

// wsConnection defines the interface for WebSocket connection operations.
type wsConnection interface {
	ReadMessage() (messageType int, p []byte, err error) // Read the next message from the connection
	WriteMessage(messageType int, data []byte) error     // Write a message to the connection
	Close() error                                        // Close the connection
	SetWriteDeadline(t time.Time) error
}

// Client represents a single user's connection to a video conference room.
// It implements types.ClientInterface.
type Client struct {
	conn             wsConnection          // WebSocket connection for real-time communication
	room             types.Roomer          // Room interface for business logic operations
	ID               types.ClientIdType    // Unique identifier from JWT token
	DisplayName      types.DisplayNameType // Human-readable name for UI display
	Role             types.RoleType        // Current permission level in the room
	drawOrderElement *list.Element         // Position reference in room draw order queues

	// State Flags (Consolidated from Room maps)
	IsAudioEnabled  bool
	IsVideoEnabled  bool
	IsScreenSharing bool
	IsHandRaised    bool

	mu               sync.RWMutex // Protects concurrent access to Client fields (like Role)
	rateLimitEnabled bool         // Enable rate limiting (disabled for tests)
	closeOnce        sync.Once    // Ensures send channel is only closed once
	closed           bool         // Track if client has been disconnected

	send         chan []byte // Buffered channel for normal messages (Chat)
	prioritySend chan []byte // Buffered channel for critical messages (State, SDP)
}

// --- types.ClientInterface setters and getters ---

func (c *Client) GetID() types.ClientIdType {
	return c.ID
}

func (c *Client) GetDisplayName() types.DisplayNameType {
	return c.DisplayName
}

// Thread-safe reader
func (c *Client) GetRole() types.RoleType {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Role
}

// Thread-safe writer
func (c *Client) SetRole(role types.RoleType) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Role = role
}

func (c *Client) GetIsAudioEnabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.IsAudioEnabled
}

func (c *Client) SetIsAudioEnabled(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.IsAudioEnabled = enabled
}

func (c *Client) GetIsVideoEnabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.IsVideoEnabled
}

func (c *Client) SetIsVideoEnabled(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.IsVideoEnabled = enabled
}

func (c *Client) GetIsScreenSharing() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.IsScreenSharing
}

func (c *Client) SetIsScreenSharing(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.IsScreenSharing = enabled
}

func (c *Client) GetIsHandRaised() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.IsHandRaised
}

func (c *Client) SetIsHandRaised(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.IsHandRaised = enabled
}

func (c *Client) Disconnect() {
	c.conn.Close()
}

// readPump continuously processes incoming WebSocket messages from the client.
func (c *Client) readPump() {
	defer func() {
		c.room.HandleClientDisconnect(c)
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
		c.room.Router(ctx, c, &msg)
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	writeWait := 10 * time.Second

	for {
		select {
		case message, ok := <-c.prioritySend:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.BinaryMessage, message); err != nil {
				slog.Error("error writing priority message", "error", err)
				return
			}
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.BinaryMessage, message); err != nil {
				slog.Error("error writing message", "error", err)
				return
			}
		}
	}
}

// SendProto satisfies types.ClientInterface
func (c *Client) SendProto(msg *pb.WebSocketMessage) {
	// Check if client is closed before attempting to send
	c.mu.RLock()
	if c.closed {
		c.mu.RUnlock()
		slog.Debug("Skipping send to closed client", "clientId", c.ID)
		return
	}
	c.mu.RUnlock()

	data, err := proto.Marshal(msg)
	if err != nil {
		slog.Error("Failed to marshal proto response", "error", err)
		return
	}

	// Add panic recovery as a safety net
	defer func() {
		if r := recover(); r != nil {
			slog.Warn("Recovered from panic in SendProto", "clientId", c.ID, "panic", r)
		}
	}()

	// Determine priority based on message type
	isPriority := false
	switch msg.Payload.(type) {
	case *pb.WebSocketMessage_RoomState, *pb.WebSocketMessage_Signal, *pb.WebSocketMessage_SignalEvent, *pb.WebSocketMessage_Error:
		isPriority = true
	}

	if isPriority {
		select {
		case c.prioritySend <- data:
		default:
			slog.Error("Client priority channel full - dropping critical message", "clientId", c.ID)
		}
	} else {
		select {
		case c.send <- data:
		default:
			slog.Warn("Client send channel full or closed", "clientId", c.ID)
		}
	}
}
