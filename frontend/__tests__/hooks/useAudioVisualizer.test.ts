import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAudioVisualizer } from '../../hooks/useAudioVisualizer';
import { Participant } from '../../store/types';

// Mock logger
vi.mock('../../lib/logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })
}));

describe('useAudioVisualizer', () => {
    let audioContextMock: any;
    let analyserMock: any;
    let sourceMock: any;
    let setSpeakingParticipants: any;

    beforeEach(() => {
        // Mock AudioContext and related nodes
        analyserMock = {
            fftSize: 0,
            smoothingTimeConstant: 0,
            disconnect: vi.fn(),
            getByteFrequencyData: vi.fn((array) => {
                // Simulate silence by default
                array.fill(0);
            }),
        };

        sourceMock = {
            connect: vi.fn(),
            disconnect: vi.fn(),
        };

        audioContextMock = {
            createMediaStreamSource: vi.fn().mockReturnValue(sourceMock),
            createAnalyser: vi.fn().mockReturnValue(analyserMock),
            resume: vi.fn(),
            close: vi.fn(),
            state: 'running',
        };

        global.AudioContext = vi.fn().mockImplementation(() => audioContextMock) as any;
        (window as any).webkitAudioContext = global.AudioContext;

        global.MediaStream = vi.fn().mockImplementation(() => ({
            id: 'mock-stream',
            getAudioTracks: () => [{ kind: 'audio' }]
        })) as any;

        setSpeakingParticipants = vi.fn();

        // Mock requestAnimationFrame
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            // Do NOT auto-loop to avoid infinite loops in tests. 
            // We can manually call logic if exposed, but for now we just verify setup.
            // Or better: trigger it once.
            return 123;
        });
        vi.spyOn(window, 'cancelAnimationFrame');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should setup audio detection for local user', () => {
        const localStream = {
            id: 'local-stream',
            getAudioTracks: () => [{ id: 'track-1', kind: 'audio' }]
        } as any;

        renderHook(() => useAudioVisualizer({
            currentUserId: 'me',
            localStream,
            isAudioEnabled: true,
            participants: new Map(),
            unmutedParticipants: new Set(),
            setSpeakingParticipants
        }));

        expect(global.AudioContext).toHaveBeenCalled();
        expect(audioContextMock.createMediaStreamSource).toHaveBeenCalled();
        expect(sourceMock.connect).toHaveBeenCalled();
    });

    it('should cleanup on unmount', () => {
        const localStream = {
            id: 'local-stream',
            getAudioTracks: () => [{ id: 'track-1', kind: 'audio' }]
        } as any;

        const { unmount } = renderHook(() => useAudioVisualizer({
            currentUserId: 'me',
            localStream,
            isAudioEnabled: true,
            participants: new Map(),
            unmutedParticipants: new Set(),
            setSpeakingParticipants
        }));

        unmount();

        // Note: useAudioVisualizer currently only cleans up logic in effect return, 
        // does not close AudioContext unless component unmounts for good (separate effect).
        expect(sourceMock.disconnect).toHaveBeenCalled();
        expect(analyserMock.disconnect).toHaveBeenCalled();
    });

    it('should setup detection for remote participants', () => {
        const remoteStream = {
            id: 'remote-stream',
            getAudioTracks: () => [{ id: 'track-2', kind: 'audio' }]
        } as any;

        const participants = new Map<string, Participant>();
        participants.set('user2', {
            id: 'user2',
            stream: remoteStream,
            isAudioEnabled: true,
            username: 'User 2',
            role: 'participant',
            isVideoEnabled: true,
            isScreenSharing: false,
            isHandRaised: false
        });

        renderHook(() => useAudioVisualizer({
            currentUserId: 'me',
            localStream: null,
            isAudioEnabled: false,
            participants,
            unmutedParticipants: new Set(['user2']),
            setSpeakingParticipants
        }));

        expect(audioContextMock.createMediaStreamSource).toHaveBeenCalledTimes(1);
    });
});
