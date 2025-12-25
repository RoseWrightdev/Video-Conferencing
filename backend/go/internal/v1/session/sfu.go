package session

import (
	"context"
	"fmt"
	"log/slog"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

// CreateSFUSession initializes the user in Rust and sends the SDP Offer back to the UI
func (r *Room) CreateSFUSession(ctx context.Context, client *Client) error {
	if r.sfu == nil {
		return fmt.Errorf("SFU client not initialized")
	}

	// 1. Call Rust (gRPC)
	// Rust will create a PeerConnection and return an SDP Offer [cite: 4]
	resp, err := r.sfu.CreateSession(ctx, string(client.ID), string(r.ID))
	if err != nil {
		return err
	}

	// 2. Send 'JoinResponse' (Success)
	// This tells the UI "You are in the room" [cite: 101]
	joinMsg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_JoinResponse{
			JoinResponse: &pb.JoinResponse{
				Success: true,
				UserId:  string(client.ID),
				IsHost:  client.Role == RoleTypeHost,
				// Populate InitialState so the frontend can immediately determine if it is in Waiting Room
				InitialState: r.BuildRoomStateProto(ctx),
			},
		},
	}
	client.sendProto(joinMsg)

	// 3. Send the SDP Offer (SignalEvent)
	// This starts the WebRTC handshake [cite: 116]
	offerMsg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_SignalEvent{
			SignalEvent: &pb.SignalEvent{
				Signal: &pb.SignalEvent_SdpOffer{
					SdpOffer: resp.SdpOffer,
				},
			},
		},
	}
	client.sendProto(offerMsg)

	// 4. Start Listening for Asynchronous Events (Tracks, Renegotiation)
	stream, err := r.sfu.ListenEvents(ctx, string(client.ID), string(r.ID))
	if err != nil {
		slog.Error("Failed to start listening for SFU events", "error", err, "clientId", client.ID)
		// Non-fatal, but video might not work properly
	} else if stream != nil {
		go func() {
			for {
				event, err := stream.Recv()
				if err != nil {
					// Stream closed or error
					slog.Info("SFU Event Stream closed", "clientId", client.ID, "error", err)
					return
				}

				slog.Info("DEBUG: Raw SFU Event received", "clientId", client.ID, "event", event.String(), "payloadType", fmt.Sprintf("%T", event.Payload))

				// Handle TrackAdded
				if trackEvent := event.GetTrackEvent(); trackEvent != nil {
					slog.Info("SFU Track Added event received", "targetClientId", client.ID, "sourceUserId", trackEvent.UserId, "streamId", trackEvent.StreamId, "kind", trackEvent.TrackKind)
					// Forward to Client
					msg := &pb.WebSocketMessage{
						Payload: &pb.WebSocketMessage_TrackAdded{
							TrackAdded: trackEvent,
						},
					}
					client.sendProto(msg)
					slog.Debug("Forwarded TrackAdded to client", "clientId", client.ID)
				}

				// Handle Renegotiation Offer from SFU
				if sdp := event.GetRenegotiateSdpOffer(); sdp != "" {
					slog.Info("SFU Renegotiation Offer", "clientId", client.ID)
					msg := &pb.WebSocketMessage{
						Payload: &pb.WebSocketMessage_SignalEvent{
							SignalEvent: &pb.SignalEvent{
								Signal: &pb.SignalEvent_SdpOffer{
									SdpOffer: sdp,
								},
							},
						},
					}
					client.sendProto(msg)
				}

				// Handle Answer from SFU (when client initiated negotiation)
				if sdp := event.GetSdpAnswer(); sdp != "" {
					slog.Info("SFU Answer received", "clientId", client.ID)
					msg := &pb.WebSocketMessage{
						Payload: &pb.WebSocketMessage_SignalEvent{
							SignalEvent: &pb.SignalEvent{
								Signal: &pb.SignalEvent_SdpAnswer{
									SdpAnswer: sdp,
								},
							},
						},
					}
					client.sendProto(msg)
				}

				// Handle ICE Candidate from SFU
				if candidate := event.GetIceCandidate(); candidate != "" {
					slog.Debug("SFU ICE Candidate received", "clientId", client.ID)
					msg := &pb.WebSocketMessage{
						Payload: &pb.WebSocketMessage_SignalEvent{
							SignalEvent: &pb.SignalEvent{
								Signal: &pb.SignalEvent_IceCandidate{
									IceCandidate: candidate,
								},
							},
						},
					}
					client.sendProto(msg)
				}
			}
		}()
	}

	return nil
}

// HandleSFUSignal forwards answers and candidates from the UI to Rust
func (r *Room) HandleSFUSignal(ctx context.Context, client *Client, signal *pb.SignalRequest) {
	if r.sfu == nil {
		return
	}

	// Forward to Rust via gRPC [cite: 8]
	slog.Debug("Forwarding signal to SFU", "clientId", client.ID, "signalType", signal.String())
	_, err := r.sfu.HandleSignal(ctx, string(client.ID), string(r.ID), signal)
	if err != nil {
		slog.Error("SFU Signal Error", "error", err)
		return
	}
}
