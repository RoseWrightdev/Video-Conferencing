package session

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestHandleAddChat tests the chat message addition handler through the router
func TestHandleAddChat(t *testing.T) {
	t.Run("should add valid chat message successfully", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), client)

		payload := AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			ChatId:      "chat-1",
			Timestamp:   1234567890,
			ChatContent: "Hello world!",
		}

		msg := Message{Event: EventAddChat, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), client, msg)
		}, "Router should not panic for valid chat message")

		assert.True(t, room.chatHistory.Len() > 0, "Chat message should be added to history")
	})

	t.Run("should fail with empty display name", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClient("participant1")
		client.Role = RoleTypeParticipant
		client.DisplayName = ""

		room.addParticipant(context.Background(), client)

		payload := AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			ChatId:      "chat-1",
			Timestamp:   1234567890,
			ChatContent: "Hello world!",
		}

		msg := Message{Event: EventAddChat, Payload: payload}
		initialChatCount := room.chatHistory.Len()

		assert.NotPanics(t, func() {
			room.router(context.Background(), client, msg)
		}, "Router should not panic even with invalid data")

		assert.Equal(t, initialChatCount, room.chatHistory.Len(), "Invalid chat should not be added")
	})

	t.Run("should fail with empty chat content", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClient("participant1")
		client.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), client)

		payload := AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			ChatId:      "chat-1",
			Timestamp:   1234567890,
			ChatContent: "",
		}

		msg := Message{Event: EventAddChat, Payload: payload}
		initialChatCount := room.chatHistory.Len()

		assert.NotPanics(t, func() {
			room.router(context.Background(), client, msg)
		}, "Router should not panic with empty content")

		assert.Equal(t, initialChatCount, room.chatHistory.Len(), "Empty chat should not be added")
	})
}

// TestHandleDeleteChat tests the chat message deletion handler
func TestHandleDeleteChat(t *testing.T) {
	t.Run("should delete chat message successfully", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClient("participant1")
		client.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), client)

		addClient := newTestClientWithName("participant1", "John Doe")
		addClient.Role = RoleTypeParticipant
		room.addParticipant(context.Background(), addClient)

		addPayload := AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    addClient.ID,
				DisplayName: addClient.DisplayName,
			},
			ChatId:      "chat-1",
			Timestamp:   1234567890,
			ChatContent: "Message to delete",
		}

		addMsg := Message{Event: EventAddChat, Payload: addPayload}
	room.router(context.Background(), addClient, addMsg)

		initialChatCount := room.chatHistory.Len()
		require.True(t, initialChatCount > 0, "Chat should be added first")

		deletePayload := DeleteChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			ChatId:      "chat-1",
			Timestamp:   1234567890,
			ChatContent: "",
		}

		deleteMsg := Message{Event: EventDeleteChat, Payload: deletePayload}

		assert.NotPanics(t, func() {
		room.router(context.Background(), client, deleteMsg)
		}, "Router should not panic for delete chat")
	})
}

// TestHandleGetRecentChats tests the chat history retrieval handler
func TestHandleGetRecentChats(t *testing.T) {
	t.Run("should send recent chats successfully", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), client)

		chatPayload1 := AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			ChatId:      "chat-1",
			Timestamp:   1234567890,
			ChatContent: "First message",
		}
		room.router(context.Background(), client, Message{Event: EventAddChat, Payload: chatPayload1})

		chatPayload2 := AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			ChatId:      "chat-2",
			Timestamp:   1234567891,
			ChatContent: "Second message",
		}
		room.router(context.Background(), client, Message{Event: EventAddChat, Payload: chatPayload2})

		require.True(t, room.chatHistory.Len() >= 2, "Should have chat history")

		for len(client.send) > 0 {
			<-client.send
		}

		payload := GetRecentChatsPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
		}

		msg := Message{Event: EventGetRecentChats, Payload: payload}

		assert.NotPanics(t, func() {
			room.router(context.Background(), client, msg)
		}, "Router should not panic for get recent chats")

		select {
		case msgBytes := <-client.send:
			var receivedMsg Message
			err := json.Unmarshal(msgBytes, &receivedMsg)
			require.NoError(t, err)
			assert.Equal(t, EventGetRecentChats, receivedMsg.Event)
		case <-time.After(100 * time.Millisecond):
			t.Fatal("Client did not receive recent chats response")
		}
	})

	t.Run("should handle invalid payload", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), client)

		msg := Message{Event: EventGetRecentChats, Payload: "invalid"}

		assert.NotPanics(t, func() {
			room.router(context.Background(), client, msg)
		}, "Router should not panic with invalid payload")
	})

	t.Run("should handle channel full scenario", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		client := newTestClientWithName("participant1", "John Doe")
		client.Role = RoleTypeParticipant

		room.addParticipant(context.Background(), client)

		for i := 0; i < cap(client.send); i++ {
			client.send <- []byte("filler")
		}

		payload := GetRecentChatsPayload{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
		}

		assert.NotPanics(t, func() {
			room.handleGetRecentChats(context.Background(), client, EventGetRecentChats, payload)
		}, "handleGetRecentChats should not panic when client channel is full")
	})
}

