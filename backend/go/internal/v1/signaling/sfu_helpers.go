package signaling

import (
	"log/slog"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
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
func ProcessSFUEvent(client types.ClientInterface, event *pb.SfuEvent) *pb.WebSocketMessage {
	// Handle TrackAdded
	if trackEvent := event.GetTrackEvent(); trackEvent != nil {
		slog.Info("SFU Track Added event received", "targetClientId", client.GetID(), "sourceUserId", trackEvent.UserId, "streamId", trackEvent.StreamId, "kind", trackEvent.TrackKind)
		return &pb.WebSocketMessage{
			Payload: &pb.WebSocketMessage_TrackAdded{
				TrackAdded: trackEvent,
			},
		}
	}

	// Handle Renegotiation Offer from SFU
	if sdp := event.GetRenegotiateSdpOffer(); sdp != "" {
		slog.Info("SFU Renegotiation Offer", "clientId", client.GetID())
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
		slog.Info("SFU Answer received", "clientId", client.GetID())
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
		slog.Debug("SFU ICE Candidate received", "clientId", client.GetID())
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

	return nil
}
