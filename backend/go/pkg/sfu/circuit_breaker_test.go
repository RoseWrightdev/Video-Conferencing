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

func TestSFUClient_CircuitBreaker(t *testing.T) {
	// Setup
	mockClient := new(MockSfuServiceClient)
	st := gobreaker.Settings{
		Name:        "rust-sfu-test",
		MaxRequests: 1, // Fail after 1 request for testing
		Interval:    1 * time.Minute,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 1
		},
	}

	sfuClient := &SFUClient{
		client: mockClient,
		cb:     gobreaker.NewCircuitBreaker(st),
	}

	ctx := context.Background()
	req := &pb.CreateSessionRequest{UserId: "u1", RoomId: "r1"}

	// 1. Successful request
	mockClient.On("CreateSession", mock.Anything, req, mock.Anything).Return(&pb.CreateSessionResponse{}, nil).Once()
	_, err := sfuClient.CreateSession(ctx, "u1", "r1")
	assert.NoError(t, err)

	// 2. Failed request (Trips the breaker)
	mockClient.On("CreateSession", mock.Anything, req, mock.Anything).Return(nil, errors.New("rpc failed")).Once()
	_, err = sfuClient.CreateSession(ctx, "u1", "r1")
	assert.Error(t, err)

	// 3. Circuit Open (Fast failure) - Should NOT call mock
	_, err = sfuClient.CreateSession(ctx, "u1", "r1")
	assert.Error(t, err)
	stErr, ok := status.FromError(err)
	assert.True(t, ok)
	assert.Equal(t, codes.Unavailable, stErr.Code())
	assert.Equal(t, "circuit breaker open", stErr.Message())

	mockClient.AssertExpectations(t)
}
