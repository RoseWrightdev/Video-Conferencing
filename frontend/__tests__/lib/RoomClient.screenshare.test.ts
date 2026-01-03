
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomClient } from '@/lib/RoomClient';
import { WebSocketClient } from '@/lib/websockets';
import { SFUClient } from '@/lib/webrtc';

// Mocks
vi.mock('@/lib/websockets');
vi.mock('@/lib/webrtc');
vi.mock('@/lib/logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }),
}));

describe('RoomClient - Screen Share Stream Management', () => {
    let client: RoomClient;
    let onStateChange: any;
    let onMediaTrackAdded: any;
    let mockWs: any;

    beforeEach(() => {
        onStateChange = vi.fn();
        onMediaTrackAdded = vi.fn();
        client = new RoomClient(onStateChange, onMediaTrackAdded);

        // Inject mock WS
        mockWs = new WebSocketClient('url', 'token');
        client.ws = mockWs;

        // Inject mock SFU
        client.sfu = new SFUClient(mockWs, vi.fn());
    });

    // Helper to simulate joined state
    const simulateJoin = (userId: string) => {
        // Manually set joined state via private method or public property if available?
        // We can simulate handleJoinResponse via handleMessage
        (client as any).handleJoinResponse({ success: true, userId, isHost: false });
    };

    const createMockStream = (id: string, active = true) => ({
        id,
        active,
        getTracks: () => active ? [{ readyState: 'live', kind: 'video' }] : [{ readyState: 'ended', kind: 'video' }],
        getVideoTracks: () => active ? [{ readyState: 'live', kind: 'video' }] : [{ readyState: 'ended', kind: 'video' }],
        getAudioTracks: () => [],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }) as unknown as MediaStream;

    it('should restore camera stream when screen share stops', () => {
        const userId = 'remote-user';
        simulateJoin('local-user');

        // 1. Initial State: Remote User joins with Camera
        const cameraStream = createMockStream('camera-stream');
        (client as any).handleRoomState({
            participants: [{ id: userId, displayName: 'Remote', isVideoEnabled: true }],
        });

        // Camera Track arrives
        (client as any).handleTrackAdded({ userId, streamId: cameraStream.id });
        (client as any).streamToUserMap.set(cameraStream.id, userId); // internal mapping simulation
        (client as any).handleRemoteTrack(cameraStream, { kind: 'video' });

        // Verify participant has camera stream
        let participant = (client as any).participants.get(userId);
        expect(participant.stream.id).toBe('camera-stream');

        // 2. Scenario: Remote User starts Screen Share
        const screenStream = createMockStream('screen-stream');

        // Signaling: isScreenSharing = true
        (client as any).handleMessage({
            screenShareChanged: { userId, isSharing: true }
        }, 'room', 'user', 'token');

        // Screen Track arrives
        (client as any).handleTrackAdded({ userId, streamId: screenStream.id });
        (client as any).streamToUserMap.set(screenStream.id, userId);
        (client as any).handleRemoteTrack(screenStream, { kind: 'video' });

        // Verify participant has screen stream (overwritten camera)
        participant = (client as any).participants.get(userId);
        expect(participant.stream.id).toBe('screen-stream');

        // 3. Scenario: Remote User STOPS Screen Share
        // Screen stream becomes inactive (tracks end)
        (screenStream as any).active = false;
        // (In reality, we won't strictly see .active property change, but track state will be 'ended')

        // Signaling: isScreenSharing = false
        (client as any).handleMessage({
            screenShareChanged: { userId, isSharing: false }
        }, 'room', 'user', 'token');

        // EXPECTATION: Participant stream should revert to Camera Stream
        participant = (client as any).participants.get(userId);

        // Fails with current implementation because camera stream was lost
        expect(participant.stream.id).toBe('camera-stream');
    });
});
