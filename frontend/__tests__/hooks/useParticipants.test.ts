import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useParticipants } from '@/hooks/useParticipants';
import { useRoomStore } from '@/store/useRoomStore';

// Mock the store module explicitly
vi.mock('@/store/useRoomStore', () => ({
    useRoomStore: vi.fn()
}));

describe('useParticipants', () => {
    const mockApproveParticipant = vi.fn();
    const mockKickParticipant = vi.fn();
    const mockToggleAudio = vi.fn();
    const mockToggleVideo = vi.fn();
    const mockSelectParticipant = vi.fn();
    const mockPinParticipant = vi.fn();

    // Store uses Maps/Sets internally
    const mockParticipantsMap = new Map([
        ['user-1', { id: 'user-1', username: 'Alice', role: 'host' as const }],
        ['user-2', { id: 'user-2', username: 'Bob', role: 'participant' as const }],
    ]);

    const mockWaitingParticipantsMap = new Map([
        ['user-3', { id: 'user-3', username: 'Charlie', role: 'waiting' as const }],
    ]);

    const mockRaisingHandSet = new Set(['user-2']);

    const defaultStoreState = {
        participants: mockParticipantsMap,
        localParticipant: { id: 'user-1', username: 'Alice' },
        raisingHandParticipants: mockRaisingHandSet,
        waitingParticipants: mockWaitingParticipantsMap,
        selectedParticipantId: null,
        pinnedParticipantId: null,
        isHost: true,
        approveParticipant: mockApproveParticipant,
        kickParticipant: mockKickParticipant,
        toggleParticipantAudio: mockToggleAudio,
        toggleParticipantVideo: mockToggleVideo,
        selectParticipant: mockSelectParticipant,
        pinParticipant: mockPinParticipant,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Default return value for the hook
        (useRoomStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(defaultStoreState);
    });

    describe('Basic functionality', () => {
        it('should return participants list as array', () => {
            const { result } = renderHook(() => useParticipants());
            // Hook converts Map -> Array
            expect(result.current.participants).toHaveLength(2);
            expect(result.current.participants.some(p => p.username === 'Alice')).toBe(true);
            expect(result.current.participants.some(p => p.username === 'Bob')).toBe(true);
        });

        it('should return pending participants (waiting room)', () => {
            const { result } = renderHook(() => useParticipants());
            // Hook returns the Map directly or Array? 
            // Checking implementation: "pendingParticipants: waitingParticipants" -> waitingParticipants is Map in store.
            // Let's assume Map based on previous inspection.
            expect(result.current.pendingParticipants).toBe(mockWaitingParticipantsMap);
        });

        it('should return speaking participants (hand raised)', () => {
            const { result } = renderHook(() => useParticipants());
            // Hook filters participants based on raisingHandSet
            expect(result.current.speakingParticipants).toHaveLength(1);
            expect(result.current.speakingParticipants[0].id).toBe('user-2');
        });

        it('should return local participant', () => {
            const { result } = renderHook(() => useParticipants());
            expect(result.current.localParticipant?.id).toBe('user-1');
        });

        it('should return participant count', () => {
            const { result } = renderHook(() => useParticipants());
            expect(result.current.participantCount).toBe(2);
        });
    });

    describe('Helpers', () => {
        it('should get participant by ID', () => {
            const { result } = renderHook(() => useParticipants());
            const p = result.current.getParticipant('user-2');
            expect(p?.username).toBe('Bob');
        });

        it('should check if participant is speaking (hand raised)', () => {
            const { result } = renderHook(() => useParticipants());
            expect(result.current.isParticipantSpeaking('user-2')).toBe(true);
            expect(result.current.isParticipantSpeaking('user-1')).toBe(false);
        });
    });

    describe('Actions', () => {
        it('should expose host actions when isHost is true', () => {
            const { result } = renderHook(() => useParticipants());
            // Using 'any' to bypass strict type checking if the interface logic is complex in test
            const current = result.current as any;
            expect(current.approveParticipant).toBeDefined();
            expect(current.kickParticipant).toBeDefined();
        });

        it('should NOT expose host actions when isHost is false', () => {
            (useRoomStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
                ...defaultStoreState,
                isHost: false
            });
            const { result } = renderHook(() => useParticipants());
            const current = result.current as any;
            expect(current.approveParticipant).toBeUndefined();
        });
    });
});
