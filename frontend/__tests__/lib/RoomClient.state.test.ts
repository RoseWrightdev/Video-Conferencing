
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomClient, RoomClientState } from '@/lib/RoomClient';
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

describe('RoomClient - State Synchronization', () => {
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

    it('should correctly handle joining a room', () => {
        const joinResponse = {
            joinResponse: {
                success: true,
                userId: 'user-1',
                isHost: true,
                initialState: {
                    participants: [],
                    waitingUsers: []
                }
            }
        };

        // Trigger message
        const handler = mockWs.onMessage.mock.calls[0][0];
        handler(joinResponse);

        expect(mockOnStateChange).toHaveBeenCalledWith(expect.objectContaining({
            isJoined: true,
            currentUserId: 'user-1',
            isHost: true,
        }));
    });

    it('should sync full room state including existing participants', () => {
        // Initial state update
        const stateEvent = {
            roomState: {
                participants: [
                    { id: 'p1', displayName: 'P1', isAudioEnabled: true, isVideoEnabled: false, isHost: false },
                    { id: 'p2', displayName: 'P2', isAudioEnabled: false, isVideoEnabled: true, isHost: false },
                ],
                waitingUsers: []
            }
        };

        const handler = mockWs.onMessage.mock.calls[0][0];
        handler(stateEvent);

        // Verify state update payload
        // The mock call arguments are checking the *cumulative* state update, or partial? 
        // onStateChange is called with Partial<State>.

        // We expect Map objects
        expect(mockOnStateChange).toHaveBeenCalledWith(expect.objectContaining({
            participants: expect.any(Map),
            unmutedParticipants: expect.any(Set),
            cameraOnParticipants: expect.any(Set),
        }));

        // Dig deeper into the specific call
        const lastCall = mockOnStateChange.mock.lastCall?.[0];
        if (!lastCall) throw new Error('onStateChange was not called');

        expect(lastCall.participants.size).toBe(2);
        expect(lastCall.participants.get('p1')).toBeDefined();

        // Check Derived Sets
        expect(lastCall.unmutedParticipants.has('p1')).toBe(true);
        expect(lastCall.unmutedParticipants.has('p2')).toBe(false);
        expect(lastCall.cameraOnParticipants.has('p2')).toBe(true);
    });

    it('should handle waiting room notifications', () => {
        // Assume user joins but is put in waiting room
        // This is handled via joinResponse logic usually

        // But let's test specific Waiting Room List update
        const stateEvent = {
            roomState: {
                participants: [],
                waitingUsers: [
                    { id: 'w1', displayName: 'Guest 1' }
                ]
            }
        };

        const handler = mockWs.onMessage.mock.calls[0][0];
        handler(stateEvent);

        const lastCall = mockOnStateChange.mock.lastCall?.[0];
        if (!lastCall) throw new Error('onStateChange was not called');

        expect(lastCall.waitingParticipants).toBeDefined();
        expect(lastCall.waitingParticipants.size).toBe(1);
        expect(lastCall.waitingParticipants.get('w1').username).toBe('Guest 1');
    });
});
