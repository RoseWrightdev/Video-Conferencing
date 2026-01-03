
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

describe('RoomClient - Media State Checks', () => {
    let client: RoomClient;
    let mockOnStateChange: ReturnType<typeof vi.fn>;
    let mockOnMediaTrackAdded: ReturnType<typeof vi.fn>;
    let mockWs: any;

    beforeEach(() => {
        mockOnStateChange = vi.fn();
        mockOnMediaTrackAdded = vi.fn();
        mockWs = {
            send: vi.fn(),
            onMessage: vi.fn(),
            connect: vi.fn().mockResolvedValue(true),
            disconnect: vi.fn(),
        };
        (WebSocketClient as any).mockImplementation(() => mockWs);
        (SFUClient as any).mockImplementation(() => ({
            close: vi.fn(),
        }));

        client = new RoomClient(mockOnStateChange, mockOnMediaTrackAdded);
        client.connect('room-1', 'user-1', 'token-1');
    });

    it('should send correct update when toggling audio', () => {
        client.toggleAudio(true);
        expect(mockWs.send).toHaveBeenCalledWith({
            toggleMedia: {
                kind: 'audio',
                isEnabled: true
            }
        });

        client.toggleAudio(false);
        expect(mockWs.send).toHaveBeenCalledWith({
            toggleMedia: {
                kind: 'audio',
                isEnabled: false
            }
        });
    });

    it('should send correct update when toggling video', () => {
        client.toggleVideo(true);
        expect(mockWs.send).toHaveBeenCalledWith({
            toggleMedia: {
                kind: 'video',
                isEnabled: true
            }
        });

        client.toggleVideo(false);
        expect(mockWs.send).toHaveBeenCalledWith({
            toggleMedia: {
                kind: 'video',
                isEnabled: false
            }
        });
    });

    it('should update local participant map when receiving remote media updates', () => {
        // 1. Setup initial participant
        const joinMsg = {
            joinResponse: { success: true, userId: 'me' }
        };
        const wsHandler = mockWs.onMessage.mock.calls[0][0];
        wsHandler(joinMsg);

        const roomStateMsg = {
            roomState: {
                participants: [
                    { id: 'remote-1', displayName: 'Remote', isAudioEnabled: false, isVideoEnabled: false }
                ]
            }
        };
        wsHandler(roomStateMsg);

        // 2. Receive update: Remote user turned ON camera
        const updateMsg = {
            mediaStateChanged: {
                userId: 'remote-1',
                isVideoEnabled: true,
                isAudioEnabled: false
            }
        };
        wsHandler(updateMsg);

        // 3. Verify onStateChange reflected the change
        const lastCall = mockOnStateChange.mock.lastCall?.[0];
        if (!lastCall) throw new Error('onStateChange was not called');

        expect(lastCall.participants.get('remote-1').isVideoEnabled).toBe(true);
        expect(lastCall.cameraOnParticipants.has('remote-1')).toBe(true);
    });
});
