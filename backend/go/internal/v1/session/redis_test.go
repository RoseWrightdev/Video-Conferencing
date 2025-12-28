package session

import (
	"context"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/stretchr/testify/assert"
	"google.golang.org/protobuf/proto"
)

func TestSubscribeToRedis_NoBus(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)

	// Should not panic
	room.subscribeToRedis()
}

func TestSubscribeToRedis_WithBus(t *testing.T) {
	mockBus := &MockBusService{}
	_ = NewRoom("test-room", nil, mockBus, nil)

	// Subscribe should have been called in NewRoom
	assert.Equal(t, 1, mockBus.subscribeCalls)
}

func TestHandleRedisMessage(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	room.addHost(ctx, host)

	// Create a chat message
	chatMsg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test-chat",
				Content: "Hello from Redis",
			},
		},
	}

	data, _ := proto.Marshal(chatMsg)

	// Simulate Redis message
	payload := bus.PubSubPayload{
		RoomID:   "test-room",
		Event:    "chat",
		Payload:  data,
		SenderID: "other-pod-user",
	}

	room.handleRedisMessage(payload)

	// Host should receive the message
	// Wait a bit for async broadcast
	assert.Eventually(t, func() bool {
		return len(host.send) > 0
	}, time.Second*1, time.Millisecond*10)
}

func TestHandleRedisMessage_EmptyPayload(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Empty payload should not panic
	payload := bus.PubSubPayload{
		RoomID:  "test-room",
		Event:   "test",
		Payload: []byte{},
	}

	room.handleRedisMessage(payload)
}

func TestHandleRedisMessage_InvalidProto(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Invalid proto should not panic
	payload := bus.PubSubPayload{
		RoomID:  "test-room",
		Event:   "test",
		Payload: []byte("invalid proto data"),
	}

	room.handleRedisMessage(payload)
}

func TestPublishToRedis_NoBus(t *testing.T) {
	ctx := context.Background()
	room := NewRoom("test-room", nil, nil, nil)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	// Should not panic
	room.publishToRedis(ctx, msg)
}

func TestPublishToRedis_WithBus(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	room.publishToRedis(ctx, msg)

	assert.Greater(t, mockBus.publishCalls, 0)
}

func TestPublishToRedis_Error(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{failPublish: true}
	room := NewRoom("test-room", nil, mockBus, nil)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	// Should not panic, just log error
	room.publishToRedis(ctx, msg)
}

func TestBroadcast_FullChannel(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Create a client with a small send buffer
	client := &Client{
		ID:          "user1",
		DisplayName: "User",
		Role:        RoleTypeHost,
		send:        make(chan []byte, 1),
	}

	room.addHost(ctx, client)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	// Fill the channel
	client.send <- []byte("first message")

	// Second broadcast should log a warning but not block
	room.Broadcast(msg)
}

func TestAddChat_NilHistory(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	room.chatHistory = nil

	chat := ChatInfo{
		ChatId:      "chat1",
		ChatContent: "Hello",
	}

	// Should initialize chatHistory and add
	room.addChat(chat)
	assert.NotNil(t, room.chatHistory)
	assert.Equal(t, 1, room.chatHistory.Len())
}

func TestDeleteChat_NilHistory(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	room.chatHistory = nil

	// Should not panic
	room.deleteChat(DeleteChatPayload{ChatId: "nonexistent"})
}

func TestGetRecentChats_EmptyHistory(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	room.chatHistory = nil

	chats := room.getRecentChats()
	assert.Equal(t, 0, len(chats))
}

func TestAddChat_NonChatInfoValue(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)

	// Add a chat normally
	room.addChat(ChatInfo{
		ChatId:      "chat1",
		ChatContent: "Hello",
	})

	// Manually add a non-ChatInfo value to test robustness
	room.chatHistory.PushBack("not a ChatInfo")

	chats := room.getRecentChats()
	// Should skip the invalid entry
	assert.Equal(t, 1, len(chats))
}

func TestDeleteChat_NotFound(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)

	room.addChat(ChatInfo{
		ChatId:      "chat1",
		ChatContent: "Hello",
	})

	// Try to delete non-existent chat
	room.deleteChat(DeleteChatPayload{ChatId: "nonexistent"})

	// Original chat should still be there
	assert.Equal(t, 1, room.chatHistory.Len())
}

func TestDisconnectClient_NoDrawOrderElement(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	client := createTestClient("user1", "User", RoleTypeParticipant)
	client.drawOrderElement = nil

	room.addParticipant(ctx, client)

	// Set draw order element to nil to test that path
	client.drawOrderElement = nil

	// Should not panic
	room.disconnectClient(ctx, client)
}

func TestHandleClientDisconnect_WithMetrics(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	participant := createTestClient("user1", "User", RoleTypeParticipant)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)

	// Disconnect participant
	room.handleClientDisconnect(participant)

	// Room should not be empty (host still there)
	assert.False(t, room.isRoomEmpty())

	// Disconnect host
	room.handleClientDisconnect(host)

	// Room should be empty now
	assert.True(t, room.isRoomEmpty())
}
