// Package sfu_test contains tests for the SFU client.
package sfu

import (
	"context"
	"errors"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/sony/gobreaker"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// MockSfuServiceClient is a mock of SfuServiceClient interface
type MockSfuServiceClient struct {
	mock.Mock
}

func (m *MockSfuServiceClient) CreateSession(ctx context.Context, in *pb.CreateSessionRequest, opts ...grpc.CallOption) (*pb.CreateSessionResponse, error) {
	args := m.Called(ctx, in, opts)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*pb.CreateSessionResponse), args.Error(1)
}

func (m *MockSfuServiceClient) HandleSignal(ctx context.Context, in *pb.SignalMessage, opts ...grpc.CallOption) (*pb.SignalResponse, error) {
	args := m.Called(ctx, in, opts)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*pb.SignalResponse), args.Error(1)
}

func (m *MockSfuServiceClient) DeleteSession(ctx context.Context, in *pb.DeleteSessionRequest, opts ...grpc.CallOption) (*pb.DeleteSessionResponse, error) {
	args := m.Called(ctx, in, opts)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*pb.DeleteSessionResponse), args.Error(1)
}

func (m *MockSfuServiceClient) ListenEvents(ctx context.Context, in *pb.ListenRequest, opts ...grpc.CallOption) (pb.SfuService_ListenEventsClient, error) {
	args := m.Called(ctx, in, opts)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(pb.SfuService_ListenEventsClient), args.Error(1)
}

func TestClient_CircuitBreaker(t *testing.T) {
	// Setup
	st := gobreaker.Settings{
		Name:        "rust-sfu-test",
		MaxRequests: 1, // Fail after 1 request for testing
		Interval:    1 * time.Minute,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 1
		},
	}

	cb := gobreaker.NewCircuitBreaker(st)
	mockSfuService := new(MockSfuServiceClient)
	sfuClient := &Client{
		client: mockSfuService,
		cb:     cb,
	}

	ctx := context.Background()
	roomID := "room-1"
	req := &pb.CreateSessionRequest{UserId: "u1", RoomId: roomID}

	// 1. Successful request
	mockSfuService.On("CreateSession", mock.Anything, req, mock.Anything).Return(&pb.CreateSessionResponse{}, nil).Once()
	_, err := sfuClient.CreateSession(ctx, "u1", roomID)
	assert.NoError(t, err)

	// 2. Error request (Circuit Breaker records failure)
	mockSfuService.On("CreateSession", mock.Anything, req, mock.Anything).Return(&pb.CreateSessionResponse{}, errors.New("rpc error")).Once()
	_, err = sfuClient.CreateSession(ctx, "u1", roomID)
	assert.Error(t, err)

	// 3. Open State (fail fast)
	// We need 1 more failure to trip it (MaxRequests=2 in config above for test might differ, but default is often 1 or we set it)
	// Actually we used NewCircuitBreaker settings: MaxRequests: 1
	// So 1 failure should trip it.
	_, err = sfuClient.CreateSession(ctx, "u1", roomID)
	assert.Error(t, err)
	stErr, ok := status.FromError(err)
	assert.True(t, ok)
	assert.Contains(t, err.Error(), "circuit breaker open")
	assert.Equal(t, codes.Unavailable, stErr.Code())
	assert.Equal(t, "circuit breaker open", stErr.Message())

	mockSfuService.AssertExpectations(t)
}
