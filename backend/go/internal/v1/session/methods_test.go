package session

import (
	"container/list"
	"context"
	"sync"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/stretchr/testify/assert"
)

// MockBusService is a mock implementation of BusService for testing
type MockBusService struct {
	mu             sync.Mutex
	setAddCalls    []string
	setRemCalls    []string
	publishCalls   int
	subscribeCalls int
	failPublish    bool
	failSetAdd     bool
	failSetRem     bool
}

func (m *MockBusService) SetAdd(ctx context.Context, key string, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failSetAdd {
		return assert.AnError
	}
	m.setAddCalls = append(m.setAddCalls, key+":"+value)
	return nil
}

func (m *MockBusService) SetRem(ctx context.Context, key string, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failSetRem {
		return assert.AnError
	}
	m.setRemCalls = append(m.setRemCalls, key+":"+value)
	return nil
}

func (m *MockBusService) SetMembers(ctx context.Context, key string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return []string{}, nil
}

func (m *MockBusService) Publish(ctx context.Context, roomID string, event string, payload any, senderID string, roles []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failPublish {
		return assert.AnError
	}
	m.publishCalls++
	return nil
}

func (m *MockBusService) PublishDirect(ctx context.Context, targetUserId string, event string, payload any, senderID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return nil
}

func (m *MockBusService) Subscribe(ctx context.Context, roomID string, handler func(bus.PubSubPayload)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.subscribeCalls++
}

func (m *MockBusService) Close() error {
	return nil
}

// Helper to create a test client
func createTestClient(id string, name string, role RoleType) *Client {
	return &Client{
		ID:           ClientIdType(id),
		DisplayName:  DisplayNameType(name),
		Role:         role,
		send:         make(chan []byte, 256),
		prioritySend: make(chan []byte, 256),
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
	assert.Equal(t, client, room.clients[client.ID])
	assert.Equal(t, RoleTypeParticipant, client.Role)

	// Verify draw order queue updated
	assert.Equal(t, 1, room.clientDrawOrderQueue.Len())

	// Verify Redis call was made
	assert.Greater(t, len(mockBus.setAddCalls), 0)
}

func TestAddParticipant_RedisError(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{failSetAdd: true}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeWaiting)

	// Should not panic, just log error
	room.addParticipant(ctx, client)
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
	// Note: deleteParticipant no longer removes from clients map (handleClientDisconnect does that)
	// _, ok := room.clients[client.ID]
	// assert.False(t, ok)
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
	assert.Equal(t, client, room.clients[client.ID])
	assert.Equal(t, RoleTypeHost, client.Role)

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
	// Note: deleteHost no longer removes from clients map
	// _, ok := room.clients[client.ID]
	// assert.False(t, ok)
	assert.Equal(t, 0, room.clientDrawOrderQueue.Len())
}

func TestAddWaiting(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Add to waiting
	room.addWaiting(client)

	// Verify client is in waiting map
	assert.Equal(t, client, room.clients[client.ID])
	assert.Equal(t, RoleTypeWaiting, client.Role)

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
	// Note: deleteWaiting no longer removes from clients map
	// _, ok := room.clients[client.ID]
	// assert.False(t, ok)
	assert.Equal(t, 0, room.waitingDrawOrderStack.Len())
}

func TestToggleAudio(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Enable audio
	room.toggleAudio(client, true)
	assert.True(t, client.IsAudioEnabled)

	// Disable audio
	room.toggleAudio(client, false)
	assert.False(t, client.IsAudioEnabled)
}

func TestToggleVideo(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Enable video
	room.toggleVideo(client, true)
	assert.True(t, client.IsVideoEnabled)

	// Disable video
	room.toggleVideo(client, false)
	assert.False(t, client.IsVideoEnabled)
}

func TestToggleScreenshare(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Enable screenshare
	room.toggleScreenshare(client, true)
	assert.True(t, client.IsScreenSharing)
	assert.NotNil(t, client.drawOrderElement)

	// Disable screenshare
	room.toggleScreenshare(client, false)
	assert.False(t, client.IsScreenSharing)
}

func TestRaiseHand(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)

	// Raise hand
	room.raiseHand(client, true)
	assert.True(t, client.IsHandRaised)
	assert.NotNil(t, client.drawOrderElement)

	// Lower hand
	room.raiseHand(client, false)
	assert.False(t, client.IsHandRaised)
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
	// Verify all states cleared
	_, ok := room.clients[client.ID]
	assert.False(t, ok)
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
	assert.Equal(t, RoleTypeWaiting, client.Role)

	// Promote to participant
	room.addParticipant(ctx, client)
	assert.Equal(t, RoleTypeParticipant, client.Role)

	// Promote to host
	room.addHost(ctx, client)
	assert.Equal(t, RoleTypeHost, client.Role)

	// Demote to waiting
	room.addWaiting(client)
	assert.Equal(t, RoleTypeWaiting, client.Role)
}
