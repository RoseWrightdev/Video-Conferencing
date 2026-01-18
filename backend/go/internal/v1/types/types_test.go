package types

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRoleTypeConstants(t *testing.T) {
	assert.Equal(t, RoleType("waiting"), RoleTypeWaiting)
	assert.Equal(t, RoleType("participant"), RoleTypeParticipant)
	assert.Equal(t, RoleType("screenshare"), RoleTypeScreenshare)
	assert.Equal(t, RoleType("host"), RoleTypeHost)
}

func TestClientIDType(t *testing.T) {
	id := ClientIDType("user-123")
	assert.Equal(t, "user-123", string(id))
}

func TestRoomIDType(t *testing.T) {
	id := RoomIDType("room-456")
	assert.Equal(t, "room-456", string(id))
}

func TestDisplayNameType(t *testing.T) {
	name := DisplayNameType("John Doe")
	assert.Equal(t, "John Doe", string(name))
}

func TestClientInfo(t *testing.T) {
	info := ClientInfo{
		ClientID:    "user-1",
		DisplayName: "Test User",
	}

	assert.Equal(t, ClientIDType("user-1"), info.ClientID)
	assert.Equal(t, DisplayNameType("Test User"), info.DisplayName)
}

func TestChatInfo(t *testing.T) {
	chat := ChatInfo{
		ClientInfo: ClientInfo{
			ClientID:    "user-1",
			DisplayName: "Test User",
		},
		ChatID:      "chat-123",
		Timestamp:   1234567890,
		ChatContent: "Hello, World!",
	}

	assert.Equal(t, ChatID("chat-123"), chat.ChatID)
	assert.Equal(t, Timestamp(1234567890), chat.Timestamp)
	assert.Equal(t, ChatContent("Hello, World!"), chat.ChatContent)
}

func TestValidateChat_Valid(t *testing.T) {
	chat := ChatInfo{
		ClientInfo: ClientInfo{
			ClientID:    "user-1",
			DisplayName: "Test User",
		},
		ChatID:      "chat-123",
		ChatContent: "Valid message",
	}

	err := chat.ValidateChat()
	assert.NoError(t, err)
}

func TestValidateChat_EmptyContent(t *testing.T) {
	chat := ChatInfo{
		ClientInfo: ClientInfo{
			ClientID:    "user-1",
			DisplayName: "Test User",
		},
		ChatID:      "chat-123",
		ChatContent: "",
	}

	err := chat.ValidateChat()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot be empty")
}

func TestValidateChat_TooLong(t *testing.T) {
	// Create a string longer than 1000 characters
	longContent := make([]byte, 1001)
	for i := range longContent {
		longContent[i] = 'a'
	}

	chat := ChatInfo{
		ClientInfo: ClientInfo{
			ClientID:    "user-1",
			DisplayName: "Test User",
		},
		ChatID:      "chat-123",
		ChatContent: ChatContent(longContent),
	}

	err := chat.ValidateChat()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot exceed 1000 characters")
}

func TestValidateChat_EmptyClientID(t *testing.T) {
	chat := ChatInfo{
		ClientInfo: ClientInfo{
			ClientID:    "",
			DisplayName: "Test User",
		},
		ChatID:      "chat-123",
		ChatContent: "Valid message",
	}

	err := chat.ValidateChat()
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "client ID cannot be empty")
}

func TestChatContent1000Chars(t *testing.T) {
	// Exactly 1000 characters should be valid
	content := make([]byte, 1000)
	for i := range content {
		content[i] = 'a'
	}

	chat := ChatInfo{
		ClientInfo: ClientInfo{
			ClientID:    "user-1",
			DisplayName: "Test User",
		},
		ChatID:      "chat-123",
		ChatContent: ChatContent(content),
	}

	err := chat.ValidateChat()
	assert.NoError(t, err)
}

func TestTypeAliases(t *testing.T) {
	// Test that payload aliases are correctly defined
	var addChat = ChatInfo{
		ChatID:      "chat-1",
		ChatContent: "Test",
	}
	assert.Equal(t, ChatID("chat-1"), addChat.ChatID)
	assert.Equal(t, ChatContent("Test"), addChat.ChatContent)

	var deleteChat = ChatInfo{
		ChatID: "chat-2",
	}
	assert.Equal(t, ChatID("chat-2"), deleteChat.ChatID)

	var getRecent = ChatInfo{}
	assert.NotNil(t, getRecent)
}

func TestChatID(t *testing.T) {
	id := ChatID("unique-chat-id")
	assert.Equal(t, "unique-chat-id", string(id))
}

func TestTimestamp(t *testing.T) {
	ts := Timestamp(1234567890)
	assert.Equal(t, int64(1234567890), int64(ts))
}

func TestChatContent(t *testing.T) {
	content := ChatContent("This is a message")
	assert.Equal(t, "This is a message", string(content))
}

func TestChatIndex(t *testing.T) {
	idx := ChatIndex(42)
	assert.Equal(t, 42, int(idx))
}

func TestRoleTypeComparison(t *testing.T) {
	// Test that role types can be compared
	role1 := RoleTypeHost
	role2 := RoleTypeHost
	role3 := RoleTypeParticipant

	assert.Equal(t, role1, role2)
	assert.NotEqual(t, role1, role3)
}

func TestClientInfoEquality(t *testing.T) {
	info1 := ClientInfo{
		ClientID:    "user-1",
		DisplayName: "User One",
	}

	info2 := ClientInfo{
		ClientID:    "user-1",
		DisplayName: "User One",
	}

	info3 := ClientInfo{
		ClientID:    "user-2",
		DisplayName: "User Two",
	}

	assert.Equal(t, info1, info2)
	assert.NotEqual(t, info1, info3)
}

func TestChatInfoComplete(t *testing.T) {
	// Test a complete chat info structure
	chat := ChatInfo{
		ClientInfo: ClientInfo{
			ClientID:    "sender-123",
			DisplayName: "John Doe",
		},
		ChatID:      "msg-uuid-12345",
		Timestamp:   1703347200000, // 2023-12-23 18:00:00
		ChatContent: "This is a complete message with all fields populated.",
	}

	// Validate all fields
	assert.Equal(t, ClientIDType("sender-123"), chat.ClientID)
	assert.Equal(t, DisplayNameType("John Doe"), chat.DisplayName)
	assert.Equal(t, ChatID("msg-uuid-12345"), chat.ChatID)
	assert.Equal(t, Timestamp(1703347200000), chat.Timestamp)
	assert.Equal(t, ChatContent("This is a complete message with all fields populated."), chat.ChatContent)

	// Should be valid
	err := chat.ValidateChat()
	assert.NoError(t, err)
}
