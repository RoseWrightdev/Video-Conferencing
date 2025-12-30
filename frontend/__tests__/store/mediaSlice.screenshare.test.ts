
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMediaSlice } from '@/store/slices/mediaSlice';
import { type RoomStoreState } from '@/store/types';

describe('mediaSlice - Screen Share', () => {
    let mockGet: () => Partial<RoomStoreState>;
    let mockSet: (fn: (state: Partial<RoomStoreState>) => Partial<RoomStoreState>) => void;
    let slice: ReturnType<typeof createMediaSlice>;
    let currentState: Partial<RoomStoreState>;

    // Mock Objects
    const mockWsClient = {
        send: vi.fn(),
    };

    const mockSender = {
        track: { id: 'screen-track-id', kind: 'video' },
        replaceTrack: vi.fn(),
    };

    const mockPc = {
        getSenders: vi.fn().mockReturnValue([mockSender]),
        removeTrack: vi.fn(),
    };

    const mockSfuClient = {
        pc: mockPc,
        addTrack: vi.fn(),
    };

    const mockScreenTrack = {
        id: 'screen-track-id',
        kind: 'video',
        enabled: true,
        stop: vi.fn(),
        onended: null as (() => void) | null,
    };

    // Helper to mock MediaStream
    class MockMediaStream {
        id: string;
        private tracks: any[] = [];

        constructor(tracks: any[] = []) {
            this.id = 'mock-stream-' + Math.random().toString(36).substr(2, 9);
            this.tracks = tracks;
        }

        getTracks = vi.fn().mockImplementation(() => this.tracks);
        getAudioTracks = vi.fn().mockImplementation(() => this.tracks.filter(t => t.kind === 'audio'));
        getVideoTracks = vi.fn().mockImplementation(() => this.tracks.filter(t => t.kind === 'video'));
    }

    const originalMediaDevices = navigator.mediaDevices;
    const originalMediaStream = (global as any).MediaStream;

    beforeEach(() => {
        (global as any).MediaStream = MockMediaStream;

        // Reset State
        currentState = {
            localStream: null,
            screenShareStream: null,
            isAudioEnabled: false,
            isVideoEnabled: false,
            isScreenSharing: false,
            sfuClient: mockSfuClient as any,
            wsClient: mockWsClient as any,
            currentUserId: 'me',
            roomClient: {
                setLocalStream: vi.fn(),
            } as any,
        };

        mockGet = () => currentState;
        // Simple mock set that updates state
        mockSet = (param: any) => {
            const updates = typeof param === 'function' ? param(currentState) : param;
            currentState = { ...currentState, ...updates };
        };

        // Reset Mocks
        vi.clearAllMocks();
        mockScreenTrack.stop.mockClear();
        mockScreenTrack.onended = null;
        mockSfuClient.addTrack.mockClear();
        mockPc.removeTrack.mockClear();
        mockPc.getSenders.mockReturnValue([mockSender]); // Ensure sender is found

        // Browser API Mocks
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {
                getDisplayMedia: vi.fn().mockImplementation(async () => {
                    return new MockMediaStream([mockScreenTrack]);
                }),
            },
            writable: true,
        });

        // Instantiate Slice
        slice = createMediaSlice(mockSet as any, mockGet as any, {} as any);

        // Merge slice methods into currentState so get() can access them
        Object.assign(currentState, slice);
    });

    afterEach(() => {
        if (originalMediaStream) {
            (global as any).MediaStream = originalMediaStream;
        } else {
            delete (global as any).MediaStream;
        }
        Object.defineProperty(navigator, 'mediaDevices', {
            value: originalMediaDevices,
        });
    });

    it('should start screen share and add listener for onended', async () => {
        await slice.startScreenShare();

        expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({ video: true });
        expect(currentState.isScreenSharing).toBe(true);
        expect(currentState.screenShareStream).not.toBeNull();
        expect(mockSfuClient.addTrack).toHaveBeenCalledWith(mockScreenTrack, expect.any(Object));

        // Key verification: Check if onended listener was attached
        // Note: In the real implementation, we assign to .onended directly
        expect(mockScreenTrack.onended).toBeTypeOf('function');
    });

    it('should properly cleanup when stopScreenShare is called directly', async () => {
        currentState.isScreenSharing = true;
        currentState.screenShareStream = new MockMediaStream([mockScreenTrack]) as any;

        // Call stopScreenShare
        await slice.stopScreenShare();

        // Verify track stop was called
        expect(mockScreenTrack.stop).toHaveBeenCalled();

        // Verify track was removed from SFU
        // This fails currently!
        expect(mockPc.removeTrack).toHaveBeenCalledWith(mockSender);

        // Verify state update
        expect(currentState.isScreenSharing).toBe(false);
        expect(currentState.screenShareStream).toBeNull();
    });

    it('should handle "onended" event from browser UI to stop sharing', async () => {
        await slice.startScreenShare();

        // Verify we started correctly
        expect(currentState.isScreenSharing).toBe(true);

        // Simulate browser "Stop sharing" button which fires onended
        if (mockScreenTrack.onended) {
            mockScreenTrack.onended();
        } else {
            throw new Error('onended listener was not attached!');
        }

        // Current bug: stopScreenShare doesn't remove from SFU, and startScreenShare doesn't attach onended
        // So this test tests both fixes together
        expect(mockPc.removeTrack).toHaveBeenCalled();
        expect(currentState.isScreenSharing).toBe(false);
    });
});
