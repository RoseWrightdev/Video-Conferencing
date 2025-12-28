package session

import (
	"context"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/stretchr/testify/assert"
)

// Additional NewHub tests for better coverage

func TestNewHub_WithDevMode(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}

	hub := NewHub(validator, mockBus, true)

	assert.NotNil(t, hub)
	assert.True(t, hub.devMode, "devMode should be enabled")
	assert.Equal(t, 5*time.Second, hub.cleanupGracePeriod)
}

func TestNewHub_WithoutBus(t *testing.T) {
	validator := &MockTokenValidator{}

	hub := NewHub(validator, nil, false)

	assert.NotNil(t, hub)
	assert.Nil(t, hub.bus, "bus should be nil")
}

func TestNewHub_InitializesEmptyMaps(t *testing.T) {
	validator := &MockTokenValidator{}
	mockBus := &MockBusService{}

	hub := NewHub(validator, mockBus, false)

	assert.NotNil(t, hub.rooms)
	assert.Equal(t, 0, len(hub.rooms), "rooms map should be empty initially")
	assert.NotNil(t, hub.pendingRoomCleanups)
	assert.Equal(t, 0, len(hub.pendingRoomCleanups), "pendingRoomCleanups should be empty initially")
}

// Tests for handleClientConnect edge cases

func TestHandleClientConnect_FirstUserBecomesOwner(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// First user connects
	client1 := createTestClient("user1", "First User", RoleTypeWaiting)
	client1.room = room

	room.handleClientConnect(client1)

	// First user should become owner and host
	assert.Equal(t, ClientIdType("user1"), room.ownerID)
	assert.Equal(t, RoleTypeHost, client1.Role)
	_, exists := room.clients[client1.ID]
	assert.True(t, exists)
}

func TestHandleClientConnect_OwnerReconnects(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// First user becomes owner
	client1 := createTestClient("user1", "Owner", RoleTypeWaiting)
	client1.room = room
	room.handleClientConnect(client1)

	// Owner disconnects (simulate by removing from map but keeping ownerID)
	delete(room.clients, client1.ID)

	// Owner reconnects with new client instance
	client1Reconnect := createTestClient("user1", "Owner", RoleTypeWaiting)
	client1Reconnect.room = room
	room.handleClientConnect(client1Reconnect)

	// Should still be owner and host
	assert.Equal(t, ClientIdType("user1"), room.ownerID)
	assert.Equal(t, RoleTypeHost, client1Reconnect.Role)
}

func TestHandleClientConnect_NonOwnerReconnectsAsParticipant(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Setup: owner first
	owner := createTestClient("owner", "Owner", RoleTypeWaiting)
	owner.room = room
	room.handleClientConnect(owner)

	// Participant joins
	participant := createTestClient("user2", "Participant", RoleTypeWaiting)
	participant.room = room
	room.addParticipant(ctx, participant)
	room.clients[participant.ID] = participant
	participant.Role = RoleTypeParticipant

	// Simulate disconnect (remove from map)
	delete(room.clients, participant.ID)

	// Participant reconnects
	participantReconnect := createTestClient("user2", "Participant", RoleTypeWaiting)
	participantReconnect.room = room
	room.handleClientConnect(participantReconnect)

	// Non-owners go to waiting room by default on reconnect
	// This is expected behavior - host needs to re-admit them
	assert.Equal(t, RoleTypeWaiting, participantReconnect.Role)
}

func TestHandleClientConnect_DuplicateConnectionRemovesOld(t *testing.T) {
	mockBus := &MockBusService{}
	mockSFU := NewMockSFUClient()
	room := NewRoom("test-room", nil, mockBus, mockSFU)

	// First connection
	client1 := createTestClient("user1", "User", RoleTypeWaiting)
	client1.room = room
	room.handleClientConnect(client1)

	// Duplicate connection (same user ID, new instance)
	client1Duplicate := createTestClient("user1", "User", RoleTypeWaiting)
	client1Duplicate.room = room
	room.handleClientConnect(client1Duplicate)

	// SFU DeleteSession called twice: once when user1 becomes host (deletes waiting/participant roles),
	// and once more when duplicate connection removes old client
	assert.GreaterOrEqual(t, mockSFU.GetDeleteSessionCalls(), 1, "Should call DeleteSession at least once")

	// New connection should be in clients map
	currentClient, exists := room.clients[ClientIdType("user1")]
	assert.True(t, exists)
	assert.Equal(t, client1Duplicate, currentClient)
}

func TestHandleClientConnect_SubsequentUserGoesToWaiting(t *testing.T) {
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// First user becomes host
	host := createTestClient("host", "Host", RoleTypeWaiting)
	host.room = room
	room.handleClientConnect(host)

	// Second user should go to waiting
	user2 := createTestClient("user2", "User2", RoleTypeWaiting)
	user2.room = room
	room.handleClientConnect(user2)

	assert.Equal(t, RoleTypeWaiting, user2.Role)
	_, exists := room.clients[user2.ID]
	assert.True(t, exists)
}

// Error path tests

func TestDisconnectClientLocked_SFUDeleteError(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	mockSFU := NewMockSFUClient()
	mockSFU.shouldFailDelete = true

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "User", RoleTypeHost)
	room.clients[client.ID] = client

	// Should not panic even if SFU delete fails
	room.disconnectClientLocked(ctx, client)

	// Client should still be removed from room
	_, exists := room.clients[client.ID]
	assert.False(t, exists)
}

func TestBuildRoomStateProto_WithMixedRoles(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	room := NewRoom("test-room", nil, mockBus, nil)

	// Add clients with various roles and states
	host := createTestClient("host1", "Host", RoleTypeHost)
	host.IsAudioEnabled = true
	host.IsVideoEnabled = false
	host.IsHandRaised = true
	room.clients[host.ID] = host

	participant := createTestClient("user1", "Participant", RoleTypeParticipant)
	participant.IsAudioEnabled = false
	participant.IsVideoEnabled = true
	participant.IsScreenSharing = true
	room.clients[participant.ID] = participant

	waiting := createTestClient("wait1", "Waiting", RoleTypeWaiting)
	room.clients[waiting.ID] = waiting

	proto := room.BuildRoomStateProto(ctx)

	// Verify counts
	assert.GreaterOrEqual(t, len(proto.Participants), 1)
	assert.Equal(t, 1, len(proto.WaitingUsers))

	//  Verify host state is correctly set
	var hostProto *pb.ParticipantInfo
	for _, p := range proto.Participants {
		if p.Id == "host1" {
			hostProto = p
			break
		}
	}
	assert.NotNil(t, hostProto)
	assert.True(t, hostProto.IsAudioEnabled)
	assert.False(t, hostProto.IsVideoEnabled)
	assert.True(t, hostProto.IsHandRaised)
}
