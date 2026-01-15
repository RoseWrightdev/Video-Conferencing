import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoomPage from '../../app/(room)/[roomid]/page';
import { useRoomStore } from '@/store/useRoomStore';

// Mock dependencies
vi.mock('next/navigation', () => ({
    useParams: () => ({ roomid: 'test-room-123' }),
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-auth/react', () => ({
    useSession: () => ({
        data: {
            user: { name: 'TestUser' },
            accessToken: 'mock-token-123'
        },
        status: 'authenticated',
    }),
    signIn: vi.fn(),
}));

vi.mock('@/hooks/useMediaStream', () => ({
    useMediaStream: () => ({
        requestPermissions: vi.fn().mockResolvedValue(true),
        refreshDevices: vi.fn(),
    }),
}));

// Mock child components and hooks
vi.mock('@/hooks', () => ({
    useRoom: (params?: any) => ({
        currentUserId: null,
        connectionState: {
            wsConnected: false,
            wsReconnecting: false,
            isInitializing: false,
            lastError: null,
        },
        isKicked: false,
        isJoined: false,
        isHost: false,
        roomId: params?.roomId || null,
        roomName: '',
        isWaitingRoom: false,
        isRoomReady: false,
        hasConnectionIssues: false,
        joinRoomWithAuth: vi.fn(),
        exitRoom: vi.fn(),
        updateRoomSettings: vi.fn(),
        clearError: vi.fn(),
    }),
    useChat: () => ({
        isChatPanelOpen: false,
        toggleChatPanel: vi.fn(),
    }),
}));

vi.mock('@/hooks/useAudioDetection', () => ({
    useAudioDetection: () => new Set(),
}));

vi.mock('@/components/room/ActiveRoom', () => ({
    ActiveRoom: () => <div>Active Room Mock</div>,
}));

vi.mock('@/components/room/WaitingScreen', () => ({
    WaitingScreen: () => <div>Waiting Screen Mock</div>,
}));

vi.mock('@/components/room/LoadingScreen', () => ({
    LoadingScreen: () => <div>Loading Screen Mock</div>,
}));

const { mockInitializeRoom, mockHandleError } = vi.hoisted(() => ({
    mockInitializeRoom: vi.fn(),
    mockHandleError: vi.fn(),
}));

const mockConnectionState = {
    wsConnected: false,
    wsReconnecting: false,
    isInitializing: false,
    lastError: null
};

vi.mock('@/store/useRoomStore', () => {
    const state = {
        roomId: null,
        roomName: '',
        connectionState: { isInitializing: false, lastError: null, wsConnected: false },
        isJoined: false,
        isHost: false,
        isKicked: false,
        isWaitingRoom: false,
        participants: new Map(),
        initializeRoom: mockInitializeRoom, // The spy
        handleError: mockHandleError,
        clearError: vi.fn(),
        updateRoomSettings: vi.fn(),
        leaveRoom: vi.fn(),
        screenShareStream: null,
        raisingHandParticipants: new Set(),
        unmutedParticipants: new Set(),
        cameraOnParticipants: new Set(),
        sharingScreenParticipants: new Set(),
        gridLayout: 'grid',
        currentUserId: null,
        // ActiveRoom props
        toggleSettingsPanel: vi.fn(),
        setGridLayout: vi.fn(),
        pinParticipant: vi.fn(),
    };

    const useRoomStoreMock = (selector: any) => {
        if (selector) return selector(state);
        return state;
    };

    // attach getState
    (useRoomStoreMock as any).getState = () => state;
    return { useRoomStore: useRoomStoreMock };
});


describe('RoomPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInitializeRoom.mockResolvedValue(undefined);
    });

    it('triggers initializeRoom with token when user joins lobby', async () => {
        render(<RoomPage />);

        screen.debug();

        // 2. User should see "Join Room" or "Request Permissions" (PermissionScreen)
        // Find the button to request permissions / join
        const joinButton = await screen.findByRole('button');

        fireEvent.click(joinButton);

        // 3. This sets hasJoinedLobby = true
        // 4. useRoom hook should re-run effect with autoJoin=true
        // 5. initializeRoom should be called

        await waitFor(() => {
            expect(mockInitializeRoom).toHaveBeenCalled();
        });

        // Check arguments: initializeRoom(roomId, username, token)
        expect(mockInitializeRoom).toHaveBeenCalledWith(
            'test-room-123',
            'TestUser',
            'mock-token-123'
        );
    });
});
