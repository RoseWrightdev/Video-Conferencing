// Package room - permissions.go
//
// This file implements the role-based permission system for video conference rooms.
// The permission system defines hierarchical access levels and controls which
// actions each type of user can perform within a room.
//
// Permission Hierarchy (from least to most privileged):
//  1. Waiting: Users awaiting admission to the room
//  2. Participant: Active participants in the video call
//  3. Screenshare: Participants currently sharing their screen
//  4. Host: Room administrators with full control
//
// Design Philosophy:
// Permissions are cumulative - higher roles include all permissions of lower roles.
// This creates an intuitive hierarchy where hosts can do everything participants
// can do, plus additional administrative functions.
//
// Usage Pattern:
// These functions are typically used with the room's broadcast mechanism to
// control message visibility and with the router to enforce action permissions.
//
// Security Model:
// Permission checks are performed at the router level before any handler
// execution, ensuring that unauthorized actions are blocked early and
// consistently across all room operations.
package room

import (
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"k8s.io/utils/set"
)

var waitingPermissions = set.New(types.RoleTypeWaiting)
var screensharePermissions = set.New(types.RoleTypeHost, types.RoleTypeScreenshare)
var participantPermissions = set.New(types.RoleTypeHost, types.RoleTypeScreenshare, types.RoleTypeParticipant)
var hostPermissions = set.New(types.RoleTypeHost)

// HasWaitingPermission returns the set of roles with waiting-level permissions.
// This is the most basic permission level, granted only to users who are
// waiting for admission to the room.
//
// Waiting Permissions Include:
//   - Requesting to join the room
//   - Receiving basic room notifications
//   - Limited visibility into room state
//
// Usage:
// This permission set is typically used for messages that waiting users
// should receive, such as admission status updates or room announcements.
//
// Returns:
//   - Set containing only RoleTypeWaiting
func HasWaitingPermission() set.Set[types.RoleType] {
	return waitingPermissions
}

// HasParticipantPermission returns the set of roles with participant-level permissions.
// This permission level includes all active meeting participants who can
// engage in the full video conferencing experience.
//
// Participant Permissions Include:
//   - Participating in video/audio calls
//   - Sending and receiving chat messages
//   - Raising and lowering hands
//   - Viewing full room state and participant lists
//   - Requesting screen sharing permissions
//
// Hierarchical Access:
// This set includes participants, screen sharers, and hosts, implementing
// the cumulative permission model where higher roles inherit lower permissions.
//
// Usage:
// Most room activities (chat, hand raising, state updates) use this permission
// level as it represents the core meeting participation experience.
//
// Returns:
//   - Set containing RoleTypeParticipant, RoleTypeScreenshare, and RoleTypeHost
func HasParticipantPermission() set.Set[types.RoleType] {
	return participantPermissions
}

// HasScreensharePermission returns the set of roles with screen sharing permissions.
// This permission level is for users who can share their screen with other
// participants, typically requiring elevated privileges.
//
// Screenshare Permissions Include:
//   - All participant-level permissions
//   - Active screen sharing capabilities
//   - Enhanced UI prominence for shared content
//   - Priority in video layout algorithms
//
// Access Control:
// Screen sharing is typically restricted to prevent abuse and ensure meeting
// quality. Only screen sharers and hosts have these permissions.
//
// Usage:
// This permission set controls access to screen sharing features and
// determines who can see screen sharing related events and controls.
//
// Returns:
//   - Set containing RoleTypeScreenshare and RoleTypeHost
func HasScreensharePermission() set.Set[types.RoleType] {
	return screensharePermissions
}

// HasHostPermission returns the set of roles with host-level permissions.
// This is the highest permission level, granting full administrative
// control over the room and all its participants.
//
// Host Permissions Include:
//   - All lower-level permissions (participant, screenshare, waiting)
//   - Accepting or denying waiting room requests
//   - Managing screen sharing permissions for others
//   - Administrative control over room settings
//   - Moderating chat and participant behavior
//   - Room lifecycle management
//
// Security Considerations:
// Host permissions should be granted carefully as they provide complete
// control over the room. Typically, the first user to join becomes the
// host, with additional hosts added through invitation mechanisms.
//
// Usage:
// This permission set gates administrative actions like managing the
// waiting room, controlling screen sharing, and other sensitive operations.
//
// Returns:
//   - Set containing only RoleTypeHost
func HasHostPermission() set.Set[types.RoleType] {
	return hostPermissions
}

// HasPermission checks if a given role has permission to perform an action.
// This function implements the core permission checking logic used throughout
// the room system to enforce access control.
//
// Permission Model:
// The function uses set membership to determine if a role is included in
// a set of permitted roles. This allows for flexible permission definitions
// where multiple roles can have access to the same functionality.
//
// Usage Pattern:
// Typically called in the router before executing handlers:
//
//	if HasPermission(client.Role, HasParticipantPermission()) {
//	    // Execute participant-level action
//	}
//
// Performance:
// Set membership checking is O(1) average case, making permission checks
// very efficient even with frequent calls during message processing.
//
// Parameters:
//   - role: The role to check (from the client making the request)
//   - permissions: Set of roles that are allowed to perform the action
//
// Returns:
//   - true if the role has permission, false otherwise
func HasPermission(role types.RoleType, permissions set.Set[types.RoleType]) bool {
	return permissions.Has(role)
}
