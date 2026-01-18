// Package signaling provides signaling logic for the SFU.
package signaling

import (
	"context"
	"fmt"
	"sync"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"
)

// MockRoom implements types.Roomer for testing signaling logic
type MockRoom struct {
	ID types.RoomIDType
}

func (m *MockRoom) GetID() types.RoomIDType {
	return m.ID
}

func (m *MockRoom) BuildRoomStateProto(_ context.Context) *pb.RoomStateEvent {
	return &pb.RoomStateEvent{}
}

func (m *MockRoom) Router(_ context.Context, _ types.ClientInterface, _ *pb.WebSocketMessage) {
}
func (m *MockRoom) HandleClientDisconnect(_ types.ClientInterface) {}
func (m *MockRoom) CreateSFUSession(_ context.Context, _ types.ClientInterface) error {
	return nil
}
func (m *MockRoom) HandleSFUSignal(_ context.Context, _ types.ClientInterface, _ *pb.SignalRequest) {
}

// MockClient implements types.ClientInterface for testing signaling logic
type MockClient struct {
	ID              types.ClientIDType
	DisplayName     types.DisplayNameType
	Role            types.RoleType
	IsAudioEnabled  bool
	IsVideoEnabled  bool
	IsScreenSharing bool
	IsHandRaised    bool
	SentMessages    []*pb.WebSocketMessage
	mu              sync.Mutex
}

func (m *MockClient) GetID() types.ClientIDType             { return m.ID }
func (m *MockClient) GetDisplayName() types.DisplayNameType { return m.DisplayName }
func (m *MockClient) GetRole() types.RoleType               { return m.Role }
func (m *MockClient) SetRole(role types.RoleType)           { m.Role = role }
func (m *MockClient) SendProto(msg *pb.WebSocketMessage) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.SentMessages = append(m.SentMessages, msg)
}

func (m *MockClient) SendRaw(data []byte) {
	var msg pb.WebSocketMessage
	if err := proto.Unmarshal(data, &msg); err != nil {
		return
	}
	m.SendProto(&msg)
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
func (m *MockClient) Disconnect() {
}

func NewMockClient(id string, name string, role types.RoleType) *MockClient {
	return &MockClient{
		ID:          types.ClientIDType(id),
		DisplayName: types.DisplayNameType(name),
		Role:        role,
	}
}

// MockSFUClient is a mock implementation of SFUProvider
type MockSFUClient struct {
	mu                 sync.Mutex
	createSessionCalls int
	handleSignalCalls  int
	deleteSessionCalls int
	listenEventsCalls  int
	shouldFailCreate   bool
	shouldFailListen   bool
	CreateSessionFunc  func(uid string, roomID string) (*pb.CreateSessionResponse, error)
	mockEvents         chan *pb.SfuEvent
}

func NewMockSFUClient() *MockSFUClient {
	return &MockSFUClient{
		mockEvents: make(chan *pb.SfuEvent, 10),
	}
}

func (m *MockSFUClient) CreateSession(_ context.Context, uid string, roomID string) (*pb.CreateSessionResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.createSessionCalls++

	if m.CreateSessionFunc != nil {
		return m.CreateSessionFunc(uid, roomID)
	}
	if m.shouldFailCreate {
		return nil, fmt.Errorf("mock create session error")
	}
	return &pb.CreateSessionResponse{SdpOffer: "mock-sdp-offer"}, nil
}

func (m *MockSFUClient) HandleSignal(_ context.Context, uid string, roomID string, signal *pb.SignalRequest) (*pb.SignalResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handleSignalCalls++
	return &pb.SignalResponse{Success: true}, nil
}

func (m *MockSFUClient) DeleteSession(ctx context.Context, uid string, roomID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.deleteSessionCalls++
	return nil
}

func (m *MockSFUClient) ListenEvents(ctx context.Context, uid string, roomID string) (pb.SfuService_ListenEventsClient, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.listenEventsCalls++
	if m.shouldFailListen {
		return nil, fmt.Errorf("mock listen events error")
	}
	return &MockListenStream{events: m.mockEvents}, nil
}

func (m *MockSFUClient) AddMockEvent(event *pb.SfuEvent) {
	m.mockEvents <- event
}

func (m *MockSFUClient) GetCreateSessionCalls() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.createSessionCalls
}

func (m *MockSFUClient) GetListenEventsCalls() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.listenEventsCalls
}

func (m *MockSFUClient) GetHandleSignalCalls() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.handleSignalCalls
}

func (m *MockSFUClient) SetShouldFailCreate(fail bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.shouldFailCreate = fail
}

func (m *MockSFUClient) SetShouldFailListen(fail bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.shouldFailListen = fail
}

// MockListenStream implements pb.SfuService_ListenEventsClient
type MockListenStream struct {
	grpc.ClientStream
	events chan *pb.SfuEvent
}

func (m *MockListenStream) Recv() (*pb.SfuEvent, error) {
	select {
	case event := <-m.events:
		return event, nil
	case <-time.After(1 * time.Second):
		return nil, fmt.Errorf("timeout")
	}
}
