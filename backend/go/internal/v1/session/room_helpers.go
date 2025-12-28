package session

import (
	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

// Room helper functions - pure business logic, fully testable

// canClientJoinSFU determines if a client is allowed to request an SFU session.
func canClientJoinSFU(client *Client) bool {
	// Waiting users must be approved by Host first
	return client.Role != RoleTypeWaiting
}

// validateMessagePayload checks if the message has a valid payload.
func validateMessagePayload(msg *pb.WebSocketMessage) bool {
	return msg != nil && msg.Payload != nil
}
