import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaControls } from '@/hooks/useMediaControls';
import { useRoomStore } from '@/store/useRoomStore';

// Mock the store
vi.mock('@/store/useRoomStore');

// Mock the store
vi.mock('@/store/useRoomStore', () => ({
    useRoomStore: vi.fn()
}));

describe('useMediaControls', () => {
    const mockToggleAudio = vi.fn();
    const mockToggleVideo = vi.fn();
    const mockStartScreenShare = vi.fn();
    const mockStopScreenShare = vi.fn();
    const mockSwitchCamera = vi.fn();
    const mockSwitchMicrophone = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        (useRoomStore as any).mockReturnValue({
            isAudioEnabled: true,
            isVideoEnabled: true,
            isScreenSharing: false,
            availableDevices: {
                cameras: [{ deviceId: 'cam-1', label: 'Camera' }],
                microphones: [{ deviceId: 'mic-1', label: 'Microphone' }],
                speakers: []
            },
            selectedDevices: {
                camera: 'cam-1',
                microphone: 'mic-1',
                speaker: null
            },
            toggleAudio: mockToggleAudio,
            toggleVideo: mockToggleVideo,
            startScreenShare: mockStartScreenShare,
            stopScreenShare: mockStopScreenShare,
            switchCamera: mockSwitchCamera,
            switchMicrophone: mockSwitchMicrophone,
            refreshDevices: vi.fn(),
        });
    });

    describe('Basic functionality', () => {
        it('should return media state', () => {
            const { result } = renderHook(() => useMediaControls());

            expect(result.current.isAudioEnabled).toBe(true);
            expect(result.current.isVideoEnabled).toBe(true);
            expect(result.current.isScreenSharing).toBe(false);
        });

        it('should expose control functions', () => {
            const { result } = renderHook(() => useMediaControls());

            expect(result.current.toggleAudio).toBeDefined();
            expect(result.current.toggleVideo).toBeDefined();
            expect(result.current.toggleScreenShare).toBeDefined();
        });
    });

    describe('toggleAudio', () => {
        it('should call store toggleAudio', () => {
            const { result } = renderHook(() => useMediaControls());

            act(() => {
                result.current.toggleAudio();
            });

            expect(mockToggleAudio).toHaveBeenCalledTimes(1);
        });
    });

    describe('toggleVideo', () => {
        it('should call store toggleVideo', () => {
            const { result } = renderHook(() => useMediaControls());

            act(() => {
                result.current.toggleVideo();
            });

            expect(mockToggleVideo).toHaveBeenCalledTimes(1);
        });
    });

    describe('toggleScreenShare', () => {
        it('should start screen share when not sharing', () => {
            const { result } = renderHook(() => useMediaControls());

            act(() => {
                result.current.toggleScreenShare();
            });

            expect(mockStartScreenShare).toHaveBeenCalledTimes(1);
            expect(mockStopScreenShare).not.toHaveBeenCalled();
        });

        it('should stop screen share when already sharing', () => {
            (useRoomStore as any).mockReturnValue({
                isAudioEnabled: true,
                isVideoEnabled: true,
                isScreenSharing: true,
                availableDevices: {
                    cameras: [{ deviceId: 'cam-1', label: 'Camera' }],
                    microphones: [{ deviceId: 'mic-1', label: 'Microphone' }],
                    speakers: []
                },
                selectedDevices: {
                    camera: 'cam-1',
                    microphone: 'mic-1',
                    speaker: null
                },
                toggleAudio: mockToggleAudio,
                toggleVideo: mockToggleVideo,
                startScreenShare: mockStartScreenShare,
                stopScreenShare: mockStopScreenShare,
                switchCamera: mockSwitchCamera,
                switchMicrophone: mockSwitchMicrophone,
                refreshDevices: vi.fn(),
            });

            const { result } = renderHook(() => useMediaControls());

            act(() => {
                result.current.toggleScreenShare();
            });

            expect(mockStopScreenShare).toHaveBeenCalledTimes(1);
            expect(mockStartScreenShare).not.toHaveBeenCalled();
        });
    });

    describe('Device switching', () => {
        it('should switch camera', () => {
            const { result } = renderHook(() => useMediaControls());

            act(() => {
                result.current.switchCamera('camera-2');
            });

            expect(mockSwitchCamera).toHaveBeenCalledWith('camera-2');
            expect(mockSwitchCamera).toHaveBeenCalledTimes(1);
        });

        it('should switch microphone', () => {
            const { result } = renderHook(() => useMediaControls());

            act(() => {
                result.current.switchMicrophone('mic-2');
            });

            expect(mockSwitchMicrophone).toHaveBeenCalledWith('mic-2');
            expect(mockSwitchMicrophone).toHaveBeenCalledTimes(1);
        });
    });
});
