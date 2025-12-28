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
					slog.Info("SFU Event Stream closed", "clientId", client.ID, "error", err)
					return
				}

				if msg := processSFUEvent(client, event); msg != nil {
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

	signalType := getSignalType(signal)
	slog.Debug("Forwarding signal to SFU", "clientId", client.ID, "signalType", signalType)

	_, err := r.sfu.HandleSignal(ctx, string(client.ID), string(r.ID), signal)
	if err != nil {
		slog.Error("SFU Signal Error", "error", err)
	}
}
