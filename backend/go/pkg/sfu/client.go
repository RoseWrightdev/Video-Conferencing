package sfu

import (
	"context"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto" // Verify this path matches your go.mod
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type SFUClient struct {
	client pb.SfuServiceClient
}

func NewSFUClient(address string) (*SFUClient, error) {
	// Connect to Rust (Data Plane)
	conn, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	return &SFUClient{
		client: pb.NewSfuServiceClient(conn),
	}, nil
}

// CreateSession initializes a peer in the Rust SFU
func (s *SFUClient) CreateSession(ctx context.Context, uid string, roomID string) (*pb.CreateSessionResponse, error) {
	resp, err := s.client.CreateSession(ctx, &pb.CreateSessionRequest{
		UserId: uid,    // Correct field name from sfu.proto [cite: 84]
		RoomId: roomID, // Correct field name from sfu.proto [cite: 84]
	})
	return resp, err
}

// HandleSignal forwards WebRTC messages (Answer/ICE) from the Frontend to Rust
// Note: We added roomID here because SignalMessage requires it [cite: 85]
func (s *SFUClient) HandleSignal(ctx context.Context, uid string, roomID string, signal *pb.SignalRequest) (*pb.SignalResponse, error) {
	// 1. Construct the gRPC Message
	rpcReq := &pb.SignalMessage{
		UserId: uid,    // Correct field name [cite: 85]
		RoomId: roomID, // Correct field name [cite: 85]
	}

	// 2. Map the 'oneof' fields from WebSocket (SignalRequest) to gRPC (SignalMessage)
	// We use the Get*() helpers to safely access oneof fields.

	if val := signal.GetSdpAnswer(); val != "" {
		// Client sent an Answer
		rpcReq.Payload = &pb.SignalMessage_SdpAnswer{SdpAnswer: val}
	} else if val := signal.GetIceCandidate(); val != "" {
		// Client sent an ICE Candidate
		rpcReq.Payload = &pb.SignalMessage_IceCandidate{IceCandidate: val}
	} else if val := signal.GetSdpOffer(); val != "" {
		// Client sent an Offer (Renegotiation)
		rpcReq.Payload = &pb.SignalMessage_SdpOffer{SdpOffer: val}
	}
	// Note: 'Renegotiate' is in signaling.proto [cite: 73] but NOT in sfu.proto[cite: 86],
	// so we cannot forward it to Rust yet.

	return s.client.HandleSignal(ctx, rpcReq)
}

// DeleteSession cleans up the user in Rust when they disconnect
func (s *SFUClient) DeleteSession(ctx context.Context, uid string, roomID string) error {
	_, err := s.client.DeleteSession(ctx, &pb.DeleteSessionRequest{
		UserId: uid,
		RoomId: roomID,
	})
	return err
}

// ListenEvents subscribes to asynchronous events from the SFU (TrackAdded, Renegotiation)
func (s *SFUClient) ListenEvents(ctx context.Context, uid string, roomID string) (pb.SfuService_ListenEventsClient, error) {
	return s.client.ListenEvents(ctx, &pb.ListenRequest{
		UserId: uid,
		RoomId: roomID,
	})
}
