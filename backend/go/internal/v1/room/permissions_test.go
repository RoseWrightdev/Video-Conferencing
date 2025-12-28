package room

import (
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

// TestPermissions tests the permission system coverage
func TestPermissions(t *testing.T) {
	t.Run("HasScreensharePermission", func(t *testing.T) {
		assert.True(t, HasPermission(types.RoleTypeScreenshare, HasScreensharePermission()), "Screenshare role should have screenshare permission")
		assert.True(t, HasPermission(types.RoleTypeHost, HasScreensharePermission()), "Host role should have screenshare permission")
		assert.False(t, HasPermission(types.RoleTypeParticipant, HasScreensharePermission()), "Participant role should not have screenshare permission")
		assert.False(t, HasPermission(types.RoleTypeWaiting, HasScreensharePermission()), "Waiting role should not have screenshare permission")
	})

	t.Run("HasHostPermission", func(t *testing.T) {
		assert.True(t, HasPermission(types.RoleTypeHost, HasHostPermission()), "Host role should have host permission")
		assert.False(t, HasPermission(types.RoleTypeScreenshare, HasHostPermission()), "Screenshare role should not have host permission")
		assert.False(t, HasPermission(types.RoleTypeParticipant, HasHostPermission()), "Participant role should not have host permission")
		assert.False(t, HasPermission(types.RoleTypeWaiting, HasHostPermission()), "Waiting role should not have host permission")
	})

	t.Run("HasParticipantPermission", func(t *testing.T) {
		assert.True(t, HasPermission(types.RoleTypeHost, HasParticipantPermission()), "Host role should have participant permission")
		assert.True(t, HasPermission(types.RoleTypeScreenshare, HasParticipantPermission()), "Screenshare role should have participant permission")
		assert.True(t, HasPermission(types.RoleTypeParticipant, HasParticipantPermission()), "Participant role should have participant permission")
		assert.False(t, HasPermission(types.RoleTypeWaiting, HasParticipantPermission()), "Waiting role should not have participant permission")
	})

	t.Run("HasWaitingPermission", func(t *testing.T) {
		// Note: HasWaitingPermission returns the waiting role set only
		// which means only waiting users have this specific permission
		waitingPerms := HasWaitingPermission()
		assert.False(t, HasPermission(types.RoleTypeHost, waitingPerms), "Host role does not have waiting-only permission")
		assert.False(t, HasPermission(types.RoleTypeScreenshare, waitingPerms), "Screenshare role does not have waiting-only permission")
		assert.False(t, HasPermission(types.RoleTypeParticipant, waitingPerms), "Participant role does not have waiting-only permission")
		assert.True(t, HasPermission(types.RoleTypeWaiting, waitingPerms), "Waiting role has waiting permission")
	})
}
