package session

import "errors"

// --- Core Domain Types ---

// RoleType defines the different roles a client can have.
type RoleType string

// ClientIdType represents a unique identifier for a client connection.
type ClientIdType string

// RoomIdType represents a unique identifier for a video conference room.
type RoomIdType string

// DisplayNameType represents the human-readable name for a client.
type DisplayNameType string

// Role constants define the hierarchy and permissions.
const (
	RoleTypeWaiting     RoleType = "waiting"     // Users waiting for admission
	RoleTypeParticipant RoleType = "participant" // Active participants
	RoleTypeScreenshare RoleType = "screenshare" // Participants sharing screen
	RoleTypeHost        RoleType = "host"        // Administrators
)

// --- Internal Storage Types (Chat History) ---
// We keep these because your room_methods.go likely uses them to store history in memory.

type ChatId string
type ChatIndex int
type ChatContent string
type Timestamp int64

// ClientInfo is used internally to track user details.
type ClientInfo struct {
	ClientId    ClientIdType    `json:"clientId"`
	DisplayName DisplayNameType `json:"displayName"`
}

// ChatInfo represents a chat message stored in the Room's history list.
type ChatInfo struct {
	ClientInfo
	ChatId      ChatId      `json:"chatId"`
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
	if string(c.ClientId) == "" {
		return errors.New("client ID cannot be empty")
	}
	return nil
}

// Payload aliases used by legacy internal methods (room_methods.go)
// We keep these so we don't have to rewrite the storage logic yet.
type AddChatPayload = ChatInfo
type DeleteChatPayload = ChatInfo
type GetRecentChatsPayload = ChatInfo