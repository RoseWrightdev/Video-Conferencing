package session

import (
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/stretchr/testify/assert"
)

func TestBuildChatEvent(t *testing.T) {
	client := &Client{
		ID:          "user123",
		DisplayName: "Alice",
	}
	req := &pb.ChatRequest{
		Content: "Hello world",
	}

	event := buildChatEvent(client, req)

	assert.NotNil(t, event)
	assert.NotEmpty(t, event.Id)
	assert.Equal(t, "user123", event.SenderId)
	assert.Equal(t, "Alice", event.SenderName)
	assert.Equal(t, "Hello world", event.Content)
	assert.NotZero(t, event.Timestamp)
	assert.False(t, event.IsPrivate)

	// Test private chat
	req.TargetId = "user456"
	eventPrivate := buildChatEvent(client, req)
	assert.True(t, eventPrivate.IsPrivate)
}

func TestShouldStoreChatInHistory(t *testing.T) {
	assert.True(t, shouldStoreChatInHistory(&pb.ChatEvent{IsPrivate: false}))
	assert.False(t, shouldStoreChatInHistory(&pb.ChatEvent{IsPrivate: true}))
}

func TestChatInfoFromEvent(t *testing.T) {
	event := &pb.ChatEvent{
		Id:         "msg1",
		SenderId:   "user1",
		SenderName: "Alice",
		Content:    "Hello",
		Timestamp:  123456789,
	}

	info := chatInfoFromEvent(event)

	assert.Equal(t, ClientIdType("user1"), info.ClientId)
	assert.Equal(t, DisplayNameType("Alice"), info.DisplayName)
	assert.Equal(t, ChatId("msg1"), info.ChatId)
	assert.Equal(t, Timestamp(123456789), info.Timestamp)
	assert.Equal(t, ChatContent("Hello"), info.ChatContent)
}
