import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDeviceCapabilities } from '../../hooks/useDeviceCapabilities';
import { useRoomStore } from '../../store/useRoomStore';

// Mock dependencies
vi.mock('../../store/useRoomStore', () => ({
    useRoomStore: vi.fn()
}));

describe('useDeviceCapabilities', () => {
    let mockStore: any;

    beforeEach(() => {
        mockStore = {
            availableDevices: {
                cameras: [],
                microphones: [],
                speakers: []
            },
            refreshDevices: vi.fn(),
            switchCamera: vi.fn(),
            switchMicrophone: vi.fn(),
        };
        (useRoomStore as any).mockReturnValue(mockStore);

        // Mock global navigator/window stuff
        // Mock global navigator/window stuff
        if (!navigator.mediaDevices) {
            Object.defineProperty(navigator, 'mediaDevices', {
                value: {},
                configurable: true,
                writable: true
            });
        }

        Object.assign(navigator.mediaDevices, {
            enumerateDevices: vi.fn(),
            getDisplayMedia: vi.fn(),
            getSupportedConstraints: vi.fn().mockReturnValue({})
        });

        (window as any).RTCPeerConnection = vi.fn();
        (window as any).RTCDataChannel = vi.fn();
        Object.defineProperty(HTMLMediaElement.prototype, 'setSinkId', {
            value: vi.fn(),
            writable: true,
            configurable: true
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return initial capabilities based on empty store', () => {
        const { result } = renderHook(() => useDeviceCapabilities());

        expect(result.current.capabilities).toEqual(expect.objectContaining({
            hasCamera: false,
            hasMicrophone: false,
            hasSpeaker: false,
            supportsScreenShare: true,
            supportsDeviceSelection: true,
        }));
    });

    it('should detect devices when present in store', () => {
        mockStore.availableDevices = {
            cameras: [{ deviceId: 'cam1', label: 'Camera 1' }],
            microphones: [{ deviceId: 'mic1', label: 'Mic 1' }],
            speakers: [{ deviceId: 'spk1', label: 'Speaker 1' }]
        };

        const { result } = renderHook(() => useDeviceCapabilities());

        expect(result.current.capabilities.hasCamera).toBe(true);
        expect(result.current.capabilities.hasMicrophone).toBe(true);
        expect(result.current.capabilities.hasSpeaker).toBe(true);

        expect(result.current.deviceInfo.cameraCount).toBe(1);
        expect(result.current.deviceInfo.microphoneCount).toBe(1);
        expect(result.current.deviceInfo.speakerCount).toBe(1);
    });

    it('should detect browser features', () => {
        const { result } = renderHook(() => useDeviceCapabilities());

        expect(result.current.capabilities.supportsWebRTC).toBe(true);
        expect(result.current.capabilities.supportsDataChannels).toBe(true);
        expect(result.current.capabilities.supportsAudioOutput).toBe(true);
    });
});
