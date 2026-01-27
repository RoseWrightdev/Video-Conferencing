package room

import (
	"context"
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func TestHandleClientConnect_DeleteSessionError(t *testing.T) {
	mockSFU := &MockSFUProvider{failDelete: true}
	r := NewRoom(context.Background(), "test-room", nil, nil, mockSFU)

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
	r := NewRoom(context.Background(), "test-room", nil, nil, mockSFU)

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
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	client := newMockClient("user1", "Alice", types.RoleTypeWaiting)

	// Should not panic, should log error
	r.AddParticipant(ctx, client)

	assert.Contains(t, r.clients, client.GetID())
	assert.Equal(t, types.RoleTypeParticipant, client.GetRole())
}

func TestDisconnectClientLocked_RedisError(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{failSetRem: true}
	r := NewRoom(context.Background(), "test-room", nil, mockBus, nil)

	client := newMockClient("user1", "Alice", types.RoleTypeParticipant)
	r.clients[client.GetID()] = client

	// Should not panic
	r.DisconnectClient(ctx, client)

	assert.NotContains(t, r.clients, client.GetID())
}

func TestHandleClientConnect_Reconnection(t *testing.T) {
	r := NewRoom(context.Background(), "test-room", nil, nil, nil)
	r.ownerID = "owner"

	tests := []struct {
		name          string
		clientID      string
		preservedRole types.RoleType
		expectedRole  types.RoleType
	}{
		{
			name:          "Host role preserved",
			clientID:      "host_client",
			preservedRole: types.RoleTypeHost,
			expectedRole:  types.RoleTypeHost,
		},
		{
			name:          "Participant role preserved",
			clientID:      "participant_client",
			preservedRole: types.RoleTypeParticipant,
			expectedRole:  types.RoleTypeParticipant,
		},
		{
			name:          "Waiting role preserved",
			clientID:      "waiting_client",
			preservedRole: types.RoleTypeWaiting,
			expectedRole:  types.RoleTypeWaiting,
		},
		{
			name:          "Unknown role -> Waiting (default)",
			clientID:      "new_client",
			preservedRole: types.RoleTypeUnknown,
			expectedRole:  types.RoleTypeWaiting,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock with specific ID and Role
			client := newMockClient(tt.clientID, "User", tt.preservedRole)

			if tt.preservedRole != types.RoleTypeUnknown {
				// Simulate existing client with that role in the room
				// For the logic to find "oldClient", it must be in r.clients map
				// We reuse 'client' as the old client for simplicity or create a clone if needed.
				// Logic: existingClient, exists := r.clients[client.GetID()]
				// So we put it in the map.
				r.clients[client.GetID()] = client
			}

			r.HandleClientConnect(client)

			// Verify the role on the client was updated (or stayed same)
			assert.Equal(t, tt.expectedRole, client.GetRole())

			// Clean up for next test case
			delete(r.clients, client.GetID())
		})
	}
}
