package room

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"go.uber.org/goleak"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

func TestMain(m *testing.M) {
	goleak.VerifyTestMain(m)
}

// BlockingBus simulates a Bus that spawns a long-running goroutine on Subscribe,
// mimicking the real Redis adapter's behavior.
type BlockingBus struct {
	*MockBusService
}

func (b *BlockingBus) Subscribe(ctx context.Context, roomID string, wg *sync.WaitGroup, handler func(bus.PubSubPayload)) {
	// Simulate a long-lived background listener
	if wg != nil {
		wg.Add(1)
	}
	go func() {
		defer wg.Done()
		<-ctx.Done()
	}()
}

func TestRoom_Leaks_Subscribe(t *testing.T) {
	// This test IS EXPECTED TO FAIL until we fix the leak

	blockingBus := &BlockingBus{MockBusService: &MockBusService{}}

	// Create a room - this triggers subscribeToRedis which calls BlockingBus.Subscribe
	// passing context.Background()
	r := NewRoom("leak-room", nil, blockingBus, nil)

	// Close the room and wait for cleanup
	if err := r.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown failed: %v", err)
	}

	// Assertions are handled by TestMain's goleak.VerifyNone
	// We just ensure we didn't crash
}

// BlockingSFU simulates an SFU stream that blocks indefinitely
type BlockingSFU struct {
	*MockSFUProvider
}

func (m *BlockingSFU) ListenEvents(ctx context.Context, uid string, roomID string) (pb.SfuService_ListenEventsClient, error) {
	return &MockListenEventsClient{
		RecvFunc: func() (*pb.SfuEvent, error) {
			// Block forever to simulate an open stream
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(1 * time.Hour): // Block effectively forever
				return nil, nil
			}
		},
	}, nil
}

func TestRoom_Leaks_SFUSession(t *testing.T) {
	// This test IS EXPECTED TO FAIL until we fix the leak

	mockBus := &MockBusService{}
	blockingSFU := &BlockingSFU{MockSFUProvider: &MockSFUProvider{}}

	r := NewRoom("sfu-leak-room", nil, mockBus, blockingSFU)
	client := NewMockClient("user1", "User", types.RoleTypeParticipant)

	// This calls CreateSFUSession -> triggers `go func()` that reads from stream
	// Since our stream blocks, the goroutine leaks
	err := r.CreateSFUSession(context.Background(), client)
	if err != nil {
		t.Fatalf("CreateSFUSession failed: %v", err)
	}

	// Disconnect client / Close room
	r.HandleClientDisconnect(client)
	if err := r.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown failed: %v", err)
	}
}
