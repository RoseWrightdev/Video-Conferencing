import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createParticipantSlice } from '@/store/slices/participantSlice';
import { type RoomStoreState, type Participant } from '@/store/types';

describe('Participant Notification Logic', () => {
    let mockGet: () => Partial<RoomStoreState>;
    let mockSet: (fn: (state: Partial<RoomStoreState>) => Partial<RoomStoreState>) => void;
    let slice: ReturnType<typeof createParticipantSlice>;
    let currentState: Partial<RoomStoreState>;

    beforeEach(() => {
        currentState = {
            participants: new Map(),
            raisingHandParticipants: new Set(),
            unreadParticipantsCount: 0,
            isParticipantsPanelOpen: false,
        };

        mockGet = () => currentState;
        mockSet = (param) => {
            const updates = typeof param === 'function' ? param(currentState) : param;
            currentState = { ...currentState, ...updates };
        };

        slice = createParticipantSlice(mockSet as any, mockGet as any, {} as any);
        // Merge slice methods into currentState
        Object.assign(currentState, slice);
    });

    it('should initialize with unread count 0 and panel closed', () => {
        expect(slice.unreadParticipantsCount).toBe(0);
        expect(slice.isParticipantsPanelOpen).toBe(false);
    });

    it('should increment unread count when participant joins and panel is closed', () => {
        slice.addParticipant({ id: 'p1', username: 'User 1' } as Participant);
        expect(currentState.unreadParticipantsCount).toBe(1);
    });

    it('should NOT increment unread count when participant joins and panel is OPEN', () => {
        slice.toggleParticipantsPanel(); // Open panel
        expect(currentState.isParticipantsPanelOpen).toBe(true);
        expect(currentState.unreadParticipantsCount).toBe(0);

        slice.addParticipant({ id: 'p1', username: 'User 1' } as Participant);
        expect(currentState.unreadParticipantsCount).toBe(0);
    });

    it('should increment unread count when hand is raised and panel is closed', () => {
        slice.setHandRaised('p1', true);
        expect(currentState.unreadParticipantsCount).toBe(1);
    });

    it('should NOT increment unread count when hand is raised and panel is OPEN', () => {
        slice.toggleParticipantsPanel(); // Open panel
        slice.setHandRaised('p1', true);
        expect(currentState.unreadParticipantsCount).toBe(0);
    });

    it('should reset unread count when opening the panel', () => {
        slice.addParticipant({ id: 'p1' } as Participant);
        slice.setHandRaised('p1', true);
        expect(currentState.unreadParticipantsCount).toBe(2);

        slice.toggleParticipantsPanel();
        expect(currentState.isParticipantsPanelOpen).toBe(true);
        expect(currentState.unreadParticipantsCount).toBe(0);
    });
});
