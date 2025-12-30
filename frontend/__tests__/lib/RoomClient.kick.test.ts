
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomClient } from '@/lib/RoomClient';
import { WebSocketClient } from '@/lib/websockets';

vi.mock('@/lib/websockets');
vi.mock('@/lib/webrtc');

describe('RoomClient - Kick Handling', () => {
    let client: RoomClient;
    let mockOnStateChange: ReturnType<typeof vi.fn>;
    let mockWs: any;

    beforeEach(() => {
        mockOnStateChange = vi.fn();
        mockWs = {
            send: vi.fn(),
            onMessage: vi.fn(),
            connect: vi.fn().mockResolvedValue(undefined),
            disconnect: vi.fn(),
        };
        (WebSocketClient as any).mockImplementation(() => mockWs);

        client = new RoomClient(mockOnStateChange, vi.fn());
        client.connect('room-1', 'user-1', 'token-1');
    });

    it('should emits { isKicked: true } error when receiving kicked admin event', () => {
        // According to current impl, it sets error and calls disconnect. 
        // We want it to ALSO set isKicked: true so the UI can redirect cleanly.

        const kickMsg = {
            adminEvent: {
                action: 'kicked',
                reason: 'Violation'
            }
        };

        const wsCallback = mockWs.onMessage.mock.calls[0][0];
        wsCallback(kickMsg);

        expect(mockOnStateChange).toHaveBeenCalledWith(expect.objectContaining({
            isKicked: true
        }));

        // It should also disconnect
        expect(mockWs.disconnect).toHaveBeenCalled();
    });

    it('should handle "kick" action string in addition to "kicked"', () => {
        const kickMsg = {
            adminEvent: {
                action: 'kick', // Verifying alternative string
                reason: 'Violation'
            }
        };

        const wsCallback = mockWs.onMessage.mock.calls[0][0];
        wsCallback(kickMsg);

        expect(mockOnStateChange).toHaveBeenCalledWith(expect.objectContaining({
            isKicked: true
        }));
    });
});
