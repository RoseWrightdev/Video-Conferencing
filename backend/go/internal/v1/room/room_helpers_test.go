package room

import (
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func TestCanClientJoinSFU(t *testing.T) {
	assert.True(t, canClientJoinSFU(&MockClient{Role: types.RoleTypeHost}))
	assert.True(t, canClientJoinSFU(&MockClient{Role: types.RoleTypeParticipant}))
	assert.False(t, canClientJoinSFU(&MockClient{Role: types.RoleTypeWaiting}))
}

func TestValidateMessagePayload(t *testing.T) {
	assert.False(t, validateMessagePayload(nil))
	assert.False(t, validateMessagePayload(&pb.WebSocketMessage{Payload: nil}))
	assert.True(t, validateMessagePayload(&pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_Join{Join: &pb.JoinRequest{}},
	}))
}
