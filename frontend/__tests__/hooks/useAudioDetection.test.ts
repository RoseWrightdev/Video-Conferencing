import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioDetection } from '@/hooks/useAudioDetection';

describe('useAudioDetection', () => {
    // Web Audio API Mocks
    const mockAnalyser = {
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        frequencyBinCount: 128,
        getByteFrequencyData: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
    };

    const mockSource = {
        connect: vi.fn(),
        disconnect: vi.fn(),
    };

    const mockAudioContext = {
        createAnalyser: vi.fn().mockReturnValue(mockAnalyser),
        createMediaStreamSource: vi.fn().mockReturnValue(mockSource),
        close: vi.fn(),
    };

    const mockStream = {
        getAudioTracks: vi.fn().mockReturnValue([{ id: 'track-1', kind: 'audio' }]),
    } as any as MediaStream;

    // Save original globals
    const originalAudioContext = global.AudioContext;

    beforeEach(() => {
        vi.useFakeTimers();
        global.AudioContext = vi.fn().mockImplementation(() => mockAudioContext) as any;

        // Reset mocks
        mockAnalyser.getByteFrequencyData.mockReset();
        mockSource.connect.mockClear();
        mockSource.disconnect.mockClear();
        mockAudioContext.close.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
        global.AudioContext = originalAudioContext;
    });

    it('should return false initially', () => {
        const { result } = renderHook(() => useAudioDetection(mockStream));
        expect(result.current).toBe(false);
    });

    it('should return false if no stream provided', () => {
        const { result } = renderHook(() => useAudioDetection(null));
        expect(result.current).toBe(false);
        expect(global.AudioContext).not.toHaveBeenCalled();
    });

    it('should detect speaking when volume exceeds threshold', () => {
        const { result } = renderHook(() => useAudioDetection(mockStream, 0.1));

        // Mock high volume data
        mockAnalyser.getByteFrequencyData.mockImplementation((array: Uint8Array) => {
            array.fill(200); // 200/255 = ~0.78 which is > 0.1
        });

        // Fast-forward interval
        act(() => {
            vi.advanceTimersByTime(100);
        });

        expect(result.current).toBe(true);
    });

    it('should detect silence when volume is below threshold', () => {
        const { result } = renderHook(() => useAudioDetection(mockStream, 0.5));

        // Mock low volume data
        mockAnalyser.getByteFrequencyData.mockImplementation((array: Uint8Array) => {
            array.fill(10); // 10/255 = ~0.04 which is < 0.5
        });

        // Fast-forward interval
        act(() => {
            vi.advanceTimersByTime(100);
        });

        expect(result.current).toBe(false);
    });

    it('should clean up AudioContext resources on unmount', () => {
        const { unmount } = renderHook(() => useAudioDetection(mockStream));

        unmount();

        expect(mockSource.disconnect).toHaveBeenCalled();
        expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('should not initialize if enabled is false', () => {
        renderHook(() => useAudioDetection(mockStream, 0.1, false));
        expect(global.AudioContext).not.toHaveBeenCalled();
    });
});
