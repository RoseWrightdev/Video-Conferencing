package signaling

import (
	"context"
	"testing"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

func TestCreateSFUSession_Success(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	err := CreateSFUSession(ctx, room, client, mockSFU, nil)
	assert.NoError(t, err)

	// Verify SFU methods were called correctly
	assert.Equal(t, 1, mockSFU.GetCreateSessionCalls())
	assert.Equal(t, 1, mockSFU.GetListenEventsCalls())
}

func TestCreateSFUSession_NoSFU(t *testing.T) {
	ctx := context.Background()

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	err := CreateSFUSession(ctx, room, client, nil, nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "SFU client not initialized")
}

func TestCreateSFUSession_CreateFails(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockSFU.SetShouldFailCreate(true)

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	err := CreateSFUSession(ctx, room, client, mockSFU, nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "mock create session error")
}

func TestCreateSFUSession_ListenEventsFails(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()
	mockSFU.SetShouldFailListen(true)

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	err := CreateSFUSession(ctx, room, client, mockSFU, nil)
	// Should still succeed even if listen fails
	assert.NoError(t, err)
}

func TestCreateSFUSession_TrackAddedEvent(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()

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

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	err := CreateSFUSession(ctx, room, client, mockSFU, nil)
	assert.NoError(t, err)

	// Verify SFU was called and event stream was set up
	assert.Equal(t, 1, mockSFU.GetCreateSessionCalls())
	assert.Equal(t, 1, mockSFU.GetListenEventsCalls())
}

func TestCreateSFUSession_RenegotiationEvent(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()

	// Add a renegotiation event
	mockSFU.AddMockEvent(&pb.SfuEvent{
		Payload: &pb.SfuEvent_RenegotiateSdpOffer{
			RenegotiateSdpOffer: "v=0\r\no=- 456 456 IN IP4 0.0.0.0\r\n",
		},
	})

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	err := CreateSFUSession(ctx, room, client, mockSFU, nil)
	assert.NoError(t, err)

	// Wait for event processing
	time.Sleep(200 * time.Millisecond)

	// Verify renegotiation offer was forwarded
	assert.GreaterOrEqual(t, len(client.SentMessages), 2)
}

func TestCreateSFUSession_SdpAnswerEvent(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()

	// Add an SDP answer event
	mockSFU.AddMockEvent(&pb.SfuEvent{
		Payload: &pb.SfuEvent_SdpAnswer{
			SdpAnswer: "v=0\r\na=answer\r\n",
		},
	})

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	err := CreateSFUSession(ctx, room, client, mockSFU, nil)
	assert.NoError(t, err)

	// Wait for event processing
	time.Sleep(200 * time.Millisecond)

	// Verify answer was forwarded
	assert.GreaterOrEqual(t, len(client.SentMessages), 2)
}

func TestCreateSFUSession_IceCandidateEvent(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()

	// Add an ICE candidate event
	mockSFU.AddMockEvent(&pb.SfuEvent{
		Payload: &pb.SfuEvent_IceCandidate{
			IceCandidate: "candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host",
		},
	})

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	err := CreateSFUSession(ctx, room, client, mockSFU, nil)
	assert.NoError(t, err)

	// Wait for event processing
	time.Sleep(200 * time.Millisecond)

	// Verify ICE candidate was forwarded
	assert.GreaterOrEqual(t, len(client.SentMessages), 2)
}

func TestHandleSFUSignal_SdpAnswer(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	signal := &pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpAnswer{
			SdpAnswer: "v=0\r\na=answer\r\n",
		},
	}

	HandleSFUSignal(ctx, room, client, mockSFU, signal)

	// Verify signal was forwarded to SFU
	assert.Equal(t, 1, mockSFU.GetHandleSignalCalls())
}

func TestHandleSFUSignal_IceCandidate(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	signal := &pb.SignalRequest{
		Signal: &pb.SignalRequest_IceCandidate{
			IceCandidate: "candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host",
		},
	}

	HandleSFUSignal(ctx, room, client, mockSFU, signal)

	// Verify signal was forwarded to SFU
	assert.Equal(t, 1, mockSFU.GetHandleSignalCalls())
}

func TestHandleSFUSignal_SdpOffer(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	signal := &pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpOffer{
			SdpOffer: "v=0\r\no=- 123 123 IN IP4 0.0.0.0\r\n",
		},
	}

	HandleSFUSignal(ctx, room, client, mockSFU, signal)

	// Verify signal was forwarded to SFU
	assert.Equal(t, 1, mockSFU.GetHandleSignalCalls())
}

func TestHandleSFUSignal_NoSFU(_ *testing.T) {
	ctx := context.Background()

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeHost)

	signal := &pb.SignalRequest{
		Signal: &pb.SignalRequest_SdpAnswer{
			SdpAnswer: "v=0\r\na=answer\r\n",
		},
	}

	// Should not panic
	HandleSFUSignal(ctx, room, client, nil, signal)
}

func TestCreateSFUSession_CaptionBroadcast(t *testing.T) {
	ctx := context.Background()
	mockSFU := NewMockSFUClient()

	// Add a caption event
	mockSFU.AddMockEvent(&pb.SfuEvent{
		Payload: &pb.SfuEvent_Caption{
			Caption: &pb.CaptionEvent{
				SessionId:  "session1",
				Text:       "Hello World",
				IsFinal:    true,
				Confidence: 0.99,
			},
		},
	})

	room := &MockRoom{ID: "test-room"}
	client := NewMockClient("user1", "Test User", types.RoleTypeParticipant)

	err := CreateSFUSession(ctx, room, client, mockSFU, nil)
	assert.NoError(t, err)

	// Wait for event processing
	time.Sleep(200 * time.Millisecond)

	// Verify Broadcast was called on the room
	room.mu.Lock()
	broadcastCount := len(room.BroadcastCalls)
	lastBroadcast := room.BroadcastCalls[0]
	room.mu.Unlock()

	assert.Equal(t, 1, broadcastCount, "Should have broadcasted 1 message")
	assert.NotNil(t, lastBroadcast.GetCaption(), "Broadcast message should be a Caption")
	assert.Equal(t, "Hello World", lastBroadcast.GetCaption().Text)

	// Verify the loop did NOT send it directly to the client (MockRoom.Broadcast just captures, doesn't forward)
	// So client.SentMessages usually has JoinResponse(1) + SdpOffer(2). If it sent caption directly, it would be 3.
	// But since it calls Broadcast, the loop sends nothing more.
	client.mu.Lock()
	msgCount := len(client.SentMessages)
	client.mu.Unlock()
	assert.Equal(t, 2, msgCount, "Client should only receive initial handshake messages directly")
}
