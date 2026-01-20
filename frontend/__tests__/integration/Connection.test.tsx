import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RoomPage from '../../app/(room)/[roomid]/page';

// Use vi.hoisted to create mocks that can be accessed in vi.mock factories
const { mockInitializeRoom, mockHandleError } = vi.hoisted(() => ({
    mockInitializeRoom: vi.fn(),
    mockHandleError: vi.fn(),
}));

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

// Create a mock requestPermissions that we can track
const mockRequestPermissions = vi.fn().mockResolvedValue(true);

vi.mock('@/hooks/useMediaStream', () => ({
    useMediaStream: () => ({
        requestPermissions: mockRequestPermissions,
        refreshDevices: vi.fn(),
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

// Mock the chat hook
vi.mock('@/hooks/useChat', () => ({
    useChat: () => ({
        isChatPanelOpen: false,
        toggleChatPanel: vi.fn(),
    }),
}));

// Mock the store but keep the real useRoom hook
vi.mock('@/store/useRoomStore', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { create } = require('zustand');

    // Create mock store using actual zustand create
    const useRoomStoreMock = create((set: any, _get: any) => ({
        roomId: null,
        roomName: '',
        connectionState: {
            isInitializing: false,
            lastError: null,
            wsConnected: false,
            wsReconnecting: false
        },
        isJoined: false,
        isHost: false,
        isKicked: false,
        isWaitingRoom: false,
        participants: new Map(),
        // Make initializeRoom update the store state to simulate real behavior
        initializeRoom: async (...args: any[]) => {
            // Set initializing state
            set({
                connectionState: {
                    isInitializing: true,
                    lastError: null,
                    wsConnected: false,
                    wsReconnecting: false
                }
            });

            // Call the mock so we can verify it was called
            await mockInitializeRoom(...args);

            // Simulate successful initialization
            set({
                connectionState: {
                    isInitializing: false,
                    lastError: null,
                    wsConnected: true,
                    wsReconnecting: false
                },
                isJoined: true,
                roomId: args[0],
                currentUsername: args[1]
            });
        },
        handleError: mockHandleError,
        clearError: vi.fn(),
        updateRoomSettings: vi.fn(),
        leaveRoom: vi.fn(() => {
            set({
                isJoined: false,
                connectionState: {
                    isInitializing: false,
                    lastError: null,
                    wsConnected: false,
                    wsReconnecting: false
                }
            });
        }),
        screenShareStream: null,
        raisingHandParticipants: new Set(),
        unmutedParticipants: new Set(),
        cameraOnParticipants: new Set(),
        sharingScreenParticipants: new Set(),
        gridLayout: 'grid' as const,
        currentUserId: null,
        currentUsername: null,
        toggleSettingsPanel: vi.fn(),
        setGridLayout: vi.fn(),
        pinParticipant: vi.fn(),
    }));

    return { useRoomStore: useRoomStoreMock };
});


describe('RoomPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockInitializeRoom.mockResolvedValue(undefined);
        mockRequestPermissions.mockResolvedValue(true);
    });

    it('shows permission screen and calls initializeRoom when user grants permissions', async () => {
        render(<RoomPage />);

        // User should see the permission screen
        const joinButton = await screen.findByText('Allow Camera & Microphone');
        expect(joinButton).toBeDefined();

        // Verify initializeRoom hasn't been called yet
        expect(mockInitializeRoom).not.toHaveBeenCalled();

        // Click to grant permissions and join
        fireEvent.click(joinButton);

        // Wait for requestPermissions to be called and resolved
        await waitFor(() => {
            expect(mockRequestPermissions).toHaveBeenCalled();
        }, { timeout: 2000 });

        // After clicking, hasJoinedLobby becomes true, which triggers useRoom's autoJoin effect
        // The useRoom hook should call joinRoomWithAuth, which calls initializeRoom
        await waitFor(() => {
            expect(mockInitializeRoom).toHaveBeenCalled();
        }, { timeout: 5000 });

        // Verify it was called with the correct arguments
        expect(mockInitializeRoom).toHaveBeenCalledWith(
            'test-room-123',
            'TestUser',
            'mock-token-123'
        );
    });
});