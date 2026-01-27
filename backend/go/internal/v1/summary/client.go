// Package summary provides a client for the Summary Service.
package summary

import (
	"context"
	"crypto/tls"
	"fmt"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/summary_service/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

// Client wraps the gRPC client for the Summary Service
type Client struct {
	client pb.SummaryServiceClient
	conn   *grpc.ClientConn
}

// NewClient creates a new client connection to the Summary Service
func NewClient(addr string) (*Client, error) {
	// 1. Dial the service
	// Fix Insecure gRPC - Enforce TLS 1.2+ and verify certs
	tlsConfig := &tls.Config{
		MinVersion: tls.VersionTLS12,
	}
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)))
	if err != nil {
		return nil, fmt.Errorf("failed to dial summary service: %w", err)
	}

	// 2. Create the protobuf client
	client := pb.NewSummaryServiceClient(conn)

	return &Client{
		client: client,
		conn:   conn,
	}, nil
}

// Close closes the underlying connection
func (c *Client) Close() error {
	return c.conn.Close()
}

// Summarize requests a summary for the given room ID
func (c *Client) Summarize(ctx context.Context, roomID string) (*pb.SummaryResponse, error) {
	req := &pb.SummaryRequest{
		RoomId: roomID,
	}

	// Set a reasonable timeout for the LLM operation
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	return c.client.Summarize(ctx, req)
}
