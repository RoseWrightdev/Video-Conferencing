import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useParticipants } from '@/hooks/useParticipants';
import { useRoomStore } from '@/store/useRoomStore';

// Mock the store
vi.mock('@/store/useRoomStore');

describe('useParticipants', () => {
    const mockAdmitParticipant = vi.fn();
    const mockRemoveParticipant = vi.fn();
    const mockSetParticipantStream = vi.fn();

    const mockParticipants = new Map([
        ['user-1', { id: 'user-1', username: 'Alice', role: 'host' as const }],
        ['user-2', { id: 'user-2', username: 'Bob', role: 'participant' as const }],
    ]);

    const mockWaitingParticipants = new Map([
        ['user-3', { id: 'user-3', username: 'Charlie', role: 'waiting' as const }],
    ]);

    const mockMediaStates = new Map([
        ['user-1', {
            isAudioEnabled: true,
            isVideoEnabled: true,
            isScreenSharing: false,
            isHandRaised: false,
            isSpeaking: false,
        }],
        ['user-2', {
            isAudioEnabled: false,
            isVideoEnabled: true,
            isScreenSharing: false,
            isHandRaised: true,
            isSpeaking: true,
        }],
    ]);

    beforeEach(() => {
        vi.clearAllMocks();

        (useRoomStore as any).mockReturnValue({
            participants: mockParticipants,
            waitingParticipants: mockWaitingParticipants,
            mediaStates: mockMediaStates,
            currentUserId: 'user-1',
            admitParticipant: mockAdmitParticipant,
            removeParticipant: mockRemoveParticipant,
            setParticipantStream: mockSetParticipantStream,
        });
    });

    describe('Basic functionality', () => {
        it('should return participants list', () => {
            const { result } = renderHook(() => useParticipants());

            expect(result.current.participants).toEqual(mockParticipants);
            expect(result.current.participants.size).toBe(2);
        });

        it('should return waiting participants list', () => {
            const { result } = renderHook(() => useParticipants());

            expect(result.current.waitingParticipants).toEqual(mockWaitingParticipants);
            expect(result.current.waitingParticipants.size).toBe(1);
        });

        it('should return media states', () => {
            const { result } = renderHook(() => useParticipants());

            expect(result.current.mediaStates).toEqual(mockMediaStates);
        });

        it('should return current user ID', () => {
            const { result } = renderHook(() => useParticipants());

            expect(result.current.currentUserId).toBe('user-1');
        });
    });

    describe('Computed values', () => {
        it('should calculate participant count', () => {
            const { result } = renderHook(() => useParticipants());

            expect(result.current.participantCount).toBe(2);
        });

        it('should calculate waiting count', () => {
            const { result } = renderHook(() => useParticipants());

            expect(result.current.waitingCount).toBe(1);
        });

        it('should identify speaking participants', () => {
            const { result } = renderHook(() => useParticipants());

            expect(result.current.speakingParticipants.size).toBe(1);
            expect(result.current.speakingParticipants.has('user-2')).toBe(true);
        });

        it('should handle empty participants', () => {
            (useRoomStore as any).mockReturnValue({
                participants: new Map(),
                waitingParticipants: new Map(),
                mediaStates: new Map(),
                currentUserId: null,
                admitParticipant: mockAdmitParticipant,
                removeParticipant: mockRemoveParticipant,
                setParticipantStream: mockSetParticipantStream,
            });

            const { result } = renderHook(() => useParticipants());

            expect(result.current.participantCount).toBe(0);
            expect(result.current.waitingCount).toBe(0);
            expect(result.current.speakingParticipants.size).toBe(0);
        });
    });

    describe('getParticipant', () => {
        it('should get participant by ID', () => {
            const { result } = renderHook(() => useParticipants());

            const participant = result.current.getParticipant('user-1');

            expect(participant).toBeDefined();
            expect(participant?.username).toBe('Alice');
            expect(participant?.role).toBe('host');
        });

        it('should return undefined for non-existent participant', () => {
            const { result } = renderHook(() => useParticipants());

            const participant = result.current.getParticipant('non-existent');

            expect(participant).toBeUndefined();
        });
    });

    describe('getParticipantMediaState', () => {
        it('should get media state by ID', () => {
            const { result } = renderHook(() => useParticipants());

            const mediaState = result.current.getParticipantMediaState('user-1');

            expect(mediaState).toBeDefined();
            expect(mediaState?.isAudioEnabled).toBe(true);
            expect(mediaState?.isVideoEnabled).toBe(true);
        });

        it('should return undefined for non-existent media state', () => {
            const { result } = renderHook(() => useParticipants());

            const mediaState = result.current.getParticipantMediaState('non-existent');

            expect(mediaState).toBeUndefined();
        });
    });

    describe('admitParticipant', () => {
        it('should admit a waiting participant', () => {
            const { result } = renderHook(() => useParticipants());

            act(() => {
                result.current.admitParticipant('user-3');
            });

            expect(mockAdmitParticipant).toHaveBeenCalledWith('user-3');
            expect(mockAdmitParticipant).toHaveBeenCalledTimes(1);
        });
    });

    describe('removeParticipant', () => {
        it('should remove a participant', () => {
            const { result } = renderHook(() => useParticipants());

            act(() => {
                result.current.removeParticipant('user-2');
            });

            expect(mockRemoveParticipant).toHaveBeenCalledWith('user-2');
            expect(mockRemoveParticipant).toHaveBeenCalledTimes(1);
        });
    });
});
