package room

import (
	"context"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func TestHandleToggleMedia_Audio(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)
	client := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddParticipant(ctx, client)

	// Enable audio
	req := &pb.ToggleMediaRequest{
		Kind:      "audio",
		IsEnabled: true,
	}
	r.HandleToggleMedia(ctx, client, req)

	assert.True(t, client.GetIsAudioEnabled())

	// Disable audio
	req.IsEnabled = false
	r.HandleToggleMedia(ctx, client, req)

	assert.False(t, client.GetIsAudioEnabled())
}

func TestHandleToggleMedia_Video(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)
	client := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddParticipant(ctx, client)

	// Enable video
	req := &pb.ToggleMediaRequest{
		Kind:      "video",
		IsEnabled: true,
	}
	r.HandleToggleMedia(ctx, client, req)

	assert.True(t, client.GetIsVideoEnabled())

	// Disable video
	req.IsEnabled = false
	r.HandleToggleMedia(ctx, client, req)

	assert.False(t, client.GetIsVideoEnabled())
}

func TestHandleToggleHand(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)
	client := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddParticipant(ctx, client)

	// Raise hand
	req := &pb.ToggleHandRequest{
		IsRaised: true,
	}
	r.HandleToggleHand(ctx, client, req)

	assert.True(t, client.GetIsHandRaised())

	// Lower hand
	req.IsRaised = false
	r.HandleToggleHand(ctx, client, req)

	assert.False(t, client.GetIsHandRaised())
}

func TestHandleChat(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	participant := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddHost(ctx, host)
	r.AddParticipant(ctx, participant)

	req := &pb.ChatRequest{
		Content:  "Hello everyone!",
		TargetId: "", // Public message
	}

	r.HandleChat(ctx, participant, req)

	// Chat should be added to history
	chats := r.GetRecentChats()
	assert.Equal(t, 1, len(chats))
	assert.Equal(t, "Hello everyone!", string(chats[0].ChatContent))
	assert.Equal(t, participant.GetID(), chats[0].ClientId)

	// Both clients should receive the broadcast
	time.Sleep(100 * time.Millisecond)
	assert.Greater(t, len(host.sendChan), 0)
	assert.Greater(t, len(participant.sendChan), 0)
}

func TestHandleScreenShare(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)
	client := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddParticipant(ctx, client)

	// Start screen sharing
	req := &pb.ScreenShareRequest{
		IsSharing: true,
	}
	r.HandleScreenShare(ctx, client, req)

	assert.True(t, client.GetIsScreenSharing())

	// Stop screen sharing
	req.IsSharing = false
	r.HandleScreenShare(ctx, client, req)

	assert.False(t, client.GetIsScreenSharing())
}

func TestHandleGetRecentChats(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)
	client := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddParticipant(ctx, client)

	// Add some chats
	for i := 0; i < 5; i++ {
		chat := types.ChatInfo{
			ClientInfo: types.ClientInfo{
				ClientId:    client.GetID(),
				DisplayName: client.GetDisplayName(),
			},
			ChatId:      types.ChatId("chat" + string(rune(i))),
			ChatContent: types.ChatContent("Message " + string(rune(i))),
			Timestamp:   types.Timestamp(time.Now().UnixMilli()),
		}
		r.AddChat(chat)
	}

	// Request recent chats
	r.HandleGetRecentChats(ctx, client)

	// Client should receive chats
	time.Sleep(100 * time.Millisecond)
	assert.Greater(t, len(client.sendChan), 0)
}

func TestHandleDeleteChat(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	r.AddHost(ctx, host)

	// Add a chat
	chat := types.ChatInfo{
		ChatId:      "chat1",
		ChatContent: "To be deleted",
	}
	r.AddChat(chat)
	assert.Equal(t, 1, r.chatHistory.Len())

	// Delete the chat
	req := &pb.DeleteChatRequest{
		ChatId: "chat1",
	}
	r.HandleDeleteChat(ctx, host, req)

	assert.Equal(t, 0, r.chatHistory.Len())
}

func TestHandleDeleteChat_UnauthorizedUser(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	waiting := newMockClient("waiting1", "Waiting", types.RoleTypeWaiting)
	r.AddWaiting(waiting)

	// Add a chat
	chat := types.ChatInfo{
		ChatId:      "chat1",
		ChatContent: "Should not be deleted",
	}
	r.AddChat(chat)

	// Try to delete as waiting user (should fail permission check)
	req := &pb.DeleteChatRequest{
		ChatId: "chat1",
	}
	r.HandleDeleteChat(ctx, waiting, req)

	// Chat should still exist
	assert.Equal(t, 1, r.chatHistory.Len())
}

func TestHandleRequestScreenSharePermission(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	participant := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddHost(ctx, host)
	r.AddParticipant(ctx, participant)

	// Participant requests screen share permission
	r.HandleRequestScreenSharePermission(ctx, participant)

	// Host should receive the request
	time.Sleep(100 * time.Millisecond)
	assert.Greater(t, len(host.sendChan), 0)
}

