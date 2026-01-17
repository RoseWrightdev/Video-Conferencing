package transport

import (
	"context"
	"fmt"
	"sync"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/auth"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/ratelimit"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/room"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"google.golang.org/protobuf/proto"
)

// --- Mocks ---

type MockClient struct {
	ID          types.ClientIdType
	DisplayName types.DisplayNameType
	Role        types.RoleType
	SendCh      chan *pb.WebSocketMessage
	Closed      bool
}

func NewMockClient(id string) *MockClient {
	return &MockClient{
		ID:          types.ClientIdType(id),
		DisplayName: types.DisplayNameType(id),
		Role:        types.RoleTypeParticipant,
		SendCh:      make(chan *pb.WebSocketMessage, 100), // Buffer to prevent blocking during bench
	}
}

func (m *MockClient) GetID() types.ClientIdType             { return m.ID }
func (m *MockClient) GetDisplayName() types.DisplayNameType { return m.DisplayName }
func (m *MockClient) GetRole() types.RoleType               { return m.Role }
func (m *MockClient) SetRole(r types.RoleType)              { m.Role = r }
func (m *MockClient) GetIsAudioEnabled() bool               { return true }
func (m *MockClient) SetIsAudioEnabled(b bool)              {}
func (m *MockClient) GetIsVideoEnabled() bool               { return true }
func (m *MockClient) SetIsVideoEnabled(b bool)              {}
func (m *MockClient) GetIsScreenSharing() bool              { return false }
func (m *MockClient) SetIsScreenSharing(b bool)             {}
func (m *MockClient) GetIsHandRaised() bool                 { return false }
func (m *MockClient) SetIsHandRaised(b bool)                {}
func (m *MockClient) Disconnect()                           { m.Closed = true }
func (m *MockClient) SendProto(msg *pb.WebSocketMessage) {
	if m.Closed {
		return
	}

	// Simulate realistic serialization cost (Major CPU user in real app)
	if _, err := proto.Marshal(msg); err != nil {
		return
	}

	select {
	case m.SendCh <- msg:
	default:
		// Drop in simple bench if full
	}
}

// SendRaw just pushes bytes (simulating network write)
func (m *MockClient) SendRaw(data []byte) {
	if m.Closed {
		return
	}
	// No marshal cost here, just queuing
	select {
	case m.SendCh <- &pb.WebSocketMessage{}: // Dummy push to keep channel logic same
	default:
	}
}

type MockValidator struct{}

func (m *MockValidator) ValidateToken(token string) (*auth.CustomClaims, error) { return nil, nil }

type MockBus struct{}

func (m *MockBus) Publish(ctx context.Context, roomID string, event string, payload any, senderID string, roles []string) error {
	return nil
}
func (m *MockBus) PublishDirect(ctx context.Context, targetUserId string, event string, payload any, senderID string) error {
	return nil
}
func (m *MockBus) Subscribe(ctx context.Context, roomID string, wg *sync.WaitGroup, handler func(bus.PubSubPayload)) {
}
func (m *MockBus) Close() error                                                 { return nil }
func (m *MockBus) SetAdd(ctx context.Context, key string, value string) error   { return nil }
func (m *MockBus) SetRem(ctx context.Context, key string, value string) error   { return nil }
func (m *MockBus) SetMembers(ctx context.Context, key string) ([]string, error) { return nil, nil }

// --- Benchmarks ---

// 1. Hub Room Access/Creation Benchmark
// Measures overhead of Hub mutex when getting/creating rooms
func BenchmarkHub_GetOrCreateRoom(b *testing.B) {
	limiter, _ := ratelimit.NewRateLimiter(nil, nil)
	hub := NewHub(&MockValidator{}, &MockBus{}, true, limiter)

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			i++
			// Access same room to stress mutex, or different to stress map
			hub.getOrCreateRoom(types.RoomIdType("bench_room"))
		}
	})
}

// 2. Room Connection Benchmark
// Measures how fast we can add users to a room (Lock contention on Room)
func BenchmarkRoom_HandleClientConnect(b *testing.B) {
	r := room.NewRoom(types.RoomIdType("bench_room"), nil, nil, nil)

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			i++
			c := NewMockClient(fmt.Sprintf("user_%d", i))
			r.HandleClientConnect(c)
		}
	})
}

// 3. Broadcast Benchmark
// Measures fan-out speed for 1k, 10k, 100k users
func BenchmarkRoom_Broadcast(b *testing.B) {
	counts := []int{1000, 10000, 100000}

	for _, count := range counts {
		b.Run(fmt.Sprintf("clients=%d", count), func(b *testing.B) {
			r := room.NewRoom(types.RoomIdType("bench_room"), nil, nil, nil)

			// Pre-fill room
			for i := 0; i < count; i++ {
				c := NewMockClient(fmt.Sprintf("user_%d", i))
				// Manually inject to avoid slog noise from HandleClientConnect
				r.AddParticipant(context.Background(), c)
			}

			msg := &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_Chat{
					Chat: &pb.ChatRequest{
						Content: "bench",
					},
				},
			}

			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				r.Broadcast(msg)
			}
		})
	}
}
