package room

import (
	"fmt"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
)

// Admin action helper functions - pure business logic, fully testable

// validateAdminPermission checks if the client has permission to perform admin actions.
func validateAdminPermission(clientRole types.RoleType) error {
	if !HasPermission(clientRole, HasHostPermission()) {
		return fmt.Errorf("unauthorized: only hosts can perform admin actions")
	}
	return nil
}

// findTargetClient looks up a client by ID in the clients map.
func findTargetClient(clients map[types.ClientIdType]types.ClientInterface, targetId types.ClientIdType) (types.ClientInterface, error) {
	if client, ok := clients[targetId]; ok {
		return client, nil
	}
	return nil, fmt.Errorf("client not found: %s", targetId)
}

// shouldKickClient determines if a client can be kicked.
func shouldKickClient(target types.ClientInterface) bool {
	return target != nil
}

// shouldApproveWaitingUser determines if a waiting user should be approved.
func shouldApproveWaitingUser(target types.ClientInterface) bool {
	return target != nil && target.GetRole() == types.RoleTypeWaiting
}

// shouldMuteClient determines if a client can be muted.
func shouldMuteClient(target types.ClientInterface) bool {
	return target != nil
}

// buildKickMessage creates the kick notification message.
func buildKickMessage() *pb.WebSocketMessage {
	return &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_AdminEvent{
			AdminEvent: &pb.AdminActionEvent{
				Action: "kicked",
				Reason: "Host removed you",
			},
		},
	}
}

// buildRoomClosedMessage creates the room closed notification message.
func buildRoomClosedMessage() *pb.WebSocketMessage {
	return &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_AdminEvent{
			AdminEvent: &pb.AdminActionEvent{
				Action: "room_closed",
				Reason: "The host has left the room.",
			},
		},
	}
}

// buildApprovalMessage creates the approval notification message for a waiting user.
func buildApprovalMessage(userId string) *pb.WebSocketMessage {
	return &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_JoinResponse{
			JoinResponse: &pb.JoinResponse{
				Success: true,
				UserId:  userId,
				IsHost:  false,
			},
		},
	}
}

// buildTransferOwnershipMessage creates the ownership transfer notification message.
func buildTransferOwnershipMessage(newOwnerId string) *pb.WebSocketMessage {
	return &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_AdminEvent{
			AdminEvent: &pb.AdminActionEvent{
				Action: "ownership_transferred",
				Reason: newOwnerId,
			},
		},
	}
}

// adminActionType represents the type of admin action
type adminActionType string

const (
	AdminActionKick              adminActionType = "kick"
	AdminActionApprove           adminActionType = "approve"
	AdminActionMute              adminActionType = "mute"
	AdminActionUnmute            adminActionType = "unmute"
	AdminActionTransferOwnership adminActionType = "transfer_ownership"
)

// parseAdminAction converts string action to typed action.
func parseAdminAction(action string) adminActionType {
	return adminActionType(action)
}