func TestHandleAdminAction_Kick(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	participant := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddHost(ctx, host)
	r.AddParticipant(ctx, participant)

	// Host kicks participant
	req := &pb.AdminActionRequest{
		Action:       "kick",
		TargetUserId: string(participant.GetID()),
	}
	r.HandleAdminAction(ctx, host, req)

	// Connection should be closed/disconnected
	time.Sleep(100 * time.Millisecond)
	assert.True(t, participant.isDisconnected)
}

func TestHandleAdminAction_Approve(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	waiting := newMockClient("waiting1", "Waiting User", types.RoleTypeWaiting)

	r.AddHost(ctx, host)
	r.AddWaiting(waiting)

	// Check roles
	assert.Equal(t, types.RoleTypeWaiting, waiting.GetRole())

	// Host approves waiting user
	req := &pb.AdminActionRequest{
		Action:       "approve",
		TargetUserId: string(waiting.GetID()),
	}
	r.HandleAdminAction(ctx, host, req)

	// User should be moved to participants
	assert.Equal(t, types.RoleTypeParticipant, waiting.GetRole())
	assert.Equal(t, waiting, r.clients[waiting.GetID()])

	// User should receive join confirmation
	time.Sleep(100 * time.Millisecond)
	assert.Greater(t, len(waiting.sendChan), 0)
}

func TestHandleAdminAction_Mute(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	participant := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddHost(ctx, host)
	r.AddParticipant(ctx, participant)

	// First unmute the participant
	r.toggleAudio(participant, true)
	assert.True(t, participant.GetIsAudioEnabled())

	// Host mutes participant
	req := &pb.AdminActionRequest{
		Action:       "mute",
		TargetUserId: string(participant.GetID()),
	}
	r.HandleAdminAction(ctx, host, req)

	assert.False(t, participant.GetIsAudioEnabled())
}

func TestHandleAdminAction_Unmute(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	participant := newMockClient("user1", "User", types.RoleTypeParticipant)

	r.AddHost(ctx, host)
	r.AddParticipant(ctx, participant)

	// Host unmutes participant
	req := &pb.AdminActionRequest{
		Action:       "unmute",
		TargetUserId: string(participant.GetID()),
	}
	r.HandleAdminAction(ctx, host, req)

	assert.True(t, participant.GetIsAudioEnabled())
}

func TestHandleAdminAction_UnauthorizedUser(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	host := newMockClient("host1", "Host", types.RoleTypeHost)
	participant := newMockClient("user1", "User", types.RoleTypeParticipant)
	attacker := newMockClient("attacker", "Attacker", types.RoleTypeParticipant)

	r.AddHost(ctx, host)
	r.AddParticipant(ctx, participant)
	r.AddParticipant(ctx, attacker)

	// Non-host tries to kick someone (should fail)
	req := &pb.AdminActionRequest{
		Action:       "kick",
		TargetUserId: string(participant.GetID()),
	}
	r.HandleAdminAction(ctx, attacker, req)

	// Participant should still be in room
	assert.Equal(t, types.RoleTypeParticipant, participant.GetRole())
	assert.Equal(t, participant, r.clients[participant.GetID()])
}

func TestHandleChatPrivateMessage(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	user1 := newMockClient("user1", "User 1", types.RoleTypeParticipant)
	user2 := newMockClient("user2", "User 2", types.RoleTypeParticipant)

	r.AddParticipant(ctx, user1)
	r.AddParticipant(ctx, user2)

	// Send private message
	req := &pb.ChatRequest{
		Content:  "Private message",
		TargetId: string(user2.GetID()),
	}

	r.HandleChat(ctx, user1, req)

	// Private message should NOT be in chat history
	chats := r.GetRecentChats()
	assert.Equal(t, 0, len(chats))
}

func TestMultipleHandRaises(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom("test-room", nil, mockBus, nil)

	// Add multiple participants
	users := make([]*MockClient, 5)
	for i := 0; i < 5; i++ {
		id := string(rune('a' + i))
		users[i] = newMockClient(id, "User"+string(rune('0'+i)), types.RoleTypeParticipant)
		r.AddParticipant(ctx, users[i])
	}

	// All raise hands
	for _, user := range users {
		req := &pb.ToggleHandRequest{IsRaised: true}
		r.HandleToggleHand(ctx, user, req)
	}

	for _, user := range users {
		assert.True(t, user.GetIsHandRaised())
	}

	// First user lowers hand
	req := &pb.ToggleHandRequest{IsRaised: false}
	r.HandleToggleHand(ctx, users[0], req)

	// Verify counts
	raisedCount := 0
	for _, user := range users {
		if user.GetIsHandRaised() {
			raisedCount++
		}
	}
	assert.Equal(t, 4, raisedCount)
	assert.False(t, users[0].GetIsHandRaised())
}
