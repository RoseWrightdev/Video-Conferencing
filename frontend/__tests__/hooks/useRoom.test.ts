import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRoom } from '@/hooks/useRoom';
import { useRoomStore } from '@/store/useRoomStore';

// Mock the store
vi.mock('@/store/useRoomStore');

describe('useRoom', () => {
    const mockInitializeRoom = vi.fn();
    const mockLeaveRoom = vi.fn();
    const mockHandleError = vi.fn();
    const mockClearError = vi.fn();
    const mockUpdateRoomSettings = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup default mock implementation
        (useRoomStore as any).mockReturnValue({
            roomId: 'test-room',
            roomName: 'Test Room',
            isJoined: false,
            isHost: false,
            currentUsername: null,
            currentUserId: null,
            connectionState: {
                wsConnected: false,
                wsReconnecting: false,
                isInitializing: false,
            },
            isWaitingRoom: false,
            updateRoomSettings: mockUpdateRoomSettings,
            handleError: mockHandleError,
            clearError: mockClearError,
            initializeRoom: mockInitializeRoom,
            leaveRoom: mockLeaveRoom,
        });
    });

    afterEach(() => {
        vi.clearAllTimers();
    });

    describe('Basic functionality', () => {
        it('should return room state correctly', () => {
            const { result } = renderHook(() => useRoom());

            expect(result.current.roomId).toBe('test-room');
            expect(result.current.roomName).toBe('Test Room');
            expect(result.current.isJoined).toBe(false);
            expect(result.current.isHost).toBe(false);
        });

        it('should expose joinRoomWithAuth function', () => {
            const { result } = renderHook(() => useRoom());

            expect(result.current.joinRoomWithAuth).toBeDefined();
            expect(typeof result.current.joinRoomWithAuth).toBe('function');
        });

        it('should expose exitRoom function', () => {
            const { result } = renderHook(() => useRoom());

            expect(result.current.exitRoom).toBeDefined();
            expect(typeof result.current.exitRoom).toBe('function');
        });
    });

    describe('joinRoomWithAuth', () => {
        it('should call initializeRoom with correct parameters', async () => {
            const { result } = renderHook(() => useRoom());

            await result.current.joinRoomWithAuth('room-123', 'testuser', 'token-abc');

            expect(mockInitializeRoom).toHaveBeenCalledWith('room-123', 'testuser', 'token-abc');
            expect(mockInitializeRoom).toHaveBeenCalledTimes(1);
        });

        it('should not join if already initializing', async () => {
            (useRoomStore as any).mockReturnValue({
                ...useRoomStore(),
                connectionState: {
                    wsConnected: false,
                    wsReconnecting: false,
                    isInitializing: true,
                },
                initializeRoom: mockInitializeRoom,
                handleError: mockHandleError,
                clearError: mockClearError,
                updateRoomSettings: mockUpdateRoomSettings,
                leaveRoom: mockLeaveRoom,
            });

            const { result } = renderHook(() => useRoom());
            await result.current.joinRoomWithAuth('room-123', 'testuser', 'token-abc');

            expect(mockInitializeRoom).not.toHaveBeenCalled();
        });

        it('should not join if already joined', async () => {
            (useRoomStore as any).mockReturnValue({
                ...useRoomStore(),
                isJoined: true,
                connectionState: {
                    wsConnected: true,
                    wsReconnecting: false,
                    isInitializing: false,
                },
                initializeRoom: mockInitializeRoom,
                handleError: mockHandleError,
                clearError: mockClearError,
                updateRoomSettings: mockUpdateRoomSettings,
                leaveRoom: mockLeaveRoom,
            });

            const { result } = renderHook(() => useRoom());
            await result.current.joinRoomWithAuth('room-123', 'testuser', 'token-abc');

            expect(mockInitializeRoom).not.toHaveBeenCalled();
        });

        it('should handle error if token is missing', async () => {
            const { result } = renderHook(() => useRoom());
            await result.current.joinRoomWithAuth('room-123', 'testuser', '');

            expect(mockHandleError).toHaveBeenCalledWith('Authentication token is required.');
            expect(mockInitializeRoom).not.toHaveBeenCalled();
        });

        it('should handle initialization errors', async () => {
            const error = new Error('Connection failed');
            mockInitializeRoom.mockRejectedValueOnce(error);

            const { result } = renderHook(() => useRoom());
            await result.current.joinRoomWithAuth('room-123', 'testuser', 'token-abc');

            await waitFor(() => {
                expect(mockHandleError).toHaveBeenCalledWith('Failed to join room: Connection failed');
            });
        });
    });

    describe('Auto-join functionality', () => {
        it('should auto-join when autoJoin is true and all params are provided', async () => {
            renderHook(() =>
                useRoom({
                    autoJoin: true,
                    roomId: 'auto-room',
                    username: 'autouser',
                    token: 'auto-token',
                })
            );

            await waitFor(() => {
                expect(mockInitializeRoom).toHaveBeenCalledWith('auto-room', 'autouser', 'auto-token');
            });
        });

        it('should not auto-join if autoJoin is false', async () => {
            renderHook(() =>
                useRoom({
                    autoJoin: false,
                    roomId: 'auto-room',
                    username: 'autouser',
                    token: 'auto-token',
                })
            );

            await waitFor(() => {
                expect(mockInitializeRoom).not.toHaveBeenCalled();
            }, { timeout: 1000 });
        });

        it('should not auto-join if already joined', async () => {
            (useRoomStore as any).mockReturnValue({
                ...useRoomStore(),
                isJoined: true,
                initializeRoom: mockInitializeRoom,
                handleError: mockHandleError,
                clearError: mockClearError,
                updateRoomSettings: mockUpdateRoomSettings,
                leaveRoom: mockLeaveRoom,
            });

            renderHook(() =>
                useRoom({
                    autoJoin: true,
                    roomId: 'auto-room',
                    username: 'autouser',
                    token: 'auto-token',
                })
            );

            await waitFor(() => {
                expect(mockInitializeRoom).not.toHaveBeenCalled();
            }, { timeout: 1000 });
        });

        it('should not auto-join if roomId is missing', async () => {
            renderHook(() =>
                useRoom({
                    autoJoin: true,
                    username: 'autouser',
                    token: 'auto-token',
                })
            );

            await waitFor(() => {
                expect(mockInitializeRoom).not.toHaveBeenCalled();
            }, { timeout: 1000 });
        });
    });

    describe('Room state calculations', () => {
        it('should calculate isRoomReady correctly when joined and connected', () => {
            (useRoomStore as any).mockReturnValue({
                ...useRoomStore(),
                isJoined: true,
                connectionState: {
                    wsConnected: true,
                    wsReconnecting: false,
                    isInitializing: false,
                },
                isWaitingRoom: false,
                initializeRoom: mockInitializeRoom,
                handleError: mockHandleError,
                clearError: mockClearError,
                updateRoomSettings: mockUpdateRoomSettings,
                leaveRoom: mockLeaveRoom,
            });

            const { result } = renderHook(() => useRoom());

            expect(result.current.isRoomReady).toBe(true);
        });

        it('should calculate isRoomReady as false when in waiting room', () => {
            (useRoomStore as any).mockReturnValue({
                ...useRoomStore(),
                isJoined: true,
                connectionState: {
                    wsConnected: true,
                    wsReconnecting: false,
                    isInitializing: false,
                },
                isWaitingRoom: true,
                initializeRoom: mockInitializeRoom,
                handleError: mockHandleError,
                clearError: mockClearError,
                updateRoomSettings: mockUpdateRoomSettings,
                leaveRoom: mockLeaveRoom,
            });

            const { result } = renderHook(() => useRoom());

            expect(result.current.isRoomReady).toBe(false);
        });

        it('should detect connection issues when reconnecting', () => {
            (useRoomStore as any).mockReturnValue({
                ...useRoomStore(),
                isJoined: true,
                connectionState: {
                    wsConnected: false,
                    wsReconnecting: true,
                    isInitializing: false,
                },
                initializeRoom: mockInitializeRoom,
                handleError: mockHandleError,
                clearError: mockClearError,
                updateRoomSettings: mockUpdateRoomSettings,
                leaveRoom: mockLeaveRoom,
            });

            const { result } = renderHook(() => useRoom());

            expect(result.current.hasConnectionIssues).toBe(true);
        });
    });

    describe('exitRoom', () => {
        it('should call leaveRoom when exitRoom is called', () => {
            const { result } = renderHook(() => useRoom());

            result.current.exitRoom();

            expect(mockLeaveRoom).toHaveBeenCalledTimes(1);
        });
    });
});
