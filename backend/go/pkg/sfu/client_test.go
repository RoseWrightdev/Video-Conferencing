package sfu

import (
	"context"
	"net"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/sony/gobreaker"
	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc"
)

type mockSfuServiceClient struct {
	createSessionFunc func(ctx context.Context, in *pb.CreateSessionRequest, opts ...grpc.CallOption) (*pb.CreateSessionResponse, error)
	handleSignalFunc  func(ctx context.Context, in *pb.SignalMessage, opts ...grpc.CallOption) (*pb.SignalResponse, error)
	deleteSessionFunc func(ctx context.Context, in *pb.DeleteSessionRequest, opts ...grpc.CallOption) (*pb.DeleteSessionResponse, error)
	listenEventsFunc  func(_ context.Context, in *pb.ListenRequest, _ ...grpc.CallOption) (grpc.ServerStreamingClient[pb.SfuEvent], error)
}

func (m *mockSfuServiceClient) CreateSession(ctx context.Context, in *pb.CreateSessionRequest, opts ...grpc.CallOption) (*pb.CreateSessionResponse, error) {
	if m.createSessionFunc != nil {
		return m.createSessionFunc(ctx, in, opts...)
	}
	return nil, nil
}

func (m *mockSfuServiceClient) HandleSignal(ctx context.Context, in *pb.SignalMessage, opts ...grpc.CallOption) (*pb.SignalResponse, error) {
	if m.handleSignalFunc != nil {
		return m.handleSignalFunc(ctx, in, opts...)
	}
	return nil, nil
}

func (m *mockSfuServiceClient) DeleteSession(ctx context.Context, in *pb.DeleteSessionRequest, opts ...grpc.CallOption) (*pb.DeleteSessionResponse, error) {
	if m.deleteSessionFunc != nil {
		return m.deleteSessionFunc(ctx, in, opts...)
	}
	return nil, nil
}

func (m *mockSfuServiceClient) ListenEvents(ctx context.Context, in *pb.ListenRequest, opts ...grpc.CallOption) (grpc.ServerStreamingClient[pb.SfuEvent], error) {
	if m.listenEventsFunc != nil {
		return m.listenEventsFunc(ctx, in, opts...)
	}
	return nil, nil
}

// Mock Stream Client
type mockListenEventsClient struct {
	grpc.ServerStreamingClient[pb.SfuEvent]
}

func (m *mockListenEventsClient) Recv() (*pb.SfuEvent, error) {
	return nil, nil
}

func TestNewClient_Connects(t *testing.T) {
	lis, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer func() { _ = lis.Close() }()

	s := grpc.NewServer()
	pb.RegisterSfuServiceServer(s, &pb.UnimplementedSfuServiceServer{})

	go func() {
		_ = s.Serve(lis)
	}()
	defer s.Stop()

	// Test NewClient
	c, err := NewClient(lis.Addr().String())
	assert.NoError(t, err)
	assert.NotNil(t, c)

	err = c.Close()
	assert.NoError(t, err)
}

