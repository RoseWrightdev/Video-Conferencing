package session

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestPermissions tests the permission system coverage
func TestPermissions(t *testing.T) {
	t.Run("HasScreensharePermission", func(t *testing.T) {
		assert.True(t, HasPermission(RoleTypeScreenshare, HasScreensharePermission()), "Screenshare role should have screenshare permission")
		assert.True(t, HasPermission(RoleTypeHost, HasScreensharePermission()), "Host role should have screenshare permission")
		assert.False(t, HasPermission(RoleTypeParticipant, HasScreensharePermission()), "Participant role should not have screenshare permission")
		assert.False(t, HasPermission(RoleTypeWaiting, HasScreensharePermission()), "Waiting role should not have screenshare permission")
	})

	t.Run("HasHostPermission", func(t *testing.T) {
		assert.True(t, HasPermission(RoleTypeHost, HasHostPermission()), "Host role should have host permission")
		assert.False(t, HasPermission(RoleTypeScreenshare, HasHostPermission()), "Screenshare role should not have host permission")
		assert.False(t, HasPermission(RoleTypeParticipant, HasHostPermission()), "Participant role should not have host permission")
		assert.False(t, HasPermission(RoleTypeWaiting, HasHostPermission()), "Waiting role should not have host permission")
	})

	t.Run("HasParticipantPermission", func(t *testing.T) {
		assert.True(t, HasPermission(RoleTypeHost, HasParticipantPermission()), "Host role should have participant permission")
		assert.True(t, HasPermission(RoleTypeScreenshare, HasParticipantPermission()), "Screenshare role should have participant permission")
		assert.True(t, HasPermission(RoleTypeParticipant, HasParticipantPermission()), "Participant role should have participant permission")
		assert.False(t, HasPermission(RoleTypeWaiting, HasParticipantPermission()), "Waiting role should not have participant permission")
	})

	t.Run("HasWaitingPermission", func(t *testing.T) {
		// Note: HasWaitingPermission returns the waiting role set only
		// which means only waiting users have this specific permission
		waitingPerms := HasWaitingPermission()
		assert.False(t, HasPermission(RoleTypeHost, waitingPerms), "Host role does not have waiting-only permission")
		assert.False(t, HasPermission(RoleTypeScreenshare, waitingPerms), "Screenshare role does not have waiting-only permission")
		assert.False(t, HasPermission(RoleTypeParticipant, waitingPerms), "Participant role does not have waiting-only permission")
		assert.True(t, HasPermission(RoleTypeWaiting, waitingPerms), "Waiting role has waiting permission")
	})
}
