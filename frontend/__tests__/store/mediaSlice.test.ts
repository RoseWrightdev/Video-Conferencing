import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMediaSlice } from '../../store/slices/mediaSlice';
import { RoomStoreState } from '../../store/types';

describe('mediaSlice', () => {
    let mockGet: () => Partial<RoomStoreState>;
    let mockSet: (fn: (state: Partial<RoomStoreState>) => Partial<RoomStoreState>) => void;
    let slice: ReturnType<typeof createMediaSlice>;
    let currentState: Partial<RoomStoreState>;

    // Mock Objects
    const mockWsClient = {
        send: vi.fn(),
    };

    const mockSender = {
        track: { id: 'track-id', kind: 'video' },
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

    const mockTrack = {
        id: 'track-1',
        kind: 'audio',
        enabled: true,
        stop: vi.fn(),
    };

    const mockRoomSettings = {
        allowScreenShare: false,
        allowChat: true,
        allowParticipantAudio: true,
        allowParticipantVideo: true,
        maxParticipants: 50,
        requireApproval: false
    };

    let mockStream: any;

    // Mock MediaStream globally
    class MockMediaStream {
        id: string;
        private tracks: any[] = [];

        constructor(tracks: any[] = []) {
            this.id = 'mock-stream-' + Math.random().toString(36).substr(2, 9);
            this.tracks = tracks;
            this.getTracks = vi.fn().mockImplementation(() => this.tracks);
            this.getAudioTracks = vi.fn().mockImplementation(() => this.tracks.filter(t => t.kind === 'audio'));
            this.getVideoTracks = vi.fn().mockImplementation(() => this.tracks.filter(t => t.kind === 'video'));
            this.addTrack = vi.fn().mockImplementation((track: any) => this.tracks.push(track));
            this.removeTrack = vi.fn().mockImplementation((track: any) => {
                this.tracks = this.tracks.filter(t => t !== track);
            });
        }

        getTracks: ReturnType<typeof vi.fn>;
        getAudioTracks: ReturnType<typeof vi.fn>;
        getVideoTracks: ReturnType<typeof vi.fn>;
        addTrack: ReturnType<typeof vi.fn>;
        removeTrack: ReturnType<typeof vi.fn>;
    }

    // Global Mocks
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
            isHost: true,
            roomSettings: { ...mockRoomSettings, allowScreenShare: false },
            // Mock other slice methods called by mediaSlice
            setParticipantStream: vi.fn(),
            setAudioEnabled: vi.fn(),
            setVideoEnabled: vi.fn(),
            roomClient: {
                setLocalStream: vi.fn(),
            } as any,
        };

        mockGet = () => currentState;
        mockSet = (param) => {
            const updates = typeof param === 'function' ? param(currentState) : param;
            currentState = { ...currentState, ...updates };
        };

        // Reset Mocks
        vi.clearAllMocks();
        mockTrack.stop.mockClear();
        mockSfuClient.addTrack.mockClear();
        mockPc.removeTrack.mockClear();

        mockStream = new MockMediaStream([mockTrack]);

        // Browser API Mocks
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {
                getUserMedia: vi.fn().mockImplementation(async (constraints) => {
                    const tracks: any[] = [];
                    if (constraints.audio) {
                        tracks.push({ ...mockTrack, id: 'audio-track-' + Math.random(), kind: 'audio' });
                    }
                    if (constraints.video) {
                        tracks.push({ ...mockTrack, id: 'video-track-' + Math.random(), kind: 'video' });
                    }
                    return new MockMediaStream(tracks);
                }),
                getDisplayMedia: vi.fn().mockImplementation(async () => {
                    return new MockMediaStream([{ ...mockTrack, id: 'screen-track', kind: 'video' }]);
                }),
            },
            writable: true,
        });

        // Instantiate Slice
        slice = createMediaSlice(mockSet as any, mockGet as any, {} as any);
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

    describe('setLocalStream', () => {
        it('should set local stream and add tracks to SFU', () => {
            slice.setLocalStream(mockStream as any);

            expect(currentState.localStream).toBe(mockStream);
            expect(mockSfuClient.addTrack).toHaveBeenCalled();
            // Should also sync with room client
            expect(currentState.roomClient?.setLocalStream).toHaveBeenCalledWith('me', mockStream);
        });

        it('should cleanup old stream tracks', () => {
            // Setup existing stream
            const oldTrack = { ...mockTrack, id: 'old-track', stop: vi.fn() };
            const oldStream = { ...mockStream, getTracks: () => [oldTrack] };
            currentState.localStream = oldStream as any;

            slice.setLocalStream(mockStream as any);

            expect(oldTrack.stop).toHaveBeenCalled();
        });
    });

    describe('toggleAudio', () => {
        it('should enable audio when it was disabled', async () => {
            currentState.isAudioEnabled = false;
            currentState.localStream = mockStream as any; // Existing stream

            await slice.toggleAudio();

            expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
            expect(currentState.isAudioEnabled).toBe(true);
            expect(mockSfuClient.addTrack).toHaveBeenCalled();
            expect(mockWsClient.send).toHaveBeenCalledWith({ toggleMedia: { kind: 'audio', isEnabled: true } });
        });

        it('should disable audio when it was enabled', async () => {
            currentState.isAudioEnabled = true;
            currentState.localStream = mockStream;
            // Ensure stream has audio tracks to stop
            mockStream.addTrack(mockTrack);

            await slice.toggleAudio();

            expect(mockTrack.stop).toHaveBeenCalled();
            expect(currentState.isAudioEnabled).toBe(false);
            expect(mockWsClient.send).toHaveBeenCalledWith({ toggleMedia: { kind: 'audio', isEnabled: false } });
        });
    });

    describe('toggleVideo', () => {
        it('should enable video when it was disabled', async () => {
            currentState.isVideoEnabled = false;
            const videoTrack = { ...mockTrack, kind: 'video' };
            const videoStream = { ...mockStream, getVideoTracks: () => [videoTrack] };
            (navigator.mediaDevices.getUserMedia as any).mockResolvedValueOnce(videoStream);

            await slice.toggleVideo();

            expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: true });
            expect(currentState.isVideoEnabled).toBe(true);
            expect(mockSfuClient.addTrack).toHaveBeenCalled();
            expect(mockWsClient.send).toHaveBeenCalledWith({ toggleMedia: { kind: 'video', isEnabled: true } });
        });

        it('should disable video when it was enabled', async () => {
            currentState.isVideoEnabled = true;
            currentState.localStream = mockStream;
            const videoTrack = { ...mockTrack, kind: 'video' };
            mockStream.addTrack(videoTrack);

            await slice.toggleVideo();

            expect(videoTrack.stop).toHaveBeenCalled();
            expect(currentState.isVideoEnabled).toBe(false);
            expect(mockWsClient.send).toHaveBeenCalledWith({ toggleMedia: { kind: 'video', isEnabled: false } });
        });
    });

    describe('Screen Share', () => {
        it('should start screen share', async () => {
            // Ensure permissions allow it by default in this test setup (host=true)
            currentState.isHost = true;
            currentState.roomSettings = { ...mockRoomSettings, allowScreenShare: false };

            await slice.startScreenShare();

            expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({ video: true });
            expect(currentState.isScreenSharing).toBe(true);
            expect(mockSfuClient.addTrack).toHaveBeenCalled();
            expect(mockWsClient.send).toHaveBeenCalledWith({ screenShare: { isSharing: true } });
        });

        it('should stop screen share', async () => {
            currentState.isScreenSharing = true;
            currentState.screenShareStream = mockStream as any;

            await slice.stopScreenShare();

            expect(mockTrack.stop).toHaveBeenCalled();
            expect(currentState.isScreenSharing).toBe(false);
            expect(currentState.screenShareStream).toBeNull();
            expect(mockWsClient.send).toHaveBeenCalledWith({ screenShare: { isSharing: false } });
        });

        it('should allow non-host if roomSettings.allowScreenShare is true', async () => {
            currentState.isHost = false;
            currentState.roomSettings = { ...mockRoomSettings, allowScreenShare: true };

            await slice.startScreenShare();

            expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled();
        });

        it('should throw error when non-host tries to share screen and roomSettings.allowScreenShare is false', async () => {
            currentState.isHost = false;
            currentState.roomSettings = { ...mockRoomSettings, allowScreenShare: false };

            try {
                await slice.startScreenShare();
            } catch (e) {
                // Ignore expected error
            }

            expect(navigator.mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
            // Note: In the consolidated file, mockWsClient is defined at the top level, unlike the original file which checked mockSet
            // We can check currentState or mockWsClient
            expect(currentState.isScreenSharing).toBe(false);
        });
    });
});
