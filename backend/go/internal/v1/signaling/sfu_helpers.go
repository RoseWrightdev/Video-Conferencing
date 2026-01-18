package signaling

import (
	"context"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"go.uber.org/zap"
)

// Signaling helper functions - pure business logic, fully testable

// GetSignalType returns a string representation of the SignalRequest type for logging.
func GetSignalType(signal *pb.SignalRequest) string {
	if signal.GetSdpOffer() != "" {
		return "SdpOffer"
	}
	if signal.GetSdpAnswer() != "" {
		return "SdpAnswer"
	}
	if signal.GetIceCandidate() != "" {
		return "IceCandidate"
	}
	return "unknown"
}

// ProcessSFUEvent processes an incoming SFU event and returns a WebSocket message to send to the client.
// Returns nil if the event is not recognized or doesn't require a message to be sent.
func ProcessSFUEvent(ctx context.Context, client types.ClientInterface, event *pb.SfuEvent) *pb.WebSocketMessage {
	// Handle TrackAdded
	if trackEvent := event.GetTrackEvent(); trackEvent != nil {
		logging.Info(ctx, "SFU Track Added event received",
			zap.String("targetClientId", string(client.GetID())),
			zap.String("sourceUserId", trackEvent.UserId),
			zap.String("streamId", trackEvent.StreamId),
			zap.String("kind", trackEvent.TrackKind),
		)
		return &pb.WebSocketMessage{
			Payload: &pb.WebSocketMessage_TrackAdded{
				TrackAdded: trackEvent,
			},
		}
	}

	// Handle Renegotiation Offer from SFU
	if sdp := event.GetRenegotiateSdpOffer(); sdp != "" {
		logging.Info(ctx, "SFU Renegotiation Offer", zap.String("clientId", string(client.GetID())))
		return &pb.WebSocketMessage{
			Payload: &pb.WebSocketMessage_SignalEvent{
				SignalEvent: &pb.SignalEvent{
					Signal: &pb.SignalEvent_SdpOffer{
						SdpOffer: sdp,
					},
				},
			},
		}
	}

	// Handle Answer from SFU
	if sdp := event.GetSdpAnswer(); sdp != "" {
		logging.Info(ctx, "SFU Answer received", zap.String("clientId", string(client.GetID())))
		return &pb.WebSocketMessage{
			Payload: &pb.WebSocketMessage_SignalEvent{
				SignalEvent: &pb.SignalEvent{
					Signal: &pb.SignalEvent_SdpAnswer{
						SdpAnswer: sdp,
					},
				},
			},
		}
	}

	// Handle ICE Candidate from SFU
	if candidate := event.GetIceCandidate(); candidate != "" {
		// Debug level in zap is handled by checking level, or just use Debug/Info
		logging.GetLogger().Debug("SFU ICE Candidate received", zap.String("clientId", string(client.GetID())))
		return &pb.WebSocketMessage{
			Payload: &pb.WebSocketMessage_SignalEvent{
				SignalEvent: &pb.SignalEvent{
					Signal: &pb.SignalEvent_IceCandidate{
						IceCandidate: candidate,
					},
				},
			},
		}
	}

	// Handle Caption from SFU
	if caption := event.GetCaption(); caption != nil {
		return &pb.WebSocketMessage{
			Payload: &pb.WebSocketMessage_Caption{
				Caption: caption,
			},
		}
	}

	return nil
}
