// Package streamprocessor provides the client for the Python Stream Processor service.
package streamprocessor

import (
	"context"
	"fmt"

	"crypto/tls"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/stream_processor/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

// Client wraps the gRPC client for the Stream Processor (Captioning Service)
type Client struct {
	client pb.CaptioningServiceClient
	conn   *grpc.ClientConn
}

// NewClient creates a new client connection to the Stream Processor
func NewClient(addr string) (*Client, error) {
	// 1. Dial the service
	// Fix Insecure gRPC - Enforce TLS 1.2+ and verify certs
	tlsConfig := &tls.Config{
		MinVersion: tls.VersionTLS12,
	}
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)))
	if err != nil {
		return nil, fmt.Errorf("failed to dial stream processor: %w", err)
	}

	// 2. Create the protobuf client
	client := pb.NewCaptioningServiceClient(conn)

	return &Client{
		client: client,
		conn:   conn,
	}, nil
}

// Close closes the underlying connection
func (c *Client) Close() error {
	return c.conn.Close()
}

// StreamAudio initiates the bidirectional audio stream
// The caller is responsible for sending chunks and receiving events via the returned stream
func (c *Client) StreamAudio(ctx context.Context) (pb.CaptioningService_StreamAudioClient, error) {
	return c.client.StreamAudio(ctx)
}
