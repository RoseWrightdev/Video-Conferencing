package transport

import (
	"context"
	"sync"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
)

// MockBusService implements types.BusService
type MockBusService struct {
	publishCalls   int
	subscribeCalls int
	failPublish    bool
	mu             sync.Mutex
}

func (m *MockBusService) Publish(_ context.Context, _ string, _ string, _ any, _ string, _ []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.publishCalls++
	if m.failPublish {
		return context.DeadlineExceeded
	}
	return nil
}

func (m *MockBusService) PublishDirect(_ context.Context, _ string, _ string, _ any, _ string) error {
	return nil
}

func (m *MockBusService) Subscribe(_ context.Context, _ string, _ *sync.WaitGroup, _ func(bus.PubSubPayload)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.subscribeCalls++
}

func (m *MockBusService) Close() error {
	return nil
}

func (m *MockBusService) SetAdd(_ context.Context, _ string, _ string) error {
	return nil
}

func (m *MockBusService) SetRem(_ context.Context, _ string, _ string) error {
	return nil
}

func (m *MockBusService) SetMembers(_ context.Context, _ string) ([]string, error) {
	return nil, nil
}

// MockSFUProvider implements types.SFUProvider
type MockSFUProvider struct{}

func (m *MockSFUProvider) CreateSession(_ context.Context, _ string, _ string) (*pb.CreateSessionResponse, error) {
	return &pb.CreateSessionResponse{SdpOffer: "mock-offer"}, nil
}

func (m *MockSFUProvider) HandleSignal(_ context.Context, _ string, _ string, _ *pb.SignalRequest) (*pb.SignalResponse, error) {
	return &pb.SignalResponse{Success: true}, nil
}

func (m *MockSFUProvider) DeleteSession(_ context.Context, _ string, _ string) error {
	return nil
}

func (m *MockSFUProvider) ListenEvents(_ context.Context, _ string, _ string) (pb.SfuService_ListenEventsClient, error) {
	return nil, nil
}

// MockConnection implements wsConnection
type MockConnection struct {
	ReadMessageFunc  func() (int, []byte, error)
	WriteMessageFunc func(int, []byte) error
	CloseFunc        func() error
}

func (m *MockConnection) ReadMessage() (int, []byte, error) {
	if m.ReadMessageFunc != nil {
		return m.ReadMessageFunc()
	}
	return 0, nil, nil
}

func (m *MockConnection) WriteMessage(messageType int, data []byte) error {
	if m.WriteMessageFunc != nil {
		return m.WriteMessageFunc(messageType, data)
	}
	return nil
}

func (m *MockConnection) Close() error {
	if m.CloseFunc != nil {
		return m.CloseFunc()
	}
	return nil
}

func (m *MockConnection) SetWriteDeadline(_ time.Time) error {
	return nil
}
