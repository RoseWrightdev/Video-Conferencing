package summary

import (
	"context"
	"fmt"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/summary_service/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// SummaryClient wraps the gRPC client for the Summary Service
type SummaryClient struct {
	client pb.SummaryServiceClient
	conn   *grpc.ClientConn
}

// NewSummaryClient creates a new client connection to the Summary Service
func NewSummaryClient(addr string) (*SummaryClient, error) {
	// 1. Dial the service
	// In production, use proper credentials/TLS
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to dial summary service: %w", err)
	}

	// 2. Create the protobuf client
	client := pb.NewSummaryServiceClient(conn)

	return &SummaryClient{
		client: client,
		conn:   conn,
	}, nil
}

// Close closes the underlying connection
func (c *SummaryClient) Close() error {
	return c.conn.Close()
}

// Summarize requests a summary for the given room ID
func (c *SummaryClient) Summarize(ctx context.Context, roomID string) (*pb.SummaryResponse, error) {
	req := &pb.SummaryRequest{
		RoomId: roomID,
	}

	// Set a reasonable timeout for the LLM operation
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	return c.client.Summarize(ctx, req)
}
