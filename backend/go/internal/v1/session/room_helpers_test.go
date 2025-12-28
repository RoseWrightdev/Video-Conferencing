package session

import (
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/stretchr/testify/assert"
)

func TestCanClientJoinSFU(t *testing.T) {
	assert.True(t, canClientJoinSFU(&Client{Role: RoleTypeHost}))
	assert.True(t, canClientJoinSFU(&Client{Role: RoleTypeParticipant}))
	assert.False(t, canClientJoinSFU(&Client{Role: RoleTypeWaiting}))
}

func TestValidateMessagePayload(t *testing.T) {
	assert.False(t, validateMessagePayload(nil))
	assert.False(t, validateMessagePayload(&pb.WebSocketMessage{Payload: nil}))
	assert.True(t, validateMessagePayload(&pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_Join{Join: &pb.JoinRequest{}},
	}))
}
