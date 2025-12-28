package room

import (
	"context"
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func TestHandleClientConnect_DeleteSessionError(t *testing.T) {
	mockSFU := &MockSFUProvider{failDelete: true}
	r := NewRoom("test-room", nil, nil, mockSFU)

	client1 := newMockClient("user1", "Alice", types.RoleTypeParticipant)
	r.clients[client1.GetID()] = client1

	client2 := newMockClient("user1", "Alice-New", types.RoleTypeParticipant)

	// Should not panic, should log error
	r.HandleClientConnect(client2)

	assert.True(t, mockSFU.deleteCalled)
	assert.Equal(t, client2, r.clients[client2.GetID()])
}

func TestDisconnectClientLocked_DeleteSessionError(t *testing.T) {
	ctx := context.Background()
	mockSFU := &MockSFUProvider{failDelete: true}
	r := NewRoom("test-room", nil, nil, mockSFU)

	client := newMockClient("user1", "Alice", types.RoleTypeParticipant)
	r.clients[client.GetID()] = client

	// Should not panic, should log warning
	r.DisconnectClient(ctx, client)

	assert.True(t, mockSFU.deleteCalled)
	assert.NotContains(t, r.clients, client.GetID())
}

func TestAddParticipantLocked_RedisError(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{failSetAdd: true}
	r := NewRoom("test-room", nil, mockBus, nil)

	client := newMockClient("user1", "Alice", types.RoleTypeWaiting)

	// Should not panic, should log error
	r.AddParticipant(ctx, client)

	assert.Contains(t, r.clients, client.GetID())
	assert.Equal(t, types.RoleTypeParticipant, client.GetRole())
}

func TestDisconnectClientLocked_RedisError(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{failSetRem: true}
	r := NewRoom("test-room", nil, mockBus, nil)

	client := newMockClient("user1", "Alice", types.RoleTypeParticipant)
	r.clients[client.GetID()] = client

	// Should not panic
	r.DisconnectClient(ctx, client)

	assert.NotContains(t, r.clients, client.GetID())
}

func TestHandleClientConnect_Reconnection(t *testing.T) {
	r := NewRoom("test-room", nil, nil, nil)
	r.ownerID = "owner"

	tests := []struct {
		name          string
		clientId      string
		preservedRole types.RoleType
		expectedRole  types.RoleType
	}{
		{
			name:          "Owner Reconnecting",
			clientId:      "owner",
			preservedRole: types.RoleTypeUnknown,
			expectedRole:  types.RoleTypeHost,
		},
		{
			name:          "Participant Reconnecting",
			clientId:      "user1",
			preservedRole: types.RoleTypeParticipant,
			expectedRole:  types.RoleTypeParticipant,
		},
		{
			name:          "Waiting User Reconnecting",
			clientId:      "user2",
			preservedRole: types.RoleTypeWaiting,
			expectedRole:  types.RoleTypeWaiting,
		},
		{
			name:          "New User (Waiting)",
			clientId:      "user3",
			preservedRole: types.RoleTypeUnknown,
			expectedRole:  types.RoleTypeWaiting,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := newMockClient(tt.clientId, "User", types.RoleTypeUnknown)
			if tt.preservedRole != types.RoleTypeUnknown {
				// Simulate existing client with that role
				oldClient := newMockClient(tt.clientId, "User", tt.preservedRole)
				r.clients[oldClient.GetID()] = oldClient
			}

			r.HandleClientConnect(client)
			assert.Equal(t, tt.expectedRole, client.GetRole())

			// Clean up for next test case
			delete(r.clients, client.GetID())
		})
	}
}
