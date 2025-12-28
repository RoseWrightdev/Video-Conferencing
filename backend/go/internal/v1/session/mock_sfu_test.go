package session

import (
	"context"
	"errors"
	"sync"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"google.golang.org/grpc/metadata"
)

// MockSFUClient implements the SFU client interface for testing
type MockSFUClient struct {
	mu                 sync.Mutex
	createSessionCalls int
	handleSignalCalls  int
	deleteSessionCalls int
	listenEventsCalls  int
	shouldFailCreate   bool
	shouldFailSignal   bool
	shouldFailDelete   bool
	shouldFailListen   bool
	mockOffer          string
	mockEvents         []*pb.SfuEvent
	mockEventStream    *MockEventStream
}

// MockEventStream implements pb.SfuService_ListenEventsClient
type MockEventStream struct {
	mu         sync.Mutex
	events     []*pb.SfuEvent
	eventIndex int
	closed     bool
}

func (m *MockEventStream) Recv() (*pb.SfuEvent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed {
		return nil, errors.New("stream closed")
	}

	if m.eventIndex >= len(m.events) {
		// Simulate blocking until closed
		m.closed = true
		return nil, errors.New("EOF")
	}

	event := m.events[m.eventIndex]
	m.eventIndex++
	return event, nil
}

func (m *MockEventStream) Header() (metadata.MD, error) { return nil, nil }
func (m *MockEventStream) Trailer() metadata.MD         { return nil }
func (m *MockEventStream) CloseSend() error             { return nil }
func (m *MockEventStream) Context() context.Context     { return context.Background() }
func (m *MockEventStream) SendMsg(interface{}) error    { return nil }
func (m *MockEventStream) RecvMsg(interface{}) error    { return nil }

func NewMockSFUClient() *MockSFUClient {
	return &MockSFUClient{
		mockOffer: "v=0\r\no=- 123 123 IN IP4 0.0.0.0\r\n",
		mockEventStream: &MockEventStream{
			events: []*pb.SfuEvent{},
		},
	}
}

func (m *MockSFUClient) CreateSession(ctx context.Context, uid string, roomID string) (*pb.CreateSessionResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.createSessionCalls++

	if m.shouldFailCreate {
		return nil, errors.New("mock create session error")
	}

	return &pb.CreateSessionResponse{
		SdpOffer: m.mockOffer,
	}, nil
}

func (m *MockSFUClient) HandleSignal(ctx context.Context, uid string, roomID string, signal *pb.SignalRequest) (*pb.SignalResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.handleSignalCalls++

	if m.shouldFailSignal {
		return nil, errors.New("mock handle signal error")
	}

	return &pb.SignalResponse{}, nil
}

func (m *MockSFUClient) DeleteSession(ctx context.Context, uid string, roomID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.deleteSessionCalls++

	if m.shouldFailDelete {
		return errors.New("mock delete session error")
	}

	return nil
}

func (m *MockSFUClient) ListenEvents(ctx context.Context, uid string, roomID string) (pb.SfuService_ListenEventsClient, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.listenEventsCalls++

	if m.shouldFailListen {
		return nil, errors.New("mock listen events error")
	}

	return m.mockEventStream, nil
}

// Test helper methods
func (m *MockSFUClient) SetShouldFailCreate(shouldFail bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.shouldFailCreate = shouldFail
}

func (m *MockSFUClient) SetShouldFailListen(shouldFail bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.shouldFailListen = shouldFail
}

func (m *MockSFUClient) AddMockEvent(event *pb.SfuEvent) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.mockEventStream.events = append(m.mockEventStream.events, event)
}

func (m *MockSFUClient) GetCreateSessionCalls() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.createSessionCalls
}

func (m *MockSFUClient) GetHandleSignalCalls() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.handleSignalCalls
}

func (m *MockSFUClient) GetDeleteSessionCalls() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.deleteSessionCalls
}

func (m *MockSFUClient) GetListenEventsCalls() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.listenEventsCalls
}
