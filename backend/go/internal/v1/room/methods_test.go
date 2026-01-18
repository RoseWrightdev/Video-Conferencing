package room

import (
	"context"
	"fmt"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func TestAddParticipant(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeWaiting)

	// Add participant
	room.addParticipant(ctx, client)

	// Verify client is in participants map
	assert.Equal(t, client, room.clients[client.ID])
	assert.Equal(t, types.RoleTypeParticipant, client.Role)

	// Verify draw order queue updated
	assert.Equal(t, 1, room.clientDrawOrderQueue.Len())

	// Verify Redis call was made
	assert.Greater(t, len(mockBus.setAddCalls), 0)
}

func TestAddParticipant_RedisError(_ *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{failSetAdd: true}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeWaiting)

	// Should not panic, just log error
	room.addParticipant(ctx, client)
}

func TestDeleteParticipant(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeParticipant)

	// Add then delete
	room.addParticipant(ctx, client)
	room.deleteParticipant(ctx, client)

	// Verify client is removed from draw order
	assert.Equal(t, 0, room.clientDrawOrderQueue.Len())
	assert.Greater(t, len(mockBus.setRemCalls), 0)
}

func TestAddHost(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeWaiting)

	// Add host
	room.addHost(ctx, client)

	// Verify client is in hosts map
	assert.Equal(t, client, room.clients[client.ID])
	assert.Equal(t, types.RoleTypeHost, client.Role)

	// Verify draw order queue updated
	assert.Equal(t, 1, room.clientDrawOrderQueue.Len())
}

func TestDeleteHost(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	// Add then delete
	room.addHost(ctx, client)
	room.deleteHost(ctx, client)

	// Verify client is removed from draw order
	assert.Equal(t, 0, room.clientDrawOrderQueue.Len())
}

func TestAddWaiting(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeParticipant)

	// Add to waiting
	room.addWaiting(client)

	// Verify client is in waiting map
	assert.Equal(t, client, room.clients[client.ID])
	assert.Equal(t, types.RoleTypeWaiting, client.Role)

	// Verify draw order stack updated
	assert.Equal(t, 1, room.waitingDrawOrderStack.Len())
}

func TestDeleteWaiting(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeWaiting)

	// Add then delete
	room.addWaiting(client)
	room.deleteWaiting(client)

	// Verify client is removed from draw order
	assert.Equal(t, 0, room.waitingDrawOrderStack.Len())
}

func TestToggleScreenshare(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeParticipant)

	// Enable screenshare
	room.toggleScreenshare(client, true)
	// assert.True(t, client.IsScreenSharing) // Room method doesn't set it anymore, just draw order

	// Check if in draw order
	found := false
	for e := room.clientDrawOrderQueue.Front(); e != nil; e = e.Next() {
		if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
			found = true
			break
		}
	}
	assert.True(t, found)
}

func TestRaiseHand(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeParticipant)

	// Raise hand
	room.raiseHand(client, true)
	// assert.True(t, client.IsHandRaised)

	// Check if in hand draw order
	found := false
	for e := room.handDrawOrderQueue.Front(); e != nil; e = e.Next() {
		if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
			found = true
			break
		}
	}
	assert.True(t, found)

	// Lower hand
	room.raiseHand(client, false)
	found = false
	for e := room.handDrawOrderQueue.Front(); e != nil; e = e.Next() {
		if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
			found = true
			break
		}
	}
	assert.False(t, found)
}

func TestAddChat(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)

	chat := types.ChatInfo{
		ClientInfo: types.ClientInfo{
			ClientID:    "user1",
			DisplayName: "Test User",
		},
		ChatID:      "chat1",
		Timestamp:   123456,
		ChatContent: "Hello World",
	}

	room.addChat(chat)
	assert.Equal(t, 1, room.chatHistory.Len())

	// Verify chat is retrievable
	chats := room.getRecentChats()
	assert.Equal(t, 1, len(chats))
	assert.Equal(t, chat.ChatID, chats[0].ChatID)
}

func TestGetRecentChats(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)

	// Add multiple chats
	for i := 0; i < 60; i++ {
		chat := types.ChatInfo{
			ChatID:      types.ChatID(fmt.Sprintf("chat%d", i)),
			ChatContent: types.ChatContent("Message"),
		}
		room.addChat(chat)
	}

	// Should return only last 50
	chats := room.getRecentChats()
	assert.Equal(t, 50, len(chats))
}

func TestDeleteChat(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)

	chat := types.ChatInfo{
		ChatID:      "chat1",
		ChatContent: "Hello",
	}
	room.addChat(chat)
	assert.Equal(t, 1, room.chatHistory.Len())

	// Delete the chat
	room.deleteChat(types.DeleteChatPayload{ChatID: "chat1"})
	assert.Equal(t, 0, room.chatHistory.Len())
}

func TestDisconnectClient(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeParticipant)

	// Add client as participant
	room.addParticipant(ctx, client)
	room.raiseHand(client, true)

	// Disconnect
	room.disconnectClient(ctx, client)

	// Verify all states cleared
	_, ok := room.clients[client.ID]
	assert.False(t, ok)
}

func TestBuildRoomStateProto(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := NewMockClient("host1", "Host User", types.RoleTypeHost)
	participant := NewMockClient("user1", "Participant User", types.RoleTypeParticipant)
	waiting := NewMockClient("waiting1", "Waiting User", types.RoleTypeWaiting)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)
	room.addWaiting(waiting)

	// Build proto
	proto := room.BuildRoomStateProto(ctx)

	// Verify participants count (hosts + participants)
	assert.Equal(t, 2, len(proto.Participants))
	assert.Equal(t, 1, len(proto.WaitingUsers))

	// Find and verify host
	var foundHost *pb.ParticipantInfo
	for _, p := range proto.Participants {
		if p.Id == "host1" {
			foundHost = p
			break
		}
	}
	assert.NotNil(t, foundHost)
	assert.True(t, foundHost.IsHost)

	// Find and verify participant
	var foundParticipant *pb.ParticipantInfo
	for _, p := range proto.Participants {
		if p.Id == "user1" {
			foundParticipant = p
			break
		}
	}
	assert.NotNil(t, foundParticipant)
	assert.False(t, foundParticipant.IsHost)
}

func TestChatHistoryLimit(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	room.maxChatHistoryLength = 10

	// Add more than the limit
	for i := 0; i < 15; i++ {
		chat := types.ChatInfo{
			ChatID:      types.ChatID(fmt.Sprintf("chat%d", i)),
			ChatContent: types.ChatContent("Message"),
		}
		room.addChat(chat)
	}

	// Should maintain max limit
	assert.Equal(t, 10, room.chatHistory.Len())
}

func TestRoleTransitions(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := NewMockClient("user1", "Test User", types.RoleTypeWaiting)

	// Start as waiting
	room.addWaiting(client)
	assert.Equal(t, types.RoleTypeWaiting, client.Role)

	// Promote to participant
	room.addParticipant(ctx, client)
	assert.Equal(t, types.RoleTypeParticipant, client.Role)

	// Promote to host
	room.addHost(ctx, client)
	assert.Equal(t, types.RoleTypeHost, client.Role)

	// Demote to waiting
	room.addWaiting(client)
	assert.Equal(t, types.RoleTypeWaiting, client.Role)
}
