package signaling

import (
	"context"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func TestGetSignalType(t *testing.T) {
	assert.Equal(t, "SdpOffer", GetSignalType(&pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpOffer{SdpOffer: "v=0"},
	}))
	assert.Equal(t, "SdpAnswer", GetSignalType(&pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpAnswer{SdpAnswer: "v=0"},
	}))
	assert.Equal(t, "IceCandidate", GetSignalType(&pb.SignalRequest{
		Signal: &pb.SignalRequest_IceCandidate{IceCandidate: "candidate:1"},
	}))
	assert.Equal(t, "unknown", GetSignalType(&pb.SignalRequest{
		Signal: &pb.SignalRequest_Renegotiate{Renegotiate: true},
	}))
}

func TestProcessSFUEvent(t *testing.T) {
	client := NewMockClient("user1", "Test User", types.RoleTypeParticipant)

	tests := []struct {
		name   string
		event  *pb.SfuEvent
		verify func(t *testing.T, msg *pb.WebSocketMessage)
	}{
		{
			name: "TrackAdded Event",
			event: &pb.SfuEvent{
				Payload: &pb.SfuEvent_TrackEvent{
					TrackEvent: &pb.TrackAddedEvent{
						UserId:    "user2",
						StreamId:  "s1",
						TrackKind: "video",
					},
				},
			},
			verify: func(t *testing.T, msg *pb.WebSocketMessage) {
				assert.NotNil(t, msg)
				track := msg.GetTrackAdded()
				assert.NotNil(t, track)
				assert.Equal(t, "user2", track.UserId)
			},
		},
		{
			name: "RenegotiateSdpOffer Event",
			event: &pb.SfuEvent{
				Payload: &pb.SfuEvent_RenegotiateSdpOffer{RenegotiateSdpOffer: "v=negotiate"},
			},
			verify: func(t *testing.T, msg *pb.WebSocketMessage) {
				assert.NotNil(t, msg)
				signal := msg.GetSignalEvent()
				assert.NotNil(t, signal)
				offer := signal.GetSdpOffer()
				assert.Equal(t, "v=negotiate", offer)
			},
		},
		{
			name: "SdpAnswer Event",
			event: &pb.SfuEvent{
				Payload: &pb.SfuEvent_SdpAnswer{SdpAnswer: "v=answer"},
			},
			verify: func(t *testing.T, msg *pb.WebSocketMessage) {
				assert.NotNil(t, msg)
				signal := msg.GetSignalEvent()
				assert.NotNil(t, signal)
				answer := signal.GetSdpAnswer()
				assert.Equal(t, "v=answer", answer)
			},
		},
		{
			name: "IceCandidate Event",
			event: &pb.SfuEvent{
				Payload: &pb.SfuEvent_IceCandidate{IceCandidate: "cand"},
			},
			verify: func(t *testing.T, msg *pb.WebSocketMessage) {
				assert.NotNil(t, msg)
				signal := msg.GetSignalEvent()
				assert.NotNil(t, signal)
				cand := signal.GetIceCandidate()
				assert.Equal(t, "cand", cand)
			},
		},
		{
			name:  "Unknown Event",
			event: &pb.SfuEvent{Payload: nil},
			verify: func(t *testing.T, msg *pb.WebSocketMessage) {
				assert.Nil(t, msg)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := ProcessSFUEvent(context.Background(), client, tt.event)
			tt.verify(t, msg)
		})
	}
}
