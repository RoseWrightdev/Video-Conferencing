package session

import (
	"context"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/stretchr/testify/assert"
)

func TestHandleToggleMedia_Audio(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "User", RoleTypeParticipant)

	room.addParticipant(ctx, client)

	// Enable audio
	req := &pb.ToggleMediaRequest{
		Kind:      "audio",
		IsEnabled: true,
	}
	room.HandleToggleMedia(ctx, client, req)

	assert.True(t, client.IsAudioEnabled)

	// Disable audio
	req.IsEnabled = false
	room.HandleToggleMedia(ctx, client, req)

	assert.False(t, client.IsAudioEnabled)
}

func TestHandleToggleMedia_Video(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "User", RoleTypeParticipant)

	room.addParticipant(ctx, client)

	// Enable video
	req := &pb.ToggleMediaRequest{
		Kind:      "video",
		IsEnabled: true,
	}
	room.HandleToggleMedia(ctx, client, req)

	assert.True(t, client.IsVideoEnabled)

	// Disable video
	req.IsEnabled = false
	room.HandleToggleMedia(ctx, client, req)

	assert.False(t, client.IsVideoEnabled)
}

func TestHandleToggleHand(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "User", RoleTypeParticipant)

	room.addParticipant(ctx, client)

	// Raise hand
	req := &pb.ToggleHandRequest{
		IsRaised: true,
	}
	room.HandleToggleHand(ctx, client, req)

	assert.True(t, client.IsHandRaised)

	// Lower hand
	req.IsRaised = false
	room.HandleToggleHand(ctx, client, req)

	assert.False(t, client.IsHandRaised)
}

func TestHandleChat(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	participant := createTestClient("user1", "User", RoleTypeParticipant)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)

	req := &pb.ChatRequest{
		Content:  "Hello everyone!",
		TargetId: "", // Public message
	}

	room.HandleChat(ctx, participant, req)

	// Chat should be added to history
	chats := room.getRecentChats()
	assert.Equal(t, 1, len(chats))
	assert.Equal(t, "Hello everyone!", string(chats[0].ChatContent))
	assert.Equal(t, participant.ID, chats[0].ClientId)

	// Both clients should receive the broadcast
	time.Sleep(100 * time.Millisecond)
	assert.Greater(t, len(host.send), 0)
	assert.Greater(t, len(participant.send), 0)
}

func TestHandleScreenShare(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "User", RoleTypeParticipant)

	room.addParticipant(ctx, client)

	// Start screen sharing
	req := &pb.ScreenShareRequest{
		IsSharing: true,
	}
	room.HandleScreenShare(ctx, client, req)

	assert.True(t, client.IsScreenSharing)

	// Stop screen sharing
	req.IsSharing = false
	room.HandleScreenShare(ctx, client, req)

	assert.False(t, client.IsScreenSharing)
}

func TestHandleGetRecentChats(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "User", RoleTypeParticipant)

	room.addParticipant(ctx, client)

	// Add some chats
	for i := 0; i < 5; i++ {
		chat := ChatInfo{
			ClientInfo: ClientInfo{
				ClientId:    client.ID,
				DisplayName: client.DisplayName,
			},
			ChatId:      ChatId("chat" + string(rune(i))),
			ChatContent: ChatContent("Message " + string(rune(i))),
			Timestamp:   Timestamp(time.Now().UnixMilli()),
		}
		room.addChat(chat)
	}

	// Request recent chats
	room.HandleGetRecentChats(ctx, client)

	// Client should receive chats
	time.Sleep(100 * time.Millisecond)
	assert.Greater(t, len(client.send), 0)
}

func TestHandleDeleteChat(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	room.addHost(ctx, host)

	// Add a chat
	chat := ChatInfo{
		ChatId:      "chat1",
		ChatContent: "To be deleted",
	}
	room.addChat(chat)
	assert.Equal(t, 1, room.chatHistory.Len())

	// Delete the chat
	req := &pb.DeleteChatRequest{
		ChatId: "chat1",
	}
	room.HandleDeleteChat(ctx, host, req)

	assert.Equal(t, 0, room.chatHistory.Len())
}

func TestHandleDeleteChat_UnauthorizedUser(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	waiting := createTestClient("waiting1", "Waiting", RoleTypeWaiting)
	room.addWaiting(waiting)

	// Add a chat
	chat := ChatInfo{
		ChatId:      "chat1",
		ChatContent: "Should not be deleted",
	}
	room.addChat(chat)

	// Try to delete as waiting user (should fail permission check)
	req := &pb.DeleteChatRequest{
		ChatId: "chat1",
	}
	room.HandleDeleteChat(ctx, waiting, req)

	// Chat should still exist
	assert.Equal(t, 1, room.chatHistory.Len())
}

