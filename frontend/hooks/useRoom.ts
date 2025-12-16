import { useCallback, useEffect, useRef } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

export const useRoom = (params?: {
  roomId?: string;
  username?: string;
  token?: string;
  autoJoin?: boolean;
}) => {
  const {
    roomId: storeRoomId,
    roomName,
    isJoined,
    isHost,
    currentUsername,
    currentUserId,
    connectionState,
    isWaitingRoom,
    updateRoomSettings,
    handleError,
    clearError,
    // The new Actions
    initializeRoom,
    leaveRoom
  } = useRoomStore();

  const mountedRef = useRef(false);

  const joinRoomWithAuth = useCallback(async (
    roomId: string,
    username: string,
    token: string,
  ) => {
    if (connectionState.isInitializing) return;

    if (!token) {
      handleError('Authentication token is required.');
      return;
    }

    try {
      // Directly call the Store Action (which sets up SFU + WS)
      await initializeRoom(roomId, username, token);
    } catch (error) {
      handleError(`Failed to join room: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [connectionState.isInitializing, initializeRoom, handleError]);

  // Auto-join effect
  useEffect(() => {
    // Prevent double-firing in Strict Mode
    if (mountedRef.current) return;
    mountedRef.current = true;

    if (
      params?.autoJoin &&
      params.roomId &&
      params.username &&
      params.token &&
      !isJoined &&
      !connectionState.isInitializing
    ) {
      joinRoomWithAuth(params.roomId, params.username, params.token);
    }

    // Cleanup on unmount
    return () => {
      if (isJoined) {
        leaveRoom();
      }
    };
  }, []); // Run once on mount

  const isRoomReady = connectionState.wsConnected && isJoined && !isWaitingRoom;
  const hasConnectionIssues = connectionState.wsReconnecting || (!connectionState.wsConnected && isJoined);

  return {
    roomId: storeRoomId,
    roomName,
    isJoined,
    isHost,
    currentUsername,
    currentUserId,
    isWaitingRoom,
    isRoomReady,
    hasConnectionIssues,
    connectionState,
    joinRoomWithAuth,
    exitRoom: leaveRoom, // Map directly to store action
    updateRoomSettings,
    clearError,
  };
};