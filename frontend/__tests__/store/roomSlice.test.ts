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

describe('roomSlice', () => {
    let mockGet: () => Partial<RoomStoreState>;
    let mockSet: (fn: (state: Partial<RoomStoreState>) => Partial<RoomStoreState>) => void;
    let slice: ReturnType<typeof createRoomSlice>;
    let currentState: Partial<RoomStoreState>;

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.capturedOnStateChange = undefined; // Reset capture
        mockConnect.mockResolvedValue(undefined);

        currentState = {
            roomId: null,
            isJoined: false,
            currentUserId: null,
            connectionState: {
                isInitializing: false,
                wsConnected: false,
                wsReconnecting: false,
                webrtcConnected: false,
            },
            // Mock dependency methods
            updateConnectionState: vi.fn(((update: Partial<ConnectionState>) => {
                currentState.connectionState = { ...currentState.connectionState, ...update } as ConnectionState;
            }) as any),
            handleError: vi.fn(),
            setParticipantStream: vi.fn(),
            setLocalStream: vi.fn(),
        } as any;

        mockGet = () => currentState;
        mockSet = (param: any) => {
            const updates = typeof param === 'function' ? param(currentState) : param;
            currentState = { ...currentState, ...updates };
        };

        // Instantiate Slice directly
        // createRoomSlice(set, get, api)
        slice = createRoomSlice(mockSet as any, mockGet as any, {} as any);

        // Merge slice initial state into currentState
        currentState = { ...currentState, ...slice };
    });

    it('should have initial state', () => {
        expect(slice.roomId).toBeNull();
        expect(slice.isJoined).toBe(false);
    });

    it('initializeRoom should call roomClient.connect and set loading state', async () => {
        const roomId = 'test-room';
        const username = 'test-user';

        // Check pre-condition
        expect(currentState.connectionState?.isInitializing).toBe(false);

        // Run action
        const promise = slice.initializeRoom(roomId, username, 'token');

        // Assert immediate loading state
        // Note: The mock updateConnectionState updates currentState, so we verify that.
        expect(currentState.connectionState?.isInitializing).toBe(true);
        expect(currentState.roomId).toBe(roomId);
        expect(currentState.currentUsername).toBe(username);

        await promise;

        // Verify RoomClient usage
        expect(mockConnect).toHaveBeenCalledWith(roomId, username, 'token', 'en');

        // Verify legacy clients are attached
        expect(currentState.wsClient).toBe(mockWs);
        expect(currentState.sfuClient).toBe(mockSfu);
    });

    it('leaveRoom should call roomClient.disconnect and reset state', () => {
        // Setup initial "joined" state
        currentState = {
            ...currentState,
            roomId: 'test-room',
            isJoined: true,
            isWaitingRoom: true,
            participants: new Map([['1', {}]]),
            messages: [{ id: '1', text: 'hi' }]
        } as any;

        slice.leaveRoom();

        expect(mockDisconnect).toHaveBeenCalled();
        expect(currentState.setLocalStream).toHaveBeenCalledWith(null);

        expect(currentState.roomId).toBeNull();
        expect(currentState.isJoined).toBe(false);
        expect(currentState.isWaitingRoom).toBe(false);
        expect(currentState.participants?.size).toBe(0);
        expect(currentState.messages?.length).toBe(0);
    });

    it('should update unreadCount when new messages arrive and panel is closed', () => {
        // Initial state: panel closed, 0 unread
        currentState = {
            ...currentState,
            isChatPanelOpen: false,
            unreadCount: 0,
            messages: []
        } as any;

        // Ensure mock captured the callback
        expect(mocks.capturedOnStateChange).toBeDefined();

        // Simulate new message from RoomClient
        const newMessage = { id: '1', content: 'hello' };
        mocks.capturedOnStateChange!({
            messages: [newMessage]
        });

        // Should increment unread count
        // Note: The slice implementation uses `set` which calls `mockSet` which updates `currentState`.
        expect(currentState.unreadCount).toBe(1);
        expect(currentState.messages).toHaveLength(1);

        // Simulate another message
        const message2 = { id: '2', content: 'world' };
        mocks.capturedOnStateChange!({
            messages: [newMessage, message2]
        });

        expect(currentState.unreadCount).toBe(2);

        // Simulate opening panel
        currentState.isChatPanelOpen = true;
        currentState.unreadCount = 0; // Reset manually

        // Simulate message while open
        const message3 = { id: '3', content: 'test' };
        mocks.capturedOnStateChange!({
            messages: [newMessage, message2, message3]
        });

        // Should NOT increment
        expect(currentState.unreadCount).toBe(0);
    });
});

