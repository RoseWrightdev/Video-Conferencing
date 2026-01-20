// Package types defines shared types and constants for the application.
package types

import (
	"context"
	"errors"

	"sync"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
)

// --- Core Domain Types ---

// RoleType defines the different roles a client can have.
type RoleType string

// ClientIDType represents a unique identifier for a client connection.
type ClientIDType string

// RoomIDType represents a unique identifier for a video conference room.
type RoomIDType string

// DisplayNameType represents the human-readable name for a client.
type DisplayNameType string

// Role constants define the hierarchy and permissions.
const (
	RoleTypeWaiting     RoleType = "waiting"     // Users waiting for admission
	RoleTypeParticipant RoleType = "participant" // Active participants
	RoleTypeScreenshare RoleType = "screenshare" // Participants sharing screen
	RoleTypeHost        RoleType = "host"        // Administrators
	RoleTypeUnknown     RoleType = "unknown"     // Default/Unknown state
)

// ChatID represents the unique identifier for a chat message.
// --- Internal Storage Types (Chat History) ---
type ChatID string

// ChatIndex represents the index of a chat message in history.
type ChatIndex int

// ChatContent represents the text content of a chat message.
type ChatContent string

// Timestamp represents a Unix timestamp in milliseconds.
type Timestamp int64

// ClientInfo is used internally to track user details.
type ClientInfo struct {
	ClientID    ClientIDType    `json:"clientId"`
	DisplayName DisplayNameType `json:"displayName"`
}

// ChatInfo represents a chat message stored in the Room's history list.
type ChatInfo struct {
	ClientInfo
	ChatID      ChatID      `json:"chatId"`
	Timestamp   Timestamp   `json:"timestamp"`
	ChatContent ChatContent `json:"chatContent"`
}

// ValidateChat ensures chat messages are safe to store.
func (c ChatInfo) ValidateChat() error {
	if len(string(c.ChatContent)) == 0 {
		return errors.New("chat content cannot be empty")
	}
	if len(string(c.ChatContent)) > 1000 {
		return errors.New("chat content cannot exceed 1000 characters")
	}
	if string(c.ClientID) == "" {
		return errors.New("client ID cannot be empty")
	}
	return nil
}

// AddChatPayload is the payload for adding a chat message.
type AddChatPayload = ChatInfo

// DeleteChatPayload is the payload for deleting a chat message.
type DeleteChatPayload = ChatInfo

// GetRecentChatsPayload is the payload for retrieving recent chats.
type GetRecentChatsPayload = ChatInfo

// --- Shared Interfaces ---

// TokenValidator defines the interface for JWT token authentication services.
type TokenValidator interface {
	ValidateToken(tokenString string) (*auth.CustomClaims, error)
}

// BusService defines the interface for distributed pub/sub messaging.
type BusService interface {
	Publish(ctx context.Context, roomID string, event string, payload any, senderID string, roles []string) error
	PublishDirect(ctx context.Context, targetUserID string, event string, payload any, senderID string) error
	Subscribe(ctx context.Context, roomID string, wg *sync.WaitGroup, handler func(bus.PubSubPayload))
	Close() error
	// Redis Set operations for distributed state management
	SetAdd(ctx context.Context, key string, value string) error
	SetRem(ctx context.Context, key string, value string) error
	SetMembers(ctx context.Context, key string) ([]string, error)
}

// SFUProvider defines the interface for SFU operations.
type SFUProvider interface {
	CreateSession(ctx context.Context, uid string, roomID string) (*pb.CreateSessionResponse, error)
	HandleSignal(ctx context.Context, uid string, roomID string, signal *pb.SignalRequest) (*pb.SignalResponse, error)
	DeleteSession(ctx context.Context, uid string, roomID string) error
	ListenEvents(ctx context.Context, uid string, roomID string) (pb.SfuService_ListenEventsClient, error)
}

// ClientInterface defines the behavior required from a WebSocket client.
// This allows the room package to interact with clients without depending on the transport package.
type ClientInterface interface {
	GetID() ClientIDType
	GetDisplayName() DisplayNameType
	GetRole() RoleType
	SetRole(RoleType)
	SendProto(msg *pb.WebSocketMessage)
	SendRaw(data []byte)
	GetIsAudioEnabled() bool
	SetIsAudioEnabled(bool)
	GetIsVideoEnabled() bool
	SetIsVideoEnabled(bool)
	GetIsScreenSharing() bool
	SetIsScreenSharing(bool)
	GetIsHandRaised() bool
	SetIsHandRaised(bool)
	Disconnect() // Forcefully close the connection (e.g., when kicked)
}

// Roomer defines the interface for room operations that a Client or Signaling layer needs.
type Roomer interface {
	GetID() RoomIDType
	BuildRoomStateProto(ctx context.Context) *pb.RoomStateEvent
	Router(ctx context.Context, client ClientInterface, msg *pb.WebSocketMessage)
	HandleClientDisconnect(c ClientInterface)
	CreateSFUSession(ctx context.Context, client ClientInterface) error
	HandleSFUSignal(ctx context.Context, client ClientInterface, signal *pb.SignalRequest)
	Broadcast(msg *pb.WebSocketMessage)
}
