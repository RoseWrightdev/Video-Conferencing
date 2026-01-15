import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRoom } from '@/hooks/useRoom';
import { useRoomStore } from '@/store/useRoomStore';

// Hoist mock variable
const mockInitializeRoom = vi.hoisted(() => vi.fn());

// Mock the store
vi.mock('@/store/useRoomStore', () => {
    const state = {
        roomId: null,
        roomName: '',
        isJoined: false,
        isHost: false,
        isKicked: false,
        currentUsername: '',
        currentUserId: null,
        connectionState: {
            isInitializing: false,
            lastError: null,
            wsConnected: false,
            wsReconnecting: false,
        },
        isWaitingRoom: false,
        updateRoomSettings: vi.fn(),
        handleError: vi.fn(),
        clearError: vi.fn(),
        initializeRoom: mockInitializeRoom,
        leaveRoom: vi.fn(),
    };

    const useRoomStoreMock = (selector?: any) => {
        if (selector) return selector(state);
        return state;
    };

    (useRoomStoreMock as any).getState = () => state;

    return { useRoomStore: useRoomStoreMock };
});

describe('useRoom - Connection Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInitializeRoom.mockResolvedValue(undefined);
    });

    it('calls initializeRoom with correct parameters when autoJoin is true', async () => {
        const params = {
            roomId: 'test-room-123',
            username: 'TestUser',
            token: 'mock-token-abc',
            autoJoin: true,
        };

        renderHook(() => useRoom(params));

        // Wait for the effect to run
        await waitFor(() => {
            expect(mockInitializeRoom).toHaveBeenCalled();
        });

        // Verify it was called with the correct arguments
        expect(mockInitializeRoom).toHaveBeenCalledWith(
            'test-room-123',
            'TestUser',
            'mock-token-abc'
        );
    });

    it('does not call initializeRoom when autoJoin is false', async () => {
        const params = {
            roomId: 'test-room-123',
            username: 'TestUser',
            token: 'mock-token-abc',
            autoJoin: false,
        };

        renderHook(() => useRoom(params));

        // Wait a bit to ensure no call is made
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockInitializeRoom).not.toHaveBeenCalled();
    });

    it('does not call initializeRoom when token is missing', async () => {
        const params = {
            roomId: 'test-room-123',
            username: 'TestUser',
            token: undefined,
            autoJoin: true,
        };

        renderHook(() => useRoom(params));

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockInitializeRoom).not.toHaveBeenCalled();
    });
});
