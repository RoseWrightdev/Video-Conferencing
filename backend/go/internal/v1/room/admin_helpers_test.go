package room

import (
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func TestValidateAdminPermission(t *testing.T) {
	tests := []struct {
		name    string
		role    types.RoleType
		wantErr bool
	}{
		{"Host has permission", types.RoleTypeHost, false},
		{"Participant has no permission", types.RoleTypeParticipant, true},
		{"Waiting user has no permission", types.RoleTypeWaiting, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateAdminPermission(tt.role)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestFindTargetClient(t *testing.T) {
	clients := map[types.ClientIDType]types.ClientInterface{
		"user1": &MockClient{ID: "user1"},
		"user2": &MockClient{ID: "user2"},
	}

	tests := []struct {
		name      string
		targetID  types.ClientIDType
		wantFound bool
	}{
		{"Found user1", "user1", true},
		{"Found user2", "user2", true},
		{"Not found user3", "user3", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := findTargetClient(clients, tt.targetID)
			if tt.wantFound {
				assert.NoError(t, err)
				assert.NotNil(t, got)
				assert.Equal(t, tt.targetID, got.GetID())
			} else {
				assert.Error(t, err)
				assert.Nil(t, got)
			}
		})
	}
}

func TestShouldKickClient(t *testing.T) {
	assert.True(t, shouldKickClient(&MockClient{}))
	assert.False(t, shouldKickClient(nil))
}

func TestShouldApproveWaitingUser(t *testing.T) {
	tests := []struct {
		name      string
		clients   map[types.ClientIDType]types.ClientInterface
		targetID  types.ClientIDType
		expectErr bool
	}{
		{
			name: "Found",
			clients: map[types.ClientIDType]types.ClientInterface{
				"u1": newMockClient("u1", "User 1", types.RoleTypeParticipant),
			},
			targetID:  "u1",
			expectErr: false,
		},
		{
			name: "Not Found",
			clients: map[types.ClientIDType]types.ClientInterface{
				"u1": newMockClient("u1", "User 1", types.RoleTypeParticipant),
			},
			targetID:  "u2",
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := findTargetClient(tt.clients, tt.targetID)
			if tt.expectErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestShouldMuteClient(t *testing.T) {
	assert.True(t, shouldMuteClient(&MockClient{}))
	assert.False(t, shouldMuteClient(nil))
}

func TestBuildKickMessage(t *testing.T) {
	msg := buildKickMessage()
	assert.NotNil(t, msg)
	adminEvent := msg.GetAdminEvent()
	assert.NotNil(t, adminEvent)
	assert.Equal(t, "kicked", adminEvent.Action)
}

func TestBuildApprovalMessage(t *testing.T) {
	userID := "user123"
	msg := buildApprovalMessage(userID)

	assert.NotNil(t, msg.GetJoinResponse())
	assert.True(t, msg.GetJoinResponse().Success)
	assert.Equal(t, userID, msg.GetJoinResponse().UserId)
}

func TestBuildTransferOwnershipMessage(t *testing.T) {
	newOwnerID := "user456"
	msg := buildTransferOwnershipMessage(newOwnerID)

	assert.NotNil(t, msg.GetAdminEvent())
	assert.Equal(t, "ownership_transferred", msg.GetAdminEvent().Action)
	assert.Equal(t, newOwnerID, msg.GetAdminEvent().Reason)
}

func TestParseAdminAction(t *testing.T) {
	assert.Equal(t, AdminActionKick, parseAdminAction("kick"))
	assert.Equal(t, AdminActionApprove, parseAdminAction("approve"))
	assert.Equal(t, AdminActionMute, parseAdminAction("mute"))
	assert.Equal(t, AdminActionUnmute, parseAdminAction("unmute"))
	assert.Equal(t, AdminActionTransferOwnership, parseAdminAction("transfer_ownership"))
	assert.Equal(t, adminActionType("unknown"), parseAdminAction("unknown"))
}
