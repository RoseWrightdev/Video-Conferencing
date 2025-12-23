package session

import (
	"container/list"
	"context"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/stretchr/testify/assert"
)

// MockBusService is a mock implementation of BusService for testing
type MockBusService struct {
	setAddCalls    []string
	setRemCalls    []string
	publishCalls   int
	subscribeCalls int
}

func (m *MockBusService) SetAdd(ctx context.Context, key string, value string) error {
	m.setAddCalls = append(m.setAddCalls, key+":"+value)
	return nil
}

func (m *MockBusService) SetRem(ctx context.Context, key string, value string) error {
	m.setRemCalls = append(m.setRemCalls, key+":"+value)
	return nil
}

func (m *MockBusService) SetMembers(ctx context.Context, key string) ([]string, error) {
	return []string{}, nil
}

func (m *MockBusService) Publish(ctx context.Context, roomID string, event string, payload any, senderID string, roles []string) error {
	m.publishCalls++
	return nil
}

func (m *MockBusService) PublishDirect(ctx context.Context, targetUserId string, event string, payload any, senderID string) error {
	return nil
}

func (m *MockBusService) Subscribe(ctx context.Context, roomID string, handler func(bus.PubSubPayload)) {
	m.subscribeCalls++
}

func (m *MockBusService) Close() error {
	return nil
}

// Helper to create a test client
func createTestClient(id string, name string, role RoleType) *Client {
	return &Client{
		ID:          ClientIdType(id),
		DisplayName: DisplayNameType(name),
		Role:        role,
		send:        make(chan []byte, 256),
	}
}

func TestAddParticipant(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeWaiting)

	// Add participant
	room.addParticipant(ctx, client)

	// Verify client is in participants map
	assert.Contains(t, room.participants, client.ID)
	assert.Equal(t, RoleTypeParticipant, client.Role)

	// Verify not in other maps
	assert.NotContains(t, room.hosts, client.ID)
	assert.NotContains(t, room.waiting, client.ID)

	// Verify draw order queue updated
	assert.Equal(t, 1, room.clientDrawOrderQueue.Len())

	// Verify Redis call was made
	assert.Greater(t, len(mockBus.setAddCalls), 0)
}

func TestDeleteParticipant(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Add then delete
	room.addParticipant(ctx, client)
	room.deleteParticipant(ctx, client)

	// Verify client is removed
	assert.NotContains(t, room.participants, client.ID)
	assert.Equal(t, 0, room.clientDrawOrderQueue.Len())
	assert.Greater(t, len(mockBus.setRemCalls), 0)
}

func TestAddHost(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeWaiting)

	// Add host
	room.addHost(ctx, client)

	// Verify client is in hosts map
	assert.Contains(t, room.hosts, client.ID)
	assert.Equal(t, RoleTypeHost, client.Role)

	// Verify not in other maps
	assert.NotContains(t, room.participants, client.ID)
	assert.NotContains(t, room.waiting, client.ID)

	// Verify draw order queue updated
	assert.Equal(t, 1, room.clientDrawOrderQueue.Len())
}

func TestDeleteHost(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeHost)

	// Add then delete
	room.addHost(ctx, client)
	room.deleteHost(ctx, client)

	// Verify client is removed
	assert.NotContains(t, room.hosts, client.ID)
	assert.Equal(t, 0, room.clientDrawOrderQueue.Len())
}

func TestAddWaiting(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Add to waiting
	room.addWaiting(client)

	// Verify client is in waiting map
	assert.Contains(t, room.waiting, client.ID)
	assert.Equal(t, RoleTypeWaiting, client.Role)

	// Verify not in other maps
	assert.NotContains(t, room.hosts, client.ID)
	assert.NotContains(t, room.participants, client.ID)

	// Verify draw order stack updated
	assert.Equal(t, 1, room.waitingDrawOrderStack.Len())
}

func TestDeleteWaiting(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeWaiting)

	// Add then delete
	room.addWaiting(client)
	room.deleteWaiting(client)

	// Verify client is removed
	assert.NotContains(t, room.waiting, client.ID)
	assert.Equal(t, 0, room.waitingDrawOrderStack.Len())
}

func TestToggleAudio(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Enable audio
	room.toggleAudio(client, true)
	assert.Contains(t, room.unmuted, client.ID)

	// Disable audio
	room.toggleAudio(client, false)
	assert.NotContains(t, room.unmuted, client.ID)
}

func TestToggleVideo(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Enable video
	room.toggleVideo(client, true)
	assert.Contains(t, room.cameraOn, client.ID)

	// Disable video
	room.toggleVideo(client, false)
	assert.NotContains(t, room.cameraOn, client.ID)
}

func TestToggleScreenshare(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Enable screenshare
	room.toggleScreenshare(client, true)
	assert.Contains(t, room.sharingScreen, client.ID)
	assert.NotNil(t, client.drawOrderElement)

	// Disable screenshare
	room.toggleScreenshare(client, false)
	assert.NotContains(t, room.sharingScreen, client.ID)
}

