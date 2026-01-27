package room

import (
	"context"
	"fmt"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"google.golang.org/protobuf/proto"
)

// BenchMockClient simulates real client costs: SendProto marshals (expensive), SendRaw sends bytes (cheap)
type BenchMockClient struct {
	*MockClient
}

func (m *BenchMockClient) SendProto(msg *pb.WebSocketMessage) {
	// Simulate Real Client: Marshal first
	bytes, _ := proto.Marshal(msg)
	m.SendRaw(bytes)
}

func (m *BenchMockClient) SendRaw(data []byte) {
	// Simulate Real Client: Just send bytes (cheap)
	// We just touch the data to prevent compiler optimizations
	_ = len(data)
}

func NewBenchMockClient(id string, name string, role types.RoleType) *BenchMockClient {
	return &BenchMockClient{
		MockClient: NewMockClient(id, name, role),
	}
}

func BenchmarkBroadcast(b *testing.B) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(ctx, "bench-room", nil, mockBus, nil)

	// Create 1000 clients
	numClients := 1000
	for i := range numClients {
		client := NewBenchMockClient(fmt.Sprintf("user-%d", i), "User", types.RoleTypeParticipant)
		r.AddParticipant(ctx, client)
	}

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: &pb.ChatEvent{
				Id:      "chat-1",
				Content: "Benchmark message content payload that is reasonably sized to simulate real traffic",
			},
		},
	}

	b.ReportAllocs()

	for b.Loop() {
		r.Broadcast(msg)
	}
}

func BenchmarkBroadcastRoomState(b *testing.B) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(ctx, "bench-room", nil, mockBus, nil)

	// Create 1000 clients
	numClients := 1000
	for i := range numClients {
		client := NewBenchMockClient(fmt.Sprintf("user-%d", i), fmt.Sprintf("User %d", i), types.RoleTypeParticipant)
		r.AddParticipant(ctx, client)
	}

	b.ReportAllocs()

	for b.Loop() {
		r.BroadcastRoomState(ctx)
	}
}

func BenchmarkHandleClientDisconnect(b *testing.B) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(ctx, "bench-room", nil, mockBus, nil)

	// Create 10000 clients
	numClients := 10000
	for i := 0; i < numClients; i++ {
		client := NewBenchMockClient(fmt.Sprintf("user-%d", i), "User", types.RoleTypeParticipant)
		r.AddParticipant(ctx, client)
	}

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		b.StopTimer()
		c := NewBenchMockClient("transient", "Transient", types.RoleTypeParticipant)
		r.AddParticipant(ctx, c)
		b.StartTimer()
		r.HandleClientDisconnect(c)
	}
}
