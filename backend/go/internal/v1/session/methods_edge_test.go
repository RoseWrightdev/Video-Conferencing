package session

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestHandleClientConnect_DeleteSessionError(t *testing.T) {
	mockSFU := &MockSFUProvider{failDeleteSession: true}
	room := NewRoom("test-room", nil, nil, mockSFU)

	client1 := createTestClient("user1", "Alice", RoleTypeParticipant)
	room.clients[client1.ID] = client1

	client2 := createTestClient("user1", "Alice-New", RoleTypeParticipant)

	// Should not panic, should log error
	room.handleClientConnect(client2)

	assert.True(t, mockSFU.DeleteSessionCalled)
	assert.Equal(t, client2, room.clients[client2.ID])
}

func TestDisconnectClientLocked_DeleteSessionError(t *testing.T) {
	ctx := context.Background()
	mockSFU := &MockSFUProvider{failDeleteSession: true}
	room := NewRoom("test-room", nil, nil, mockSFU)

	client := createTestClient("user1", "Alice", RoleTypeParticipant)
	room.clients[client.ID] = client

	// Should not panic, should log warning
	room.disconnectClient(ctx, client)

	assert.True(t, mockSFU.DeleteSessionCalled)
	assert.NotContains(t, room.clients, client.ID)
}

func TestAddParticipantLocked_RedisError(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{failSetAdd: true}
	room := NewRoom("test-room", nil, mockBus, nil)

	client := createTestClient("user1", "Alice", RoleTypeWaiting)

	// Should not panic, should log error
	room.addParticipant(ctx, client)

	assert.Contains(t, room.clients, client.ID)
	assert.Equal(t, RoleTypeParticipant, client.Role)
}

func TestDisconnectClientLocked_RedisError(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{failSetRem: true}
	room := NewRoom("test-room", nil, mockBus, nil)

	client := createTestClient("user1", "Alice", RoleTypeParticipant)
	room.clients[client.ID] = client

	// Should not panic
	room.disconnectClient(ctx, client)

	assert.NotContains(t, room.clients, client.ID)
}

func TestHandleClientConnect_Reconnection(t *testing.T) {
	room := NewRoom("test-room", nil, nil, nil)
	room.ownerID = "owner"

	tests := []struct {
		name          string
		clientId      string
		preservedRole RoleType
		expectedRole  RoleType
	}{
		{
			name:          "Owner Reconnecting",
			clientId:      "owner",
			preservedRole: RoleTypeUnknown,
			expectedRole:  RoleTypeHost,
		},
		{
			name:          "Participant Reconnecting",
			clientId:      "user1",
			preservedRole: RoleTypeParticipant,
			expectedRole:  RoleTypeParticipant,
		},
		{
			name:          "Waiting User Reconnecting",
			clientId:      "user2",
			preservedRole: RoleTypeWaiting,
			expectedRole:  RoleTypeWaiting,
		},
		{
			name:          "New User (Waiting)",
			clientId:      "user3",
			preservedRole: RoleTypeUnknown,
			expectedRole:  RoleTypeWaiting,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := createTestClient(tt.clientId, "User", RoleTypeUnknown)
			if tt.preservedRole != RoleTypeUnknown {
				// Simulate existing client with that role
				oldClient := createTestClient(tt.clientId, "User", tt.preservedRole)
				room.clients[oldClient.ID] = oldClient
			}

			room.handleClientConnect(client)
			assert.Equal(t, tt.expectedRole, client.Role)

			// Clean up for next test case
			delete(room.clients, client.ID)
		})
	}
}
