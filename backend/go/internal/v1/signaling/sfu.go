package signaling

import (
	"context"
	"fmt"
	"log/slog"

	"sync"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
)

// CreateSFUSession initializes the user in Rust and sends the SDP Offer back to the UI
func CreateSFUSession(ctx context.Context, r types.Roomer, client types.ClientInterface, sfu types.SFUProvider, wg *sync.WaitGroup) error {
	if sfu == nil {
		return fmt.Errorf("SFU client not initialized")
	}

	// 1. Call Rust (gRPC)
	resp, err := sfu.CreateSession(ctx, string(client.GetID()), string(r.GetID()))
	if err != nil {
		return err
	}

	// 2. Send 'JoinResponse' (Success)
	joinMsg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_JoinResponse{
			JoinResponse: &pb.JoinResponse{
				Success: true,
				UserId:  string(client.GetID()),
				IsHost:  client.GetRole() == types.RoleTypeHost,
				// Populate InitialState so the frontend can immediately determine if it is in Waiting Room
				InitialState: r.BuildRoomStateProto(ctx),
			},
		},
	}
	client.SendProto(joinMsg)

	// 3. Send the SDP Offer (SignalEvent)
	offerMsg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_SignalEvent{
			SignalEvent: &pb.SignalEvent{
				Signal: &pb.SignalEvent_SdpOffer{
					SdpOffer: resp.SdpOffer,
				},
			},
		},
	}
	client.SendProto(offerMsg)

	// 4. Start Listening for Asynchronous Events (Tracks, Renegotiation)
	stream, err := sfu.ListenEvents(ctx, string(client.GetID()), string(r.GetID()))
	if err != nil {
		slog.Error("Failed to start listening for SFU events", "error", err, "clientId", client.GetID())
		// Non-fatal, but video might not work properly
	} else if stream != nil {
		if wg != nil {
			wg.Add(1)
		}
		go func() {
			if wg != nil {
				defer wg.Done()
			}
			for {
				event, err := stream.Recv()
				if err != nil {
					slog.Info("SFU Event Stream closed", "clientId", client.GetID(), "error", err)
					return
				}

				if msg := ProcessSFUEvent(client, event); msg != nil {
					client.SendProto(msg)
				}
			}
		}()
	}

	return nil
}

// HandleSFUSignal forwards answers and candidates from the UI to Rust
func HandleSFUSignal(ctx context.Context, r types.Roomer, client types.ClientInterface, sfu types.SFUProvider, signal *pb.SignalRequest) {
	if sfu == nil {
		return
	}

	signalType := GetSignalType(signal)
	slog.Debug("Forwarding signal to SFU", "clientId", client.GetID(), "signalType", signalType)

	_, err := sfu.HandleSignal(ctx, string(client.GetID()), string(r.GetID()), signal)
	if err != nil {
		slog.Error("SFU Signal Error", "error", err)
	}
}