func TestHandleRequestScreenSharePermission(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	participant := createTestClient("user1", "User", RoleTypeParticipant)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)

	// Participant requests screen share permission
	room.HandleRequestScreenSharePermission(ctx, participant)

	// Host should receive the request
	time.Sleep(100 * time.Millisecond)
	assert.Greater(t, len(host.send), 0)
}

func TestHandleAdminAction_Kick(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	participant := createTestClient("user1", "User", RoleTypeParticipant)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)

	// Mock connection for participant
	mockConn := &MockWSConnection{}
	participant.conn = mockConn

	// Host kicks participant
	req := &pb.AdminActionRequest{
		Action:       "kick",
		TargetUserId: string(participant.ID),
	}
	room.HandleAdminAction(ctx, host, req)

	// Connection should be closed
	time.Sleep(100 * time.Millisecond)
	assert.True(t, mockConn.IsClosed())
}

func TestHandleAdminAction_Approve(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	waiting := createTestClient("waiting1", "Waiting User", RoleTypeWaiting)

	room.addHost(ctx, host)
	room.addWaiting(waiting)

	// Check roles
	assert.Equal(t, RoleTypeWaiting, waiting.Role)

	// Host approves waiting user
	req := &pb.AdminActionRequest{
		Action:       "approve",
		TargetUserId: string(waiting.ID),
	}
	room.HandleAdminAction(ctx, host, req)

	// User should be moved to participants
	assert.Equal(t, RoleTypeParticipant, waiting.Role)
	assert.Equal(t, waiting, room.clients[waiting.ID])
	assert.Equal(t, RoleTypeParticipant, waiting.Role)

	// User should receive join confirmation
	time.Sleep(100 * time.Millisecond)
	assert.Greater(t, len(waiting.send), 0)
}

func TestHandleAdminAction_Mute(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	participant := createTestClient("user1", "User", RoleTypeParticipant)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)

	// First unmute the participant
	room.toggleAudio(participant, true)
	assert.True(t, participant.IsAudioEnabled)

	// Host mutes participant
	req := &pb.AdminActionRequest{
		Action:       "mute",
		TargetUserId: string(participant.ID),
	}
	room.HandleAdminAction(ctx, host, req)

	assert.False(t, participant.IsAudioEnabled)
}

func TestHandleAdminAction_Unmute(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	participant := createTestClient("user1", "User", RoleTypeParticipant)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)

	// Host unmutes participant
	req := &pb.AdminActionRequest{
		Action:       "unmute",
		TargetUserId: string(participant.ID),
	}
	room.HandleAdminAction(ctx, host, req)

	assert.True(t, participant.IsAudioEnabled)
}

func TestHandleAdminAction_UnauthorizedUser(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host", RoleTypeHost)
	participant := createTestClient("user1", "User", RoleTypeParticipant)
	attacker := createTestClient("attacker", "Attacker", RoleTypeParticipant)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)
	room.addParticipant(ctx, attacker)

	// Non-host tries to kick someone (should fail)
	req := &pb.AdminActionRequest{
		Action:       "kick",
		TargetUserId: string(participant.ID),
	}
	room.HandleAdminAction(ctx, attacker, req)

	// Participant should still be in room
	assert.Equal(t, RoleTypeParticipant, participant.Role)
	assert.Equal(t, participant, room.clients[participant.ID])
}

func TestHandleChatPrivateMessage(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	user1 := createTestClient("user1", "User 1", RoleTypeParticipant)
	user2 := createTestClient("user2", "User 2", RoleTypeParticipant)

	room.addParticipant(ctx, user1)
	room.addParticipant(ctx, user2)

	// Send private message
	req := &pb.ChatRequest{
		Content:  "Private message",
		TargetId: string(user2.ID),
	}

	room.HandleChat(ctx, user1, req)

	// Private message should NOT be in chat history
	chats := room.getRecentChats()
	assert.Equal(t, 0, len(chats))
}

func TestMultipleHandRaises(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Add multiple participants
	users := make([]*Client, 5)
	for i := 0; i < 5; i++ {
		users[i] = createTestClient(string(rune('a'+i)), "User"+string(rune('0'+i)), RoleTypeParticipant)
		room.addParticipant(ctx, users[i])
	}

	// All raise hands
	for _, user := range users {
		req := &pb.ToggleHandRequest{IsRaised: true}
		room.HandleToggleHand(ctx, user, req)
	}

	for _, user := range users {
		assert.True(t, user.IsHandRaised)
	}

	// First user lowers hand
	req := &pb.ToggleHandRequest{IsRaised: false}
	room.HandleToggleHand(ctx, users[0], req)

	// Verify counts
	raisedCount := 0
	for _, user := range users {
		if user.IsHandRaised {
			raisedCount++
		}
	}
	assert.Equal(t, 4, raisedCount)
	assert.False(t, users[0].IsHandRaised)
}
