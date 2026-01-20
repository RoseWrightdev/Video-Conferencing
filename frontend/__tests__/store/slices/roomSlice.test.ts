import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoomSlice } from '@/store/slices/roomSlice';
import { createStore } from 'zustand/vanilla';
import { RoomStoreState } from '@/store/types';
import { summarizeMeeting } from '@/lib/api';

// Mock API
vi.mock('@/lib/api', () => ({
    summarizeMeeting: vi.fn(),
}));

// Mock RoomClient
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockSetTargetLanguage = vi.fn();

vi.mock('@/lib/RoomClient', () => ({
    RoomClient: vi.fn().mockImplementation((onStateChange) => ({
        connect: mockConnect,
        disconnect: mockDisconnect,
        setTargetLanguage: mockSetTargetLanguage,
        // Expose callback for testing
        __triggerStateChange: onStateChange,
        ws: {},
        sfu: {},
    })),
}));

// Helper to create store
const createTestStore = () => {
    return createStore<RoomStoreState>((set, get, store) => {
        const roomSlice = createRoomSlice(set, get, store);
        return {
            ...roomSlice,
            messages: [],
            participants: new Map(),
            waitingParticipants: new Map(),
            captions: [],
            isCaptionsEnabled: false,
            isChatPanelOpen: false,
            isParticipantsPanelOpen: false,
            unreadCount: 0,
            unreadParticipantsCount: 0,
            connectionState: { isInitializing: false },
            updateConnectionState: (update: any) => set(state => ({ connectionState: { ...state.connectionState, ...update } })),
            handleError: vi.fn(),
        } as any;
    });
};

describe('roomSlice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Captions', () => {
        it('should add a caption', () => {
            const store = createTestStore();
            const { addCaption } = store.getState();
            addCaption({ sessionId: 's1', text: 'Hello', isFinal: true, confidence: 1.0, timestamp: 123 });
            expect(store.getState().captions).toHaveLength(1);
        });

        it('should limit captions to 50', () => {
            const store = createTestStore();
            const { addCaption } = store.getState();
            for (let i = 0; i < 60; i++) {
                addCaption({ sessionId: 's1', text: `Msg ${i}`, isFinal: true, confidence: 1.0, timestamp: i });
            }
            expect(store.getState().captions).toHaveLength(50);
            expect(store.getState().captions[49].text).toBe('Msg 59');
        });
    });

    describe('Summary Generation', () => {
        it('should handle successful summary generation', async () => {
            const store = createTestStore();
            store.setState({ roomId: 'test-room' });

            (summarizeMeeting as any).mockResolvedValue({
                summary: 'Test Summary',
                action_items: ['Item 1']
            });

            const promise = store.getState().generateSummary();

            // Check loading state
            expect(store.getState().isGeneratingSummary).toBe(true);

            await promise;

            expect(store.getState().isGeneratingSummary).toBe(false);
            expect(store.getState().summaryData).toBe('Test Summary');
            expect(store.getState().actionItems).toEqual(['Item 1']);
        });

        it('should handle summary generation error', async () => {
            const store = createTestStore();
            store.setState({ roomId: 'test-room' });

            (summarizeMeeting as any).mockRejectedValue(new Error('API Error'));

            await store.getState().generateSummary();

            expect(store.getState().isGeneratingSummary).toBe(false);
            expect(store.getState().summaryData).toContain('Error generating summary');
        });
    });

    describe('Language Settings', () => {
        it('should update target language and notify client', () => {
            const store = createTestStore();
            const { setTargetLanguage } = store.getState();

            setTargetLanguage('es');

            expect(store.getState().targetLanguage).toBe('es');
            expect(mockSetTargetLanguage).toHaveBeenCalledWith('es');
        });
    });

    describe('Room State Updates (via RoomClient callback)', () => {
        it('should update unread count when new messages arrive and panel is closed', () => {
            const store = createTestStore();
            // Get the mocked client from the slice (it's exposed as roomClient)
            // But we need the trigger.
            // Since we mocked the constructor, we can access the instance if we saved it in the mock,
            // OR we can access usage via `createRoomSlice` closure.
            // Actually, `roomSlice` exposes `roomClient`.
            const client = store.getState().roomClient as any;

            // Trigger state change
            // Scenario: 1 existing message -> 2 messages (1 new)
            store.setState({ messages: [{ text: 'Old' }] as any, isChatPanelOpen: false, unreadCount: 0 });

            client.__triggerStateChange({
                messages: [{ text: 'Old' }, { text: 'New' }] as any
            });

            expect(store.getState().unreadCount).toBe(1);
        });

        it('should NOT update unread count if panel is open', () => {
            const store = createTestStore();
            const client = store.getState().roomClient as any;

            store.setState({ messages: [] as any, isChatPanelOpen: true, unreadCount: 0 });

            client.__triggerStateChange({
                messages: [{ text: 'New' }] as any
            });

            expect(store.getState().unreadCount).toBe(0);
        });
    });
});
