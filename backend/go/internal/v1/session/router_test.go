package session

import (
	"context"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/stretchr/testify/assert"
)

func TestRouter_AllBranches(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	mockSFU := &MockSFUProvider{}
	room := NewRoom("test-room", nil, mockBus, mockSFU)

	client := &Client{
		ID:          "user1",
		DisplayName: "Alice",
		Role:        RoleTypeHost,
		send:        make(chan []byte, 10),
	}
	room.clients[client.ID] = client

	tests := []struct {
		name   string
		msg    *pb.WebSocketMessage
		verify func(t *testing.T)
	}{
		{
			name: "Join Request (Host)",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_Join{Join: &pb.JoinRequest{}},
			},
			verify: func(t *testing.T) {
				assert.True(t, mockSFU.CreateSessionCalled)
			},
		},
		{
			name: "Signal message",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_Signal{Signal: &pb.SignalRequest{}},
			},
			verify: func(t *testing.T) {
				assert.True(t, mockSFU.HandleSignalCalled)
			},
		},
		{
			name: "Chat message",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_Chat{Chat: &pb.ChatRequest{Content: "hi"}},
			},
			verify: func(t *testing.T) {
				// Verify chat history has 1 message
				assert.Equal(t, 1, room.chatHistory.Len())
			},
		},
		{
			name: "AdminAction (mute)",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_AdminAction{AdminAction: &pb.AdminActionRequest{
					Action: "mute", TargetUserId: "user1",
				}},
			},
			verify: func(t *testing.T) {
				assert.False(t, client.IsAudioEnabled)
			},
		},
		{
			name: "ToggleMedia (video)",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_ToggleMedia{ToggleMedia: &pb.ToggleMediaRequest{
					Kind: "video", IsEnabled: true,
				}},
			},
			verify: func(t *testing.T) {
				assert.True(t, client.IsVideoEnabled)
			},
		},
		{
			name: "ToggleHand",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_ToggleHand{ToggleHand: &pb.ToggleHandRequest{
					IsRaised: true,
				}},
			},
			verify: func(t *testing.T) {
				assert.True(t, client.IsHandRaised)
			},
		},
		{
			name: "ScreenShare",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_ScreenShare{ScreenShare: &pb.ScreenShareRequest{
					IsSharing: true,
				}},
			},
			verify: func(t *testing.T) {
				assert.True(t, client.IsScreenSharing)
			},
		},
		{
			name: "GetRecentChats",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_GetRecentChats{GetRecentChats: &pb.GetRecentChatsRequest{}},
			},
			verify: func(t *testing.T) {
				// Just verify it doesn't crash
				assert.NotNil(t, room)
			},
		},
		{
			name: "DeleteChat",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_DeleteChat{DeleteChat: &pb.DeleteChatRequest{ChatId: "123"}},
			},
			verify: func(t *testing.T) {
				// Just verify it doesn't crash
				assert.NotNil(t, room)
			},
		},
		{
			name: "RequestScreenSharePermission",
			msg: &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_RequestScreenSharePermission{RequestScreenSharePermission: &pb.RequestScreenSharePermission{}},
			},
			verify: func(t *testing.T) {
				// Just verify it doesn't crash
				assert.NotNil(t, room)
			},
		},
		{
			name: "Nil Payload",
			msg:  &pb.WebSocketMessage{Payload: nil},
			verify: func(t *testing.T) {
				// Should have been handled by validateMessagePayload check
			},
		},
		{
			name: "Unknown Payload",
			msg:  &pb.WebSocketMessage{Payload: &pb.WebSocketMessage_AdminEvent{}}, // Unexpected type in router
			verify: func(t *testing.T) {
				// Should log warning and return
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Reset mock flags
			mockSFU.CreateSessionCalled = false
			mockSFU.HandleSignalCalled = false

			room.router(ctx, client, tt.msg)
			tt.verify(t)
		})
	}
}

func TestRouter_WaitingUserJoinIgnored(t *testing.T) {
	ctx := context.Background()
	mockSFU := &MockSFUProvider{}
	room := NewRoom("test-room", nil, nil, mockSFU)

	client := &Client{
		ID:   "user1",
		Role: RoleTypeWaiting,
	}

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_Join{Join: &pb.JoinRequest{}},
	}

	room.router(ctx, client, msg)

	assert.False(t, mockSFU.CreateSessionCalled)
}
