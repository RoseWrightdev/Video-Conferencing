package room

import (
	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
)

// Room helper functions - pure business logic, fully testable

// canClientJoinSFU determines if a client is allowed to request an SFU session.
func canClientJoinSFU(client types.ClientInterface) bool {
	// Waiting users must be approved by Host first
	return client.GetRole() != types.RoleTypeWaiting
}

// validateMessagePayload checks if the message has a valid payload.
func validateMessagePayload(msg *pb.WebSocketMessage) bool {
	return msg != nil && msg.Payload != nil
}
