package room

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
	"google.golang.org/protobuf/proto"
)

func TestSubscribeToRedis_NoBus(_ *testing.T) {
	r := NewRoom(context.Background(), "test-room", nil, nil, nil)

	// Should not panic
	r.subscribeToRedis()
}

func TestSubscribeToRedis_WithBus(t *testing.T) {
	mockBus := &MockBusService{}
	_ = NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Subscribe should have been called in NewRoom
	assert.Equal(t, 1, mockBus.subscribeCalls)
}

func TestHandleRedisMessage(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	r.addHost(ctx, host)

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
	jsonData, _ := json.Marshal(data)

	// Simulate Redis message
	payload := bus.PubSubPayload{
		RoomID:   "test-room",
		Event:    "chat",
		Payload:  jsonData,
		SenderID: "other-pod-user",
	}

	r.handleRedisMessage(payload)

	// Host should receive the message
	assert.Eventually(t, func() bool {
		return len(host.sendChan) > 0
	}, time.Second*1, time.Millisecond*10)
}

func TestHandleRedisMessage_NoPublishLoop(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	r.addHost(ctx, host)

	// Create a chat message
	chatMsg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test-chat-loop",
				Content: "Hello Loop",
			},
		},
	}

	data, _ := proto.Marshal(chatMsg)
	jsonData, _ := json.Marshal(data)

	// Simulate Redis message
	payload := bus.PubSubPayload{
		RoomID:   "test-room",
		Event:    "chat",
		Payload:  jsonData,
		SenderID: "other-pod-user",
	}

	r.handleRedisMessage(payload)

	// Host should receive the message locally
	assert.Eventually(t, func() bool {
		return len(host.sendChan) > 0
	}, time.Second*1, time.Millisecond*10)

	// CRITICAL: Bus Publish should NOT be called again
	assert.Equal(t, 0, mockBus.publishCalls, "handleRedisMessage triggered a Publish call, causing an infinite loop")
}

func TestHandleRedisMessage_EmptyPayload(_ *testing.T) {
	mockBus := &MockBusService{}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Empty payload should not panic
	payload := bus.PubSubPayload{
		RoomID:  "test-room",
		Event:   "test",
		Payload: []byte{},
	}

	r.handleRedisMessage(payload)
}

func TestHandleRedisMessage_InvalidProto(_ *testing.T) {
	mockBus := &MockBusService{}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Invalid proto should not panic
	payload := bus.PubSubPayload{
		RoomID:  "test-room",
		Event:   "test",
		Payload: []byte("invalid proto data"),
	}

	r.handleRedisMessage(payload)
}

func TestPublishToRedis_NoBus(_ *testing.T) {
	ctx := context.Background()
	r := NewRoom(context.Background(), "test-room", nil, nil, nil)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	// Should not panic
	r.publishToRedis(ctx, msg)
}

func TestPublishToRedis_WithBus(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	r.publishToRedis(ctx, msg)

	assert.Greater(t, mockBus.publishCalls, 0)
}

func TestPublishToRedis_Error(_ *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{failPublish: true}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	// Should not panic, just log error
	r.publishToRedis(ctx, msg)
}

func TestBroadcast_FullChannel(_ *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	// Create a mock client with a small send buffer
	client := newMockClient("user1", "User", types.RoleTypeHost)
	// Override sendChan with small buffer
	client.sendChan = make(chan *pb.WebSocketMessage, 1)

	r.addHost(ctx, client)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "test",
				Content: "Hello",
			},
		},
	}

	// Fill the channel
	client.sendChan <- msg

	// Second broadcast should log a warning but not block
	r.Broadcast(msg)
}

func TestAddChat_NilHistory(t *testing.T) {
	r := NewRoom(context.Background(), "test-room", nil, nil, nil)
	r.chatHistory = nil

	chat := types.ChatInfo{
		ChatID:      "chat1",
		ChatContent: "Hello",
	}

	// Should initialize chatHistory and add
	r.addChat(chat)
	assert.NotNil(t, r.chatHistory)
	assert.Equal(t, 1, r.chatHistory.Len())
}

func TestDeleteChat_NilHistory(_ *testing.T) {
	r := NewRoom(context.Background(), "test-room", nil, nil, nil)
	r.chatHistory = nil

	// Should not panic
	r.deleteChat(types.DeleteChatPayload{ChatID: "nonexistent"})
}

func TestGetRecentChats_EmptyHistory(t *testing.T) {
	r := NewRoom(context.Background(), "test-room", nil, nil, nil)
	r.chatHistory = nil

	chats := r.getRecentChats()
	assert.Equal(t, 0, len(chats))
}

func TestAddChat_NonChatInfoValue(t *testing.T) {
	r := NewRoom(context.Background(), "test-room", nil, nil, nil)

	// Add a chat normally
	r.addChat(types.ChatInfo{
		ChatID:      "chat1",
		ChatContent: "Hello",
	})

	// Manually add a non-ChatInfo value to test robustness
	r.chatHistory.PushBack("not a ChatInfo")

	chats := r.getRecentChats()
	// Should skip the invalid entry
	assert.Equal(t, 1, len(chats))
}

func TestDeleteChat_NotFound(t *testing.T) {
	r := NewRoom(context.Background(), "test-room", nil, nil, nil)

	r.addChat(types.ChatInfo{
		ChatID:      "chat1",
		ChatContent: "Hello",
	})

	// Try to delete non-existent chat
	r.deleteChat(types.DeleteChatPayload{ChatID: "nonexistent"})

	// Original chat should still be there
	assert.Equal(t, 1, r.chatHistory.Len())
}

func TestDisconnectClient_NoDrawOrderElement(_ *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	client := newMockClient("user1", "User", types.RoleTypeParticipant)
	// MockClient doesn't have drawOrderElement field in the same way,
	// but we can test the Room logic by adding it.

	r.addParticipant(ctx, client)

	// Should not panic
	r.DisconnectClient(ctx, client)
}

func TestHandleClientDisconnect_WithMetrics(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	participant := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.addHost(ctx, host)
	r.addParticipant(ctx, participant)

	// Disconnect participant
	r.HandleClientDisconnect(participant)

	// Room should not be empty (host still there)
	assert.False(t, r.IsRoomEmpty())

	// Disconnect host
	r.HandleClientDisconnect(host)

	// Room should be empty now
	assert.True(t, r.IsRoomEmpty())
}
