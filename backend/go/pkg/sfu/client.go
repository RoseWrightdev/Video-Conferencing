package sfu

import (
	"context"

	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto" // Verify this path matches your go.mod
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/metrics"
	"github.com/sony/gobreaker"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
)

type SFUClient struct {
	client pb.SfuServiceClient
	conn   *grpc.ClientConn
	cb     *gobreaker.CircuitBreaker
}

func NewSFUClient(address string) (*SFUClient, error) {
	// Connect to Rust (Data Plane)
	conn, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}

	st := gobreaker.Settings{
		Name:        "rust-sfu",
		MaxRequests: 3,
		Interval:    1 * time.Minute,
		Timeout:     30 * time.Second,
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			// Update Prometheus metrics
			var stateVal float64
			switch to {
			case gobreaker.StateClosed:
				stateVal = 0
			case gobreaker.StateOpen:
				stateVal = 1
			case gobreaker.StateHalfOpen:
				stateVal = 2
			}
			metrics.CircuitBreakerState.WithLabelValues("rust-sfu").Set(stateVal)
		},
	}

	return &SFUClient{
		client: pb.NewSfuServiceClient(conn),
		conn:   conn,
		cb:     gobreaker.NewCircuitBreaker(st),
	}, nil
}

// CreateSession initializes a peer in the Rust SFU
func (s *SFUClient) CreateSession(ctx context.Context, uid string, roomID string) (*pb.CreateSessionResponse, error) {
	resp, err := s.cb.Execute(func() (interface{}, error) {
		return s.client.CreateSession(ctx, &pb.CreateSessionRequest{
			UserId: uid,
			RoomId: roomID,
		})
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("rust-sfu").Inc()
			return nil, status.Error(codes.Unavailable, "circuit breaker open")
		}
		return nil, err
	}
	return resp.(*pb.CreateSessionResponse), nil
}

// HandleSignal forwards WebRTC messages (Answer/ICE) from the Frontend to Rust
// Note: We added roomID here because SignalMessage requires it [cite: 85]
func (s *SFUClient) HandleSignal(ctx context.Context, uid string, roomID string, signal *pb.SignalRequest) (*pb.SignalResponse, error) {
	resp, err := s.cb.Execute(func() (interface{}, error) {
		// 1. Construct the gRPC Message
		rpcReq := &pb.SignalMessage{
			UserId: uid,
			RoomId: roomID,
		}

		// 2. Map the 'oneof' fields from WebSocket (SignalRequest) to gRPC (SignalMessage)
		if val := signal.GetSdpAnswer(); val != "" {
			rpcReq.Payload = &pb.SignalMessage_SdpAnswer{SdpAnswer: val}
		} else if val := signal.GetIceCandidate(); val != "" {
			rpcReq.Payload = &pb.SignalMessage_IceCandidate{IceCandidate: val}
		} else if val := signal.GetSdpOffer(); val != "" {
			rpcReq.Payload = &pb.SignalMessage_SdpOffer{SdpOffer: val}
		}

		return s.client.HandleSignal(ctx, rpcReq)
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("rust-sfu").Inc()
			return nil, status.Error(codes.Unavailable, "circuit breaker open")
		}
		return nil, err
	}
	return resp.(*pb.SignalResponse), nil
}

// DeleteSession cleans up the user in Rust when they disconnect
func (s *SFUClient) DeleteSession(ctx context.Context, uid string, roomID string) error {
	_, err := s.cb.Execute(func() (interface{}, error) {
		return s.client.DeleteSession(ctx, &pb.DeleteSessionRequest{
			UserId: uid,
			RoomId: roomID,
		})
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("rust-sfu").Inc()
			return status.Error(codes.Unavailable, "circuit breaker open")
		}
		return err
	}
	return nil
}

// ListenEvents subscribes to asynchronous events from the SFU (TrackAdded, Renegotiation)
func (s *SFUClient) ListenEvents(ctx context.Context, uid string, roomID string) (pb.SfuService_ListenEventsClient, error) {
	// Streaming RPCs are trickier with Circuit Breakers.
	// We only protect the initial connection attempt.
	resp, err := s.cb.Execute(func() (interface{}, error) {
		return s.client.ListenEvents(ctx, &pb.ListenRequest{
			UserId: uid,
			RoomId: roomID,
		})
	})
	if err != nil {
		if err == gobreaker.ErrOpenState {
			metrics.CircuitBreakerFailures.WithLabelValues("rust-sfu").Inc()
			return nil, status.Error(codes.Unavailable, "circuit breaker open")
		}
		return nil, err
	}
	return resp.(pb.SfuService_ListenEventsClient), nil
}

// Close gracefully closes the gRPC connection to the SFU
func (s *SFUClient) Close() error {
	if s.conn != nil {
		return s.conn.Close()
	}
	return nil
}
