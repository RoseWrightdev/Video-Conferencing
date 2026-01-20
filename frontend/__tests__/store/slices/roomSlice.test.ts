import { describe, it, expect } from 'vitest';
import { createRoomSlice } from '@/store/slices/roomSlice';
import { createStore } from 'zustand/vanilla';
import { RoomStoreState } from '@/store/types';

// Mock Slice Creator helper
const createTestStore = () => {
    // Try non-curried syntax if the curried one failed
    return createStore<RoomStoreState>((set, get, store) => {
        const roomSlice = createRoomSlice(set, get, store);
        return {
            ...roomSlice,
            messages: [],
            participants: new Map(),
            waitingParticipants: new Map(),
            captions: [],
            isCaptionsEnabled: false
        } as any;
    });
};

describe('roomSlice - Captions', () => {
    it('should add a caption', () => {
        const store = createTestStore();
        const { addCaption } = store.getState();

        const caption = {
            sessionId: 's1',
            text: 'Hello',
            isFinal: true,
            confidence: 1.0,
            timestamp: 123
        };

        addCaption(caption);

        expect(store.getState().captions).toHaveLength(1);
        expect(store.getState().captions[0]).toEqual(caption);
    });

    it('should limit captions to 50', () => {
        const store = createTestStore();
        const { addCaption } = store.getState();

        for (let i = 0; i < 60; i++) {
            addCaption({
                sessionId: 's1',
                text: `Msg ${i}`,
                isFinal: true,
                confidence: 1.0,
                timestamp: i
            });
        }

        const captions = store.getState().captions;
        expect(captions).toHaveLength(50);
        expect(captions[49].text).toBe('Msg 59');
        expect(captions[0].text).toBe('Msg 10');
    });
});