func TestRaiseHand(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Raise hand
	room.raiseHand(client, true)
	assert.Contains(t, room.raisingHand, client.ID)
	assert.NotNil(t, client.drawOrderElement)

	// Lower hand
	room.raiseHand(client, false)
	assert.NotContains(t, room.raisingHand, client.ID)
}

func TestAddChat(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)

	chat := ChatInfo{
		ClientInfo: ClientInfo{
			ClientId:    "user1",
			DisplayName: "Test User",
		},
		ChatId:      "chat1",
		Timestamp:   123456,
		ChatContent: "Hello World",
	}

	room.addChat(chat)
	assert.Equal(t, 1, room.chatHistory.Len())

	// Verify chat is retrievable
	chats := room.getRecentChats()
	assert.Equal(t, 1, len(chats))
	assert.Equal(t, chat.ChatId, chats[0].ChatId)
}

func TestGetRecentChats(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	room.chatHistory = list.New()

	// Add multiple chats
	for i := 0; i < 60; i++ {
		chat := ChatInfo{
			ChatId:      ChatId("chat" + string(rune(i))),
			ChatContent: ChatContent("Message " + string(rune(i))),
		}
		room.addChat(chat)
	}

	// Should return only last 50
	chats := room.getRecentChats()
	assert.Equal(t, 50, len(chats))
}

func TestDeleteChat(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)

	chat := ChatInfo{
		ChatId:      "chat1",
		ChatContent: "Hello",
	}
	room.addChat(chat)
	assert.Equal(t, 1, room.chatHistory.Len())

	// Delete the chat
	room.deleteChat(DeleteChatPayload{ChatId: "chat1"})
	assert.Equal(t, 0, room.chatHistory.Len())
}

func TestDisconnectClient(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Add client as participant
	room.addParticipant(ctx, client)
	room.toggleAudio(client, true)
	room.toggleVideo(client, true)
	room.raiseHand(client, true)

	// Disconnect
	room.disconnectClient(ctx, client)

	// Verify all states cleared
	assert.NotContains(t, room.participants, client.ID)
	assert.NotContains(t, room.unmuted, client.ID)
	assert.NotContains(t, room.cameraOn, client.ID)
	assert.NotContains(t, room.raisingHand, client.ID)
}

func TestBuildRoomStateProto(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host := createTestClient("host1", "Host User", RoleTypeHost)
	participant := createTestClient("user1", "Participant User", RoleTypeParticipant)
	waiting := createTestClient("waiting1", "Waiting User", RoleTypeWaiting)

	room.addHost(ctx, host)
	room.addParticipant(ctx, participant)
	room.addWaiting(waiting)

	// Toggle some states
	room.toggleAudio(host, true)
	room.toggleVideo(participant, true)
	room.raiseHand(participant, true)

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
	assert.True(t, foundHost.IsAudioEnabled)

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
	assert.True(t, foundParticipant.IsVideoEnabled)
	assert.True(t, foundParticipant.IsHandRaised)
}

func TestGetLocalHosts(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	host1 := createTestClient("host1", "Host 1", RoleTypeHost)
	host2 := createTestClient("host2", "Host 2", RoleTypeHost)

	room.addHost(ctx, host1)
	room.addHost(ctx, host2)

	hosts := room.getLocalHosts()
	assert.Equal(t, 2, len(hosts))
}

func TestGetLocalParticipants(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	p1 := createTestClient("p1", "Participant 1", RoleTypeParticipant)
	p2 := createTestClient("p2", "Participant 2", RoleTypeParticipant)

	room.addParticipant(ctx, p1)
	room.addParticipant(ctx, p2)

	participants := room.getLocalParticipants()
	assert.Equal(t, 2, len(participants))
}

func TestChatHistoryLimit(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	room.maxChatHistoryLength = 10

	// Add more than the limit
	for i := 0; i < 15; i++ {
		chat := ChatInfo{
			ChatId:      ChatId("chat" + string(rune(i))),
			ChatContent: ChatContent("Message"),
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
	client := createTestClient("user1", "Test User", RoleTypeWaiting)

	// Start as waiting
	room.addWaiting(client)
	assert.Contains(t, room.waiting, client.ID)
	assert.Equal(t, RoleTypeWaiting, client.Role)

	// Promote to participant
	room.addParticipant(ctx, client)
	assert.NotContains(t, room.waiting, client.ID)
	assert.Contains(t, room.participants, client.ID)
	assert.Equal(t, RoleTypeParticipant, client.Role)

	// Promote to host
	room.addHost(ctx, client)
	assert.NotContains(t, room.participants, client.ID)
	assert.Contains(t, room.hosts, client.ID)
	assert.Equal(t, RoleTypeHost, client.Role)

	// Demote to waiting
	room.addWaiting(client)
	assert.NotContains(t, room.hosts, client.ID)
	assert.Contains(t, room.waiting, client.ID)
	assert.Equal(t, RoleTypeWaiting, client.Role)
}
