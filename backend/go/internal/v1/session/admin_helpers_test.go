package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidateAdminPermission(t *testing.T) {
	tests := []struct {
		name    string
		role    RoleType
		wantErr bool
	}{
		{"Host has permission", RoleTypeHost, false},
		{"Participant has no permission", RoleTypeParticipant, true},
		{"Waiting user has no permission", RoleTypeWaiting, true},
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
	clients := map[ClientIdType]*Client{
		"user1": {ID: "user1"},
		"user2": {ID: "user2"},
	}

	tests := []struct {
		name      string
		targetId  ClientIdType
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
				assert.Equal(t, tt.targetId, got.ID)
			} else {
				assert.Error(t, err)
				assert.Nil(t, got)
			}
		})
	}
}

func TestShouldKickClient(t *testing.T) {
	assert.True(t, shouldKickClient(&Client{}))
	assert.False(t, shouldKickClient(nil))
}

func TestShouldApproveWaitingUser(t *testing.T) {
	tests := []struct {
		name   string
		client *Client
		want   bool
	}{
		{"Waiting user", &Client{Role: RoleTypeWaiting}, true},
		{"Host user", &Client{Role: RoleTypeHost}, false},
		{"Nil user", nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, shouldApproveWaitingUser(tt.client))
		})
	}
}

func TestShouldMuteClient(t *testing.T) {
	assert.True(t, shouldMuteClient(&Client{}))
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
