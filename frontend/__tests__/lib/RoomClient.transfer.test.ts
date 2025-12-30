
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomClient } from '@/lib/RoomClient';
import { WebSocketClient } from '@/lib/websockets';

// Mock dependencies
vi.mock('@/lib/websockets');
vi.mock('@/lib/webrtc');

describe('RoomClient - Host Transfer', () => {
    let client: RoomClient;
    let mockOnStateChange: ReturnType<typeof vi.fn>;
    let mockOnMediaTrackAdded: ReturnType<typeof vi.fn>;
    let mockWs: any;

    beforeEach(() => {
        mockOnStateChange = vi.fn();
        mockOnMediaTrackAdded = vi.fn();

        // Setup RoomClient
        client = new RoomClient(mockOnStateChange, mockOnMediaTrackAdded);

        // Setup Mock WebSocket
        mockWs = {
            send: vi.fn(),
            onMessage: vi.fn(),
            connect: vi.fn().mockResolvedValue(undefined),
            disconnect: vi.fn(),
        };
        (WebSocketClient as any).mockImplementation(() => mockWs);

        // Simulate connection to attach WS
        client.connect('room-1', 'user-1', 'token-1');
    });

    it('should send transfer_ownership command correctly', () => {
        const targetUserId = 'new-host-id';
        client.transferOwnership(targetUserId);

        expect(mockWs.send).toHaveBeenCalledWith({
            adminAction: {
                action: 'transfer_ownership',
                targetUserId: targetUserId
            }
        });
    });

    it('should update isHost state locally when receiving ownership_transferred event for self', async () => {
        // 1. Simulate initial state where we are NOT host
        // We need to trigger a join response or similar to set currentUserId
        // Accessing private method via 'any' or simulating the message flow
        const joinMsg = {
            joinResponse: {
                success: true,
                userId: 'my-user-id',
                isHost: false, // Initially not host
                initialState: { participants: [] }
            }
        };

        // Simulate Join Response
        const wsCallback = mockWs.onMessage.mock.calls[0][0];
        wsCallback(joinMsg);

        expect(mockOnStateChange).toHaveBeenCalledWith(expect.objectContaining({
            isHost: false,
            currentUserId: 'my-user-id'
        }));
        mockOnStateChange.mockClear();

        // 2. Simulate Admin Event: Ownership Transferred to ME
        const adminEventMsg = {
            adminEvent: {
                action: 'ownership_transferred',
                reason: 'my-user-id' // The reason field contains the new owner ID in this protocol
            }
        };

        wsCallback(adminEventMsg);

        // 3. Verify onStateChange was called with isHost: true
        // This is expected to FAIL before the fix
        expect(mockOnStateChange).toHaveBeenCalledWith(expect.objectContaining({
            isHost: true
        }));
    });

    it('should NOT update isHost state if transferred to someone else', () => {
        // 1. Setup user
        const joinMsg = {
            joinResponse: {
                success: true,
                userId: 'my-user-id',
                isHost: false,
                initialState: { participants: [] }
            }
        };
        const wsCallback = mockWs.onMessage.mock.calls[0][0];
        wsCallback(joinMsg);
        mockOnStateChange.mockClear();

        // 2. Simulate Admin Event: Ownership Transferred to OTHER
        const adminEventMsg = {
            adminEvent: {
                action: 'ownership_transferred',
                reason: 'other-user-id'
            }
        };

        wsCallback(adminEventMsg);

        // 3. Verify isHost did NOT change
        expect(mockOnStateChange).not.toHaveBeenCalledWith(expect.objectContaining({
            isHost: true
        }));
    });
});
