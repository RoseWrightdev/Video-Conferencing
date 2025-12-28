import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoomSlice } from '../../store/slices/roomSlice';
import { RoomStoreState, ConnectionState } from '../../store/types';

// Mock RoomClient
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockWs = { send: vi.fn() };
const mockSfu = { join: vi.fn() };

const mocks = vi.hoisted(() => ({
    capturedOnStateChange: undefined as ((state: any) => void) | undefined
}));

vi.mock('@/lib/RoomClient', () => {
    return {
        RoomClient: vi.fn().mockImplementation((onStateChange) => {
            mocks.capturedOnStateChange = onStateChange;
            return {
                connect: mockConnect,
                disconnect: mockDisconnect,
                ws: mockWs,
                sfu: mockSfu,
            };
        }),
    };
});

describe('Waiting Room Notifications', () => {
    let mockGet: () => Partial<RoomStoreState>;
    let mockSet: (fn: (state: Partial<RoomStoreState>) => Partial<RoomStoreState>) => void;
    let slice: ReturnType<typeof createRoomSlice>;
    let currentState: Partial<RoomStoreState>;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.capturedOnStateChange = undefined;

        currentState = {
            roomId: null,
            isJoined: false,
            waitingParticipants: new Map(),
            isParticipantsPanelOpen: false,
            unreadParticipantsCount: 0,
            updateConnectionState: vi.fn(),
            handleError: vi.fn(),
            setLocalStream: vi.fn(),
        } as any;

        mockGet = () => currentState;
        mockSet = (param: any) => {
            const updates = typeof param === 'function' ? param(currentState) : param;
            currentState = { ...currentState, ...updates };
        };

        slice = createRoomSlice(mockSet as any, mockGet as any, {} as any);
    });

    it('should increment unreadParticipantsCount when new waiting participant joins and panel is CLOSED', () => {
        // Ensure mock captured the callback
        expect(mocks.capturedOnStateChange).toBeDefined();

        // Simulate initial state with 0 waiting
        expect(currentState.unreadParticipantsCount).toBe(0);

        // Simulate new waiting participant
        const newWaiting = new Map([['w1', { id: 'w1', role: 'waiting' }]]);
        mocks.capturedOnStateChange!({
            waitingParticipants: newWaiting
        });

        // Should increment unread count
        expect(currentState.unreadParticipantsCount).toBe(1);
        expect(currentState.waitingParticipants?.size).toBe(1);
    });

    it('should NOT increment unreadParticipantsCount when panel is OPEN', () => {
        currentState.isParticipantsPanelOpen = true;

        // Simulate new waiting participant
        const newWaiting = new Map([['w1', { id: 'w1', role: 'waiting' }]]);
        mocks.capturedOnStateChange!({
            waitingParticipants: newWaiting
        });

        // Should NOT increment
        expect(currentState.unreadParticipantsCount).toBe(0);
    });

    it('should NOT increment unreadParticipantsCount for SELF joining waiting room', () => {
        // Set current user ID
        currentState.currentUserId = 'me';

        // Update with self in waiting room
        const newWaiting = new Map([['me', { id: 'me', role: 'waiting' }]]);
        mocks.capturedOnStateChange!({
            waitingParticipants: newWaiting
        });

        expect(currentState.unreadParticipantsCount).toBe(0);
    });

    it('should increment unreadParticipantsCount when REGULAR participant joins', () => {
        currentState.participants = new Map();

        // Update with new participant
        const newParticipants = new Map([['p1', { id: 'p1', role: 'participant' }]]);
        mocks.capturedOnStateChange!({
            participants: newParticipants
        });

        expect(currentState.unreadParticipantsCount).toBe(1);
    });

    it('should NOT increment unreadParticipantsCount for SELF joining regular room', () => {
        currentState.currentUserId = 'me';
        currentState.participants = new Map();

        // Update with self
        const newParticipants = new Map([['me', { id: 'me', role: 'participant' }]]);
        mocks.capturedOnStateChange!({
            participants: newParticipants
        });

        expect(currentState.unreadParticipantsCount).toBe(0);
    });

    it('should only increment key for NEW waiting participants', () => {
        // Start with 1 waiting participant
        currentState.waitingParticipants = new Map([['w1', { id: 'w1' }]]) as any;

        // Update with same participant (no change)
        mocks.capturedOnStateChange!({
            waitingParticipants: new Map([['w1', { id: 'w1' }]])
        });
        expect(currentState.unreadParticipantsCount).toBe(0);

        // Update with new participant
        const updatedWaiting = new Map([
            ['w1', { id: 'w1' }],
            ['w2', { id: 'w2' }]
        ]);
        mocks.capturedOnStateChange!({
            waitingParticipants: updatedWaiting
        });

        expect(currentState.unreadParticipantsCount).toBe(1);
    });
});
