package room

import (
	"context"
	"fmt"
	"sync"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/bus"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
	"google.golang.org/grpc"
)

// MockClient implements ClientInterface for testing
type MockClient struct {
	ID              types.ClientIdType
	DisplayName     types.DisplayNameType
	Role            types.RoleType
	IsAudioEnabled  bool
	IsVideoEnabled  bool
	IsScreenSharing bool
	IsHandRaised    bool
	SentMessages    []*pb.WebSocketMessage
	PrioritySent    []*pb.WebSocketMessage
	isDisconnected  bool
	sendChan        chan *pb.WebSocketMessage
	mu              sync.Mutex
}

func (m *MockClient) GetID() types.ClientIdType             { return m.ID }
func (m *MockClient) GetDisplayName() types.DisplayNameType { return m.DisplayName }
func (m *MockClient) GetRole() types.RoleType               { return m.Role }
func (m *MockClient) SetRole(role types.RoleType)           { m.Role = role }
func (m *MockClient) SendProto(msg *pb.WebSocketMessage) {
	m.SentMessages = append(m.SentMessages, msg)
	if m.sendChan != nil {
		select {
		case m.sendChan <- msg:
		default:
		}
	}
}
func (m *MockClient) GetIsAudioEnabled() bool { return m.IsAudioEnabled }
func (m *MockClient) SetIsAudioEnabled(enabled bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsAudioEnabled = enabled
}
func (m *MockClient) GetIsVideoEnabled() bool { return m.IsVideoEnabled }
func (m *MockClient) SetIsVideoEnabled(enabled bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsVideoEnabled = enabled
}
func (m *MockClient) GetIsScreenSharing() bool { return m.IsScreenSharing }
func (m *MockClient) SetIsScreenSharing(enabled bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsScreenSharing = enabled
}
func (m *MockClient) GetIsHandRaised() bool { return m.IsHandRaised }
func (m *MockClient) SetIsHandRaised(enabled bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsHandRaised = enabled
}
func (m *MockClient) Disconnect() { m.isDisconnected = true }

func NewMockClient(id string, name string, role types.RoleType) *MockClient {
	return &MockClient{
		ID:          types.ClientIdType(id),
		DisplayName: types.DisplayNameType(name),
		Role:        role,
		sendChan:    make(chan *pb.WebSocketMessage, 100),
	}
}

func newMockClient(id string, name string, role types.RoleType) *MockClient {
	return NewMockClient(id, name, role)
}

// MockBusService is a mock implementation of BusService for testing
type MockBusService struct {
	mu             sync.Mutex
	setAddCalls    []string
	setRemCalls    []string
	publishCalls   int
	subscribeCalls int
	failPublish    bool
	failSetAdd     bool
	failSetRem     bool
}

func (m *MockBusService) SetAdd(ctx context.Context, key string, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failSetAdd {
		return assert.AnError
	}
	m.setAddCalls = append(m.setAddCalls, key+":"+value)
	return nil
}

func (m *MockBusService) SetRem(ctx context.Context, key string, value string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failSetRem {
		return assert.AnError
	}
	m.setRemCalls = append(m.setRemCalls, key+":"+value)
	return nil
}

func (m *MockBusService) SetMembers(ctx context.Context, key string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return []string{}, nil
}

func (m *MockBusService) Publish(ctx context.Context, roomID string, event string, payload any, senderID string, roles []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failPublish {
		return assert.AnError
	}
	m.publishCalls++
	return nil
}

func (m *MockBusService) PublishDirect(ctx context.Context, targetUserId string, event string, payload any, senderID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return nil
}

func (m *MockBusService) Subscribe(ctx context.Context, roomID string, handler func(bus.PubSubPayload)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.subscribeCalls++
}

func (m *MockBusService) Close() error {
	return nil
}

// MockSFUProvider implements SFUProvider for testing
type MockSFUProvider struct {
	mu                  sync.Mutex
	CreateSessionCalled bool
	HandleSignalCalled  bool
	DeleteSessionCalled bool
	ListenEventsCalled  bool
	FailDeleteSession   bool

	// Matching newer test usage
	deleteCalled bool
	failDelete   bool
}

func (m *MockSFUProvider) CreateSession(ctx context.Context, uid string, roomID string) (*pb.CreateSessionResponse, error) {
	m.CreateSessionCalled = true
	return &pb.CreateSessionResponse{SdpOffer: "v=0\r\ntest-offer"}, nil
}

func (m *MockSFUProvider) HandleSignal(ctx context.Context, uid string, roomID string, signal *pb.SignalRequest) (*pb.SignalResponse, error) {
	m.HandleSignalCalled = true
	return &pb.SignalResponse{Success: true}, nil
}

func (m *MockSFUProvider) DeleteSession(ctx context.Context, uid string, roomID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.DeleteSessionCalled = true
	m.deleteCalled = true
	if m.FailDeleteSession || m.failDelete {
		return fmt.Errorf("mock delete session error")
	}
	return nil
}

func (m *MockSFUProvider) ListenEvents(ctx context.Context, uid string, roomID string) (pb.SfuService_ListenEventsClient, error) {
	m.ListenEventsCalled = true
	return &MockListenEventsClient{
		RecvFunc: func() (*pb.SfuEvent, error) {
			return nil, fmt.Errorf("EOF")
		},
	}, nil
}

// MockListenEventsClient mocks the gRPC stream
type MockListenEventsClient struct {
	grpc.ClientStream
	RecvFunc func() (*pb.SfuEvent, error)
}

func (m *MockListenEventsClient) Recv() (*pb.SfuEvent, error) {
	if m.RecvFunc != nil {
		return m.RecvFunc()
	}
	return nil, nil
}
