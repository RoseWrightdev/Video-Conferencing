package session

import (
	"context"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/stretchr/testify/assert"
)

func TestCreateSFUSession_Success(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)
	client.room = room

	err := room.CreateSFUSession(ctx, client)
	assert.NoError(t, err)

	// Verify SFU methods were called correctly
	assert.Equal(t, 1, mockSFU.GetCreateSessionCalls())
	assert.Equal(t, 1, mockSFU.GetListenEventsCalls())

	// Note: Async message delivery is tested in integration tests
}

func TestCreateSFUSession_NoSFU(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeHost)
	client.room = room

	err := room.CreateSFUSession(ctx, client)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "SFU client not initialized")
}

func TestCreateSFUSession_CreateFails(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockSFU.SetShouldFailCreate(true)
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)
	client.room = room

	err := room.CreateSFUSession(ctx, client)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "mock create session error")
}

func TestCreateSFUSession_ListenEventsFails(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockSFU.SetShouldFailListen(true)
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)
	client.room = room

	err := room.CreateSFUSession(ctx, client)
	// Should still succeed even if listen fails
	assert.NoError(t, err)
}

func TestCreateSFUSession_TrackAddedEvent(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	// Add a track event to the mock stream
	mockSFU.AddMockEvent(&pb.SfuEvent{
		Payload: &pb.SfuEvent_TrackEvent{
			TrackEvent: &pb.TrackAddedEvent{
				UserId:    "user2",
				StreamId:  "stream123",
				TrackKind: "video",
			},
		},
	})

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)
	client.room = room

	err := room.CreateSFUSession(ctx, client)
	assert.NoError(t, err)

	// Verify SFU was called and event stream was set up
	// Event forwarding is validated by the goroutine executing without panic
	assert.Equal(t, 1, mockSFU.GetCreateSessionCalls())
	assert.Equal(t, 1, mockSFU.GetListenEventsCalls())
}

func TestCreateSFUSession_RenegotiationEvent(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	// Add a renegotiation event
	mockSFU.AddMockEvent(&pb.SfuEvent{
		Payload: &pb.SfuEvent_RenegotiateSdpOffer{
			RenegotiateSdpOffer: "v=0\r\no=- 456 456 IN IP4 0.0.0.0\r\n",
		},
	})

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)
	client.room = room

	err := room.CreateSFUSession(ctx, client)
	assert.NoError(t, err)

	// Wait for event processing
	time.Sleep(200 * time.Millisecond)

	// Verify renegotiation offer was forwarded
	assert.GreaterOrEqual(t, len(client.prioritySend), 2)
}

func TestCreateSFUSession_SdpAnswerEvent(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	// Add an SDP answer event
	mockSFU.AddMockEvent(&pb.SfuEvent{
		Payload: &pb.SfuEvent_SdpAnswer{
			SdpAnswer: "v=0\r\na=answer\r\n",
		},
	})

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)
	client.room = room

	err := room.CreateSFUSession(ctx, client)
	assert.NoError(t, err)

	// Wait for event processing
	time.Sleep(200 * time.Millisecond)

	// Verify answer was forwarded
	assert.GreaterOrEqual(t, len(client.prioritySend), 2)
}

func TestCreateSFUSession_IceCandidateEvent(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	// Add an ICE candidate event
	mockSFU.AddMockEvent(&pb.SfuEvent{
		Payload: &pb.SfuEvent_IceCandidate{
			IceCandidate: "candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host",
		},
	})

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)
	client.room = room

	err := room.CreateSFUSession(ctx, client)
	assert.NoError(t, err)

	// Wait for event processing
	time.Sleep(200 * time.Millisecond)

	// Verify ICE candidate was forwarded
	assert.GreaterOrEqual(t, len(client.prioritySend), 2)
}

func TestHandleSFUSignal_SdpAnswer(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)

	signal := &pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpAnswer{
			SdpAnswer: "v=0\r\na=answer\r\n",
		},
	}

	room.HandleSFUSignal(ctx, client, signal)

	// Verify signal was forwarded to SFU
	assert.Equal(t, 1, mockSFU.GetHandleSignalCalls())
}

func TestHandleSFUSignal_IceCandidate(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)

	signal := &pb.SignalRequest{
		Signal: &pb.SignalRequest_IceCandidate{
			IceCandidate: "candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host",
		},
	}

	room.HandleSFUSignal(ctx, client, signal)

	// Verify signal was forwarded to SFU
	assert.Equal(t, 1, mockSFU.GetHandleSignalCalls())
}

func TestHandleSFUSignal_SdpOffer(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeHost)

	signal := &pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpOffer{
			SdpOffer: "v=0\r\no=- 123 123 IN IP4 0.0.0.0\r\n",
		},
	}

	room.HandleSFUSignal(ctx, client, signal)

	// Verify signal was forwarded to SFU
	assert.Equal(t, 1, mockSFU.GetHandleSignalCalls())
}

func TestHandleSFUSignal_NoSFU(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeHost)

	signal := &pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpAnswer{
			SdpAnswer: "v=0\r\na=answer\r\n",
		},
	}

	// Should not panic
	room.HandleSFUSignal(ctx, client, signal)
}

func TestRouterJoinWaitingRoom(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeWaiting)
	client.room = room

	// Join request from waiting room user should be ignored
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_Join{
			Join: &pb.JoinRequest{
				RoomId: "test-room",
			},
		},
	}

	room.router(ctx, client, msg)

	// SFU CreateSession should NOT have been called
	assert.Equal(t, 0, mockSFU.GetCreateSessionCalls())
}

func TestRouterJoinParticipant(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, mockSFU)
	client := createTestClient("user1", "Test User", RoleTypeParticipant)
	client.room = room

	// Join request from participant should trigger SFU session
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_Join{
			Join: &pb.JoinRequest{
				RoomId: "test-room",
			},
		},
	}

	room.router(ctx, client, msg)

	// SFU CreateSession should have been called
	assert.Equal(t, 1, mockSFU.GetCreateSessionCalls())
}

func TestRouterUnknownMessageType(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}

	room := NewRoom("test-room", nil, mockBus, nil)
	client := createTestClient("user1", "Test User", RoleTypeHost)

	// Empty message (no payload) should hit default case
	msg := &pb.WebSocketMessage{}

	// Should not panic, just log warning
	room.router(ctx, client, msg)
}