// TestChatInfoValidation tests the Validate method for ChatInfo
func TestChatInfoValidation(t *testing.T) {
	t.Run("should pass validation with valid data", func(t *testing.T) {
		chatInfo := ChatInfo{
			ClientInfo: ClientInfo{
				ClientId:    "valid-id",
				DisplayName: "Valid Name",
			},
			ChatId:      "chat-1",
			Timestamp:   123456789,
			ChatContent: "Valid message content",
		}

		err := chatInfo.ValidateChat()
		assert.NoError(t, err, "Valid chat info should pass validation")
	})

	t.Run("should fail with empty chat content", func(t *testing.T) {
		chatInfo := ChatInfo{
			ClientInfo: ClientInfo{
				ClientId:    "valid-id",
				DisplayName: "Valid Name",
			},
			ChatContent: "",
		}

		err := chatInfo.ValidateChat()
		assert.Error(t, err, "Empty chat content should fail validation")
		assert.Contains(t, err.Error(), "chat content cannot be empty")
	})

	t.Run("should fail with chat content too long", func(t *testing.T) {
		longContent := make([]byte, 1001)
		for i := range longContent {
			longContent[i] = 'a'
		}

		chatInfo := ChatInfo{
			ClientInfo: ClientInfo{
				ClientId:    "valid-id",
				DisplayName: "Valid Name",
			},
			ChatContent: ChatContent(longContent),
		}

		err := chatInfo.ValidateChat()
		assert.Error(t, err, "Long chat content should fail validation")
		assert.Contains(t, err.Error(), "chat content cannot exceed 1000 characters")
	})

	t.Run("should fail with empty client ID", func(t *testing.T) {
		chatInfo := ChatInfo{
			ClientInfo: ClientInfo{
				ClientId:    "",
				DisplayName: "Valid Name",
			},
			ChatContent: "Valid content",
		}

		err := chatInfo.ValidateChat()
		assert.Error(t, err, "Empty client ID should fail validation")
		assert.Contains(t, err.Error(), "client ID cannot be empty")
	})

	t.Run("should fail with empty display name", func(t *testing.T) {
		chatInfo := ChatInfo{
			ClientInfo: ClientInfo{
				ClientId:    "valid-id",
				DisplayName: "",
			},
			ChatContent: "Valid content",
		}

		err := chatInfo.ValidateChat()
		assert.Error(t, err, "Empty display name should fail validation")
		assert.Contains(t, err.Error(), "display name cannot be empty")
	})
}

// TestDeleteChatEdgeCases tests edge cases in deleteChat functionality
func TestDeleteChatEdgeCases(t *testing.T) {
	t.Run("deleteChat with non-existent chat ID", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		addPayload := AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    "user1",
				DisplayName: "User One",
			},
			ChatId:      "existing-chat",
			Timestamp:   123456789,
			ChatContent: "Existing message",
		}
		room.addChat(addPayload)

		initialCount := room.chatHistory.Len()
		require.Equal(t, 1, initialCount, "Should have one message")

		deletePayload := DeleteChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    "user1",
				DisplayName: "User One",
			},
			ChatId:      "non-existent-chat",
			Timestamp:   123456789,
			ChatContent: "",
		}

		assert.NotPanics(t, func() {
			room.deleteChat(deletePayload)
		}, "deleteChat should handle non-existent chat ID gracefully")

		assert.Equal(t, initialCount, room.chatHistory.Len(), "Should not remove anything for non-existent chat")
	})

	t.Run("deleteChat with empty chat history", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		require.Equal(t, 0, room.chatHistory.Len(), "Should start with empty chat history")

		deletePayload := DeleteChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    "user1",
				DisplayName: "User One",
			},
			ChatId:      "any-chat",
			Timestamp:   123456789,
			ChatContent: "",
		}

		assert.NotPanics(t, func() {
			room.deleteChat(deletePayload)
		}, "deleteChat should handle empty chat history gracefully")
	})

	t.Run("deleteChat with multiple messages, delete middle one", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)

		for i := 1; i <= 3; i++ {
			addPayload := AddChatPayload{
				ClientInfo: ClientInfo{
					ClientId:    "user1",
					DisplayName: "User One",
				},
				ChatId:      ChatId(fmt.Sprintf("chat-%d", i)),
				Timestamp:   Timestamp(123456789 + i),
				ChatContent: ChatContent(fmt.Sprintf("Message %d", i)),
			}
			room.addChat(addPayload)
		}

		initialCount := room.chatHistory.Len()
		require.Equal(t, 3, initialCount, "Should have three messages")

		deletePayload := DeleteChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    "user1",
				DisplayName: "User One",
			},
			ChatId:      ChatId("chat-2"),
			Timestamp:   Timestamp(123456789 + 2),
			ChatContent: ChatContent(""),
		}

		room.deleteChat(deletePayload)

		assert.Equal(t, 2, room.chatHistory.Len(), "Should have two messages after deletion")

		getPayload := GetRecentChatsPayload{
			ClientInfo: ClientInfo{
				ClientId:    "user1",
				DisplayName: "User One",
			},
		}
		remainingChats := room.getRecentChats(getPayload)

		assert.Len(t, remainingChats, 2, "Should have two remaining messages")
		assert.Equal(t, ChatId("chat-1"), remainingChats[0].ChatId, "First message should remain")
		assert.Equal(t, ChatId("chat-3"), remainingChats[1].ChatId, "Third message should remain")
	})

	t.Run("deleteChat with nil chatHistory", func(t *testing.T) {
		room := NewTestRoom("test-room", nil)
		room.chatHistory = nil

		deletePayload := DeleteChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    "user1",
				DisplayName: "User One",
			},
			ChatId:      ChatId("any-chat"),
			Timestamp:   Timestamp(123456789),
			ChatContent: ChatContent(""),
		}

		assert.NotPanics(t, func() {
			room.deleteChat(deletePayload)
		}, "deleteChat should handle nil chatHistory gracefully")
	})
}
