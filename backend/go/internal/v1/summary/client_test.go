package summary

import (
	"context"
	"net"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/summary_service/proto"
	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc"
)

// Mock Client
type mockSummaryServiceClient struct {
	summarizeFunc func(ctx context.Context, in *pb.SummaryRequest, opts ...grpc.CallOption) (*pb.SummaryResponse, error)
}

func (m *mockSummaryServiceClient) Summarize(ctx context.Context, in *pb.SummaryRequest, opts ...grpc.CallOption) (*pb.SummaryResponse, error) {
	if m.summarizeFunc != nil {
		return m.summarizeFunc(ctx, in, opts...)
	}
	return nil, nil
}

func TestSummarize_Delegates(t *testing.T) {
	called := false
	mock := &mockSummaryServiceClient{
		summarizeFunc: func(_ context.Context, in *pb.SummaryRequest, _ ...grpc.CallOption) (*pb.SummaryResponse, error) {
			assert.Equal(t, "room-1", in.RoomId)
			called = true
			return &pb.SummaryResponse{Summary: "test summary"}, nil
		},
	}

	client := &Client{
		client: mock,
	}

	resp, err := client.Summarize(context.Background(), "room-1")
	assert.NoError(t, err)
	assert.Equal(t, "test summary", resp.Summary)
	assert.True(t, called)
}

func TestNewClient_Connects(t *testing.T) {
	lis, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer func() { _ = lis.Close() }()

	s := grpc.NewServer()
	pb.RegisterSummaryServiceServer(s, &pb.UnimplementedSummaryServiceServer{})

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

func TestNewClient_Error(t *testing.T) {
	_, err := NewClient("")
	if err != nil {
		assert.Error(t, err)
	}
}
