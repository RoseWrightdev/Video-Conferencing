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
	clients := map[types.ClientIdType]types.ClientInterface{
		"user1": &MockClient{ID: "user1"},
		"user2": &MockClient{ID: "user2"},
	}

	tests := []struct {
		name      string
		targetId  types.ClientIdType
		wantFound bool
	}{
		{"Found user1", "user1", true},
		{"Found user2", "user2", true},
		{"Not found user3", "user3", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := findTargetClient(clients, tt.targetId)
			if tt.wantFound {
				assert.NoError(t, err)
				assert.NotNil(t, got)
				assert.Equal(t, tt.targetId, got.GetID())
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
		name   string
		client types.ClientInterface
		want   bool
	}{
		{"Waiting user", &MockClient{Role: types.RoleTypeWaiting}, true},
		{"Host user", &MockClient{Role: types.RoleTypeHost}, false},
		{"Nil user", nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, shouldApproveWaitingUser(tt.client))
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
	userId := "user123"
	msg := buildApprovalMessage(userId)
	assert.NotNil(t, msg)
	joinResp := msg.GetJoinResponse()
	assert.NotNil(t, joinResp)
	assert.True(t, joinResp.Success)
	assert.Equal(t, userId, joinResp.UserId)
}

func TestParseAdminAction(t *testing.T) {
	assert.Equal(t, AdminActionKick, parseAdminAction("kick"))
	assert.Equal(t, AdminActionApprove, parseAdminAction("approve"))
	assert.Equal(t, AdminActionMute, parseAdminAction("mute"))
	assert.Equal(t, AdminActionUnmute, parseAdminAction("unmute"))
	assert.Equal(t, adminActionType("unknown"), parseAdminAction("unknown"))
}