func TestCreateSession(t *testing.T) {
	mock := &mockSfuServiceClient{
		createSessionFunc: func(_ context.Context, in *pb.CreateSessionRequest, _ ...grpc.CallOption) (*pb.CreateSessionResponse, error) {
			assert.Equal(t, "user-1", in.UserId)
			assert.Equal(t, "room-1", in.RoomId)
			return &pb.CreateSessionResponse{SdpOffer: "offer"}, nil
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	resp, err := client.CreateSession(context.Background(), "user-1", "room-1")
	assert.NoError(t, err)
	assert.Equal(t, "offer", resp.SdpOffer)
}

func TestHandleSignal(t *testing.T) {
	mock := &mockSfuServiceClient{
		handleSignalFunc: func(_ context.Context, in *pb.SignalMessage, _ ...grpc.CallOption) (*pb.SignalResponse, error) {
			assert.Equal(t, "user-1", in.UserId)
			// Check oneof mapping
			assert.Equal(t, "answer-sdp", in.GetSdpAnswer())
			return &pb.SignalResponse{}, nil
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	req := &pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpAnswer{SdpAnswer: "answer-sdp"},
	}

	_, err := client.HandleSignal(context.Background(), "user-1", "room-1", req)
	assert.NoError(t, err)
}

func TestHandleSignal_IceCandidate(t *testing.T) {
	mock := &mockSfuServiceClient{
		handleSignalFunc: func(_ context.Context, in *pb.SignalMessage, _ ...grpc.CallOption) (*pb.SignalResponse, error) {
			assert.Equal(t, "user-1", in.UserId)
			assert.Equal(t, "candidate", in.GetIceCandidate())
			return &pb.SignalResponse{}, nil
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	req := &pb.SignalRequest{
		Signal: &pb.SignalRequest_IceCandidate{IceCandidate: "candidate"},
	}

	_, err := client.HandleSignal(context.Background(), "user-1", "room-1", req)
	assert.NoError(t, err)
}

func TestDeleteSession(t *testing.T) {
	mock := &mockSfuServiceClient{
		deleteSessionFunc: func(_ context.Context, in *pb.DeleteSessionRequest, _ ...grpc.CallOption) (*pb.DeleteSessionResponse, error) {
			assert.Equal(t, "user-1", in.UserId)
			return &pb.DeleteSessionResponse{Success: true}, nil
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	err := client.DeleteSession(context.Background(), "user-1", "room-1")
	assert.NoError(t, err)
}

func TestListenEvents(t *testing.T) {
	mock := &mockSfuServiceClient{
		listenEventsFunc: func(_ context.Context, in *pb.ListenRequest, _ ...grpc.CallOption) (grpc.ServerStreamingClient[pb.SfuEvent], error) {
			assert.Equal(t, "user-1", in.UserId)
			return &mockListenEventsClient{}, nil
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	resp, err := client.ListenEvents(context.Background(), "user-1", "room-1")
	assert.NoError(t, err)
	assert.NotNil(t, resp)
}

func TestCreateSession_CircuitBreakerError(t *testing.T) {
	mock := &mockSfuServiceClient{
		createSessionFunc: func(_ context.Context, _ *pb.CreateSessionRequest, _ ...grpc.CallOption) (*pb.CreateSessionResponse, error) {
			return nil, assert.AnError
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	_, err := client.CreateSession(context.Background(), "user-1", "room-1")
	assert.Error(t, err)
}

func TestHandleSignal_Error(t *testing.T) {
	mock := &mockSfuServiceClient{
		handleSignalFunc: func(_ context.Context, _ *pb.SignalMessage, _ ...grpc.CallOption) (*pb.SignalResponse, error) {
			return nil, assert.AnError
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	req := &pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpAnswer{SdpAnswer: "answer"},
	}

	_, err := client.HandleSignal(context.Background(), "user-1", "room-1", req)
	assert.Error(t, err)
}

func TestDeleteSession_Error(t *testing.T) {
	mock := &mockSfuServiceClient{
		deleteSessionFunc: func(_ context.Context, _ *pb.DeleteSessionRequest, _ ...grpc.CallOption) (*pb.DeleteSessionResponse, error) {
			return nil, assert.AnError
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	err := client.DeleteSession(context.Background(), "user-1", "room-1")
	assert.Error(t, err)
}

func TestListenEvents_Error(t *testing.T) {
	mock := &mockSfuServiceClient{
		listenEventsFunc: func(_ context.Context, _ *pb.ListenRequest, _ ...grpc.CallOption) (grpc.ServerStreamingClient[pb.SfuEvent], error) {
			return nil, assert.AnError
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	_, err := client.ListenEvents(context.Background(), "user-1", "room-1")
	assert.Error(t, err)
}

func TestHandleSignal_SdpOffer(t *testing.T) {
	mock := &mockSfuServiceClient{
		handleSignalFunc: func(_ context.Context, in *pb.SignalMessage, _ ...grpc.CallOption) (*pb.SignalResponse, error) {
			assert.Equal(t, "user-1", in.UserId)
			assert.Equal(t, "offer-sdp", in.GetSdpOffer())
			return &pb.SignalResponse{}, nil
		},
	}

	client := &Client{
		client: mock,
		cb:     gobreaker.NewCircuitBreaker(gobreaker.Settings{}),
	}

	req := &pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpOffer{SdpOffer: "offer-sdp"},
	}

	_, err := client.HandleSignal(context.Background(), "user-1", "room-1", req)
	assert.NoError(t, err)
}

func TestNewClient_Error(t *testing.T) {
	t.Skip("Skipping: NewClient with invalid address may hang or require network timeout")
	// Test with invalid address
	_, err := NewClient("invalid:999999")
	assert.Error(t, err)
}

func TestClose_Error(t *testing.T) {
	// Create client with mock that has no connection
	client := &Client{
		client: nil,
		conn:   nil,
	}

	// Close should handle nil gracefully
	err := client.Close()
	assert.NoError(t, err)
}
