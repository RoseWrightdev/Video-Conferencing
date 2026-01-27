package room

import (
	"context"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

// Fix Chat IDOR (CWE-284)
func TestHandleDeleteChat_IDOR(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(ctx, "test-room", nil, mockBus, nil)

	attacker := newMockClient("attacker", "Attacker", types.RoleTypeParticipant)
	victim := newMockClient("victim", "Victim", types.RoleTypeParticipant)

	r.AddParticipant(ctx, attacker)
	r.AddParticipant(ctx, victim)

	// Victim adds a chat
	chat := types.ChatInfo{
		ClientInfo:  types.ClientInfo{ClientID: victim.GetID()},
		ChatID:      "chat-1",
		ChatContent: "Secret Message",
	}
	r.AddChat(chat)

	// Attacker tries to delete Victim's chat
	req := &pb.DeleteChatRequest{ChatId: "chat-1"}
	r.HandleDeleteChat(ctx, attacker, req)

	// Assert: Chat should still exist (deletion failed)
	// Note: Currently this WILL fail (chat will be deleted) until we fix the bug
	assert.Equal(t, 1, r.chatHistory.Len(), "Chat IDOR: Participant should not be able to delete another participant's message")
}

// Fix Unauth Chat Read (CWE-862)
func TestHandleGetRecentChats_WaitingUser(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(ctx, "test-room", nil, mockBus, nil)

	waiting := newMockClient("waiting", "Waiting User", types.RoleTypeWaiting)
	r.AddWaiting(waiting)

	// Add some history
	r.AddChat(types.ChatInfo{ChatID: "chat-1", ChatContent: "History"})

	r.HandleGetRecentChats(ctx, waiting)

	time.Sleep(100 * time.Millisecond)
	// Assert: Waiting user should NOT receive chats
	// Currently fails (receives chats)
	assert.Equal(t, 0, len(waiting.sendChan), "Unauth Chat Read: Waiting user should not receive chat history")
}

// Fix Unauthorized Screen Share
func TestHandleScreenShare_WaitingUser(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(ctx, "test-room", nil, mockBus, nil)

	waiting := newMockClient("waiting", "Waiting User", types.RoleTypeWaiting)
	r.AddWaiting(waiting)

	req := &pb.ScreenShareRequest{IsSharing: true}
	r.HandleScreenShare(ctx, waiting, req)

	// Assert: Should not have enabled screen sharing
	assert.False(t, waiting.GetIsScreenSharing(), "Unauth Screen Share: Waiting user should not be able to share screen")
}

// Fix Host-on-Host Kick
func TestHandleAdminAction_HostKickHost(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(ctx, "test-room", nil, mockBus, nil)

	host1 := newMockClient("host1", "Host 1", types.RoleTypeHost)
	host2 := newMockClient("host2", "Host 2", types.RoleTypeHost)

	r.AddHost(ctx, host1)
	r.AddHost(ctx, host2)

	// Host 1 tries to kick Host 2
	req := &pb.AdminActionRequest{
		Action:       "kick",
		TargetUserId: string(host2.GetID()),
	}
	r.HandleAdminAction(ctx, host1, req)

	time.Sleep(100 * time.Millisecond)

	// Assert: Host 2 should still be connected and in room
	assert.False(t, host2.isDisconnected, "Host-on-Host Kick: Host should not be able to kick another Host")
	assert.NotNil(t, r.clients[host2.GetID()], "Host 2 should still be in clients map")
}
