import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaStreamLifecycle } from '../../hooks/useMediaStreamLifecycle';

describe('useMediaStreamLifecycle', () => {
    let mockStream: any;
    let mockTrack: any;
    let eventListeners: Record<string, Function[]> = {};

    beforeEach(() => {
        eventListeners = {};

        const addEventListener = vi.fn((event: string, handler: Function) => {
            if (!eventListeners[event]) eventListeners[event] = [];
            eventListeners[event].push(handler);
        });

        const removeEventListener = vi.fn((event: string, handler: Function) => {
            if (!eventListeners[event]) return;
            eventListeners[event] = eventListeners[event].filter(h => h !== handler);
        });

        const dispatchEvent = (event: string, data?: any) => {
            if (eventListeners[event]) {
                eventListeners[event].forEach(h => h(data));
            }
        };

        mockTrack = {
            id: 'track-1',
            kind: 'video',
            addEventListener: vi.fn(), // We'll override per instance or use global mock logic if needed
            removeEventListener: vi.fn(),
        };

        // Simple mock for EventTarget behavior
        const createMockEventTarget = () => {
            const listeners: Record<string, Function[]> = {};
            return {
                addEventListener: vi.fn((e, h) => {
                    if (!listeners[e]) listeners[e] = [];
                    listeners[e].push(h);
                }),
                removeEventListener: vi.fn((e, h) => {
                    if (!listeners[e]) return;
                    listeners[e] = listeners[e].filter(listener => listener !== h);
                }),
                dispatchEvent: (e: string, arg?: any) => {
                    if (listeners[e]) listeners[e].forEach(h => h(arg));
                },
                getTracks: () => [mockTrack],
                getVideoTracks: () => [mockTrack],
                getAudioTracks: () => [],
            };
        };

        const streamTarget = createMockEventTarget();
        mockStream = {
            ...streamTarget,
            // Override track methods
            getTracks: vi.fn().mockReturnValue([mockTrack]),
            getVideoTracks: vi.fn().mockReturnValue([mockTrack]),
            getAudioTracks: vi.fn().mockReturnValue([]),
        };

        // Attach event target mock to track too
        const trackTarget = createMockEventTarget();
        Object.assign(mockTrack, trackTarget);
    });

    it('should return initial stream state', () => {
        const { result } = renderHook(() => useMediaStreamLifecycle(mockStream));

        expect(result.current.stream).toBe(mockStream);
        expect(result.current.videoTracks).toHaveLength(1);
        expect(result.current.version).toBe(0);
    });

    it('should re-render on track mute event', () => {
        const { result } = renderHook(() => useMediaStreamLifecycle(mockStream));
        const initialVersion = result.current.version;

        act(() => {
            mockTrack.dispatchEvent('mute');
        });

        expect(result.current.version).toBeGreaterThan(initialVersion);
    });

    it('should re-render on stream addtrack event', () => {
        const { result } = renderHook(() => useMediaStreamLifecycle(mockStream));
        const initialVersion = result.current.version;

        const newTrack = { ...mockTrack, id: 'track-2' };

        act(() => {
            mockStream.dispatchEvent('addtrack', { track: newTrack });
        });

        expect(result.current.version).toBeGreaterThan(initialVersion);
    });

    it('should cleanup listeners on unmount', () => {
        const { unmount } = renderHook(() => useMediaStreamLifecycle(mockStream));

        unmount();

        expect(mockTrack.removeEventListener).toHaveBeenCalledWith('mute', expect.any(Function));
        expect(mockStream.removeEventListener).toHaveBeenCalledWith('addtrack', expect.any(Function));
    });

    it('should handle null stream gracefully', () => {
        const { result } = renderHook(() => useMediaStreamLifecycle(null));
        expect(result.current.stream).toBeNull();
    });
});
