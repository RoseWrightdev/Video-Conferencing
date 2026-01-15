
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomService, WebRTCManager } from '../../services/roomService';

describe('RoomService', () => {
    let roomService: RoomService;
    let mockWebRTCManager: WebRTCManager;
    let addPeerMock: any;

    beforeEach(() => {
        addPeerMock = vi.fn().mockImplementation(async (peerId: string) => {
            // Simulate async work
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        mockWebRTCManager = {
            addPeer: addPeerMock
        };

        roomService = new RoomService(mockWebRTCManager);
    });

    it('should queue peer connections when multiple participants join instantly', async () => {
        const peerIds = ['peer1', 'peer2', 'peer3'];
        const callOrder: string[] = [];

        // Helper to track start and end of addPeer calls
        addPeerMock.mockImplementation(async (peerId: string) => {
            callOrder.push(`start-${peerId}`);
            await new Promise(resolve => setTimeout(resolve, 100));
            callOrder.push(`end-${peerId}`);
        });

        // Simulate 3 participants joining almost simultaneously
        const promises = peerIds.map(id => roomService.joinParticipant(id));

        await Promise.all(promises);

        // In a race condition (parallel execution):
        // start-peer1, start-peer2, start-peer3 happen before any end-peer*

        // In a sequenced execution (queued):
        // start-peer1 -> end-peer1 -> start-peer2 -> end-peer2 -> start-peer3 -> end-peer3

        // We expect the strictly sequential order for the test to PASS (after fix).
        // For now, checks might verify overlap to confirm the failure or just assert sequentiality and fail.

        const expectedOrder = [
            'start-peer1', 'end-peer1',
            'start-peer2', 'end-peer2',
            'start-peer3', 'end-peer3'
        ];

        // Check if callOrder matches expectedOrder exactly
        // Note: Promise.all processing order isn't guaranteed for the 'start' events if they really fire in parallel,
        // but the 'start' -> 'end' blocks should not overlap if queued.

        // A strict check for specific order might be flaky if they start truly in parallel, 
        // but with the current naive implementation, they WILL overlap.

        // Let's verify that we have NO overlap. 
        // i.e., end-peerX must appear before start-peerY for the next one.

        // Simple verification: The array must be exactly expectedOrder (assuming strict FIFO queue)
        // or at least satisfying the non-overlapping constraint.

        // For this reproduction, let's just assert the strict order, assuming the Loop processes them in order of call.
        expect(callOrder).toEqual(expectedOrder);
    });
});
