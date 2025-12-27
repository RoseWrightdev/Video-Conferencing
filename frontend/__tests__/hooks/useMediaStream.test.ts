import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMediaStream } from '@/hooks/useMediaStream';
import { useRoomStore } from '@/store/useRoomStore';

// Mock the store
vi.mock('@/store/useRoomStore');

// Mock the store
vi.mock('@/store/useRoomStore', () => ({
    useRoomStore: vi.fn()
}));

describe('useMediaStream', () => {
    const mockSetLocalStream = vi.fn();
    const mockToggleAudio = vi.fn();
    const mockToggleVideo = vi.fn();
    const mockStartScreenShare = vi.fn();
    const mockStopScreenShare = vi.fn();
    const mockSwitchCamera = vi.fn();
    const mockSwitchMicrophone = vi.fn();
    const mockRefreshDevices = vi.fn();
    const mockHandleError = vi.fn();

    const mockStream = {
        id: 'stream-123',
        active: true,
        getTracks: vi.fn(() => []),
        getAudioTracks: vi.fn(() => []),
        getVideoTracks: vi.fn(() => []),
    } as unknown as MediaStream;

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset mock implementations
        mockRefreshDevices.mockResolvedValue(undefined);

        (useRoomStore as any).mockReturnValue({
            localStream: null,
            isAudioEnabled: false,
            isVideoEnabled: false,
            isScreenSharing: false,
            availableDevices: {
                cameras: [{ deviceId: 'camera-1', label: 'Camera 1', kind: 'videoinput' }],
                microphones: [{ deviceId: 'mic-1', label: 'Mic 1', kind: 'audioinput' }],
                speakers: [],
            },
            selectedDevices: {
                camera: 'camera-1',
                microphone: 'mic-1',
                speaker: null,
            },
            setLocalStream: mockSetLocalStream,
            toggleAudio: mockToggleAudio,
            toggleVideo: mockToggleVideo,
            startScreenShare: mockStartScreenShare,
            stopScreenShare: mockStopScreenShare,
            switchCamera: mockSwitchCamera,
            switchMicrophone: mockSwitchMicrophone,
            refreshDevices: mockRefreshDevices,
            handleError: mockHandleError,
        });

        // Mock getUserMedia
        const mockMediaStream = {
            id: 'stream-123',
            active: true,
            getTracks: () => [
                {
                    kind: 'audio',
                    enabled: false,
                    stop: vi.fn(),
                    getSettings: () => ({}),
                    getConstraints: () => ({}),
                    label: 'Mock Audio',
                },
                {
                    kind: 'video',
                    enabled: false,
                    stop: vi.fn(),
                    getSettings: () => ({}),
                    getConstraints: () => ({}),
                    label: 'Mock Video',
                },
            ],
            getAudioTracks: () => [
                {
                    kind: 'audio',
                    enabled: false,
                    stop: vi.fn(),
                    getSettings: () => ({}),
                    getConstraints: () => ({}),
                    label: 'Mock Audio',
                }
            ],
            getVideoTracks: () => [
                {
                    kind: 'video',
                    enabled: false,
                    stop: vi.fn(),
                    getSettings: () => ({}),
                    getConstraints: () => ({}),
                    label: 'Mock Video',
                }
            ],
        };

        (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(mockMediaStream);
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    describe('Basic initialization', () => {
        it('should initialize with correct default state', () => {
            const { result } = renderHook(() => useMediaStream());

            expect(result.current.isInitialized).toBe(false);
            expect(result.current.isStarting).toBe(false);
            expect(result.current.error).toBe(null);
        });

        it('should expose stream control functions', () => {
            const { result } = renderHook(() => useMediaStream());

            expect(result.current.toggleAudio).toBeDefined();
            expect(result.current.toggleVideo).toBeDefined();
            expect(result.current.startScreenShare).toBeDefined();
            expect(result.current.stopScreenShare).toBeDefined();
            expect(result.current.switchCamera).toBeDefined();
            expect(result.current.switchMicrophone).toBeDefined();
        });

        it('should return available devices from store', () => {
            const { result } = renderHook(() => useMediaStream());

            expect(result.current.availableDevices.cameras).toHaveLength(1);
            expect(result.current.availableDevices.microphones).toHaveLength(1);
        });
    });

    describe('initializeStream', () => {
        it('should initialize stream successfully', async () => {
            const { result } = renderHook(() => useMediaStream());

            await result.current.initializeStream();

            await waitFor(() => {
                expect(mockRefreshDevices).toHaveBeenCalled();
                expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
                expect(mockSetLocalStream).toHaveBeenCalled();
                expect(result.current.isInitialized).toBe(true);
                expect(result.current.isStarting).toBe(false);
            });
        });

        it('should not initialize if already initialized', async () => {
            const { result, rerender } = renderHook(() => useMediaStream());

            await result.current.initializeStream();

            await waitFor(() => {
                expect(result.current.isInitialized).toBe(true);
            });

            vi.clearAllMocks();

            // Try to initialize again
            await result.current.initializeStream();

            expect(mockRefreshDevices).not.toHaveBeenCalled();
            expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
        });

        it('should handle errors during initialization', async () => {
            const error = new Error('Permission denied');
            (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(error);

            const { result } = renderHook(() => useMediaStream());

            await expect(result.current.initializeStream()).rejects.toThrow('Permission denied');

            await waitFor(() => {
                expect(result.current.error).toBe('Permission denied');
                expect(result.current.isStarting).toBe(false);
                expect(mockHandleError).toHaveBeenCalledWith('Permission denied');
            });
        });

        it('should throw error if audio requested but no microphones available', async () => {
            (useRoomStore as any).mockReturnValue({
                ...useRoomStore(),
                availableDevices: {
                    cameras: [{ deviceId: 'camera-1', label: 'Camera 1', kind: 'videoinput' }],
                    microphones: [],
                    speakers: [],
                },
                refreshDevices: mockRefreshDevices,
                handleError: mockHandleError,
                setLocalStream: mockSetLocalStream,
                toggleAudio: mockToggleAudio,
                toggleVideo: mockToggleVideo,
                startScreenShare: mockStartScreenShare,
                stopScreenShare: mockStopScreenShare,
                switchCamera: mockSwitchCamera,
                switchMicrophone: mockSwitchMicrophone,
            });

            const { result } = renderHook(() => useMediaStream({ audio: true, video: false }));

            await expect(result.current.initializeStream()).rejects.toThrow(
                'Audio requested but no microphones available'
            );
        });

        it('should disable all tracks immediately after getting stream', async () => {
            const { result } = renderHook(() => useMediaStream());

            await result.current.initializeStream();

            await waitFor(() => {
                const getUserMediaCall = (navigator.mediaDevices.getUserMedia as any).mock.results[0];
                expect(getUserMediaCall).toBeDefined();
            });
        });
    });

    describe('Auto-start functionality', () => {
        it('should auto-initialize when autoStart is true', async () => {
            renderHook(() => useMediaStream({ autoStart: true }));

            await waitFor(() => {
                expect(mockRefreshDevices).toHaveBeenCalled();
                expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
            });
        });

        it('should not auto-initialize when autoStart is false', async () => {
            renderHook(() => useMediaStream({ autoStart: false }));

            await waitFor(() => {
                expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
            }, { timeout: 1000 });
        });
    });

    describe('cleanup', () => {
        it('should stop all tracks on cleanup', async () => {
            const mockTrack = { stop: vi.fn(), kind: 'video', enabled: true };
            const mockStreamWithTracks = {
                getTracks: () => [mockTrack],
                getAudioTracks: () => [],
                getVideoTracks: () => [mockTrack],
            };

            (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(mockStreamWithTracks);

            const { result, unmount } = renderHook(() => useMediaStream());

            await result.current.initializeStream();

            await waitFor(() => {
                expect(result.current.isInitialized).toBe(true);
            });

            unmount();

            expect(mockTrack.stop).toHaveBeenCalled();
        });

        it('should reset state on cleanup', async () => {
            const { result } = renderHook(() => useMediaStream());

            await result.current.initializeStream();

            await waitFor(() => {
                expect(result.current.isInitialized).toBe(true);
            });

            act(() => {
                result.current.cleanup();
            });

            expect(result.current.isInitialized).toBe(false);
            expect(result.current.isStarting).toBe(false);
            expect(result.current.error).toBe(null);
        });
    });

    describe('requestPermissions', () => {
        it('should request permissions and refresh devices', async () => {
            const { result } = renderHook(() => useMediaStream({ video: true, audio: true }));

            const success = await result.current.requestPermissions();

            expect(success).toBe(true);
            expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: true });
            expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
            expect(mockRefreshDevices).toHaveBeenCalled();
        });

        it('should handle permission denial', async () => {
            (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(
                new Error('Permission denied')
            );

            const { result } = renderHook(() => useMediaStream({ video: true, audio: true }));

            const success = await result.current.requestPermissions();

            expect(success).toBe(false);
            expect(mockHandleError).toHaveBeenCalledWith(
                'Media permissions denied. Please allow camera and microphone access.'
            );
        });
    });

    describe('getStreamStats', () => {
        it('should return null if no stream', () => {
            const { result } = renderHook(() => useMediaStream());

            const stats = result.current.getStreamStats();

            expect(stats).toBe(null);
        });

        it('should return stream stats when stream exists', async () => {
            const { result } = renderHook(() => useMediaStream());

            await result.current.initializeStream();

            await waitFor(() => {
                expect(result.current.isInitialized).toBe(true);
            });

            const stats = result.current.getStreamStats();

            expect(stats).toBeDefined();
            expect(stats?.streamId).toBe('stream-123');
        });
    });

    describe('Device change handling', () => {
        it('should listen for device changes', async () => {
            const addEventListenerSpy = vi.spyOn(navigator.mediaDevices, 'addEventListener');

            renderHook(() => useMediaStream());

            expect(addEventListenerSpy).toHaveBeenCalledWith('devicechange', expect.any(Function));
        });

        it('should cleanup device change listener on unmount', () => {
            const removeEventListenerSpy = vi.spyOn(navigator.mediaDevices, 'removeEventListener');

            const { unmount } = renderHook(() => useMediaStream());

            unmount();

            expect(removeEventListenerSpy).toHaveBeenCalledWith('devicechange', expect.any(Function));
        });
    });
});
