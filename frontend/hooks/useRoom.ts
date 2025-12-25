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
    initializeRoom,
    leaveRoom
  } = useRoomStore();

  const joinRoomWithAuth = useCallback(async (
    roomId: string,
    username: string,
    token: string,
  ) => {
    // If we are already initializing or joined, don't try again
    if (connectionState.isInitializing || isJoined) return;

    if (!token) {
      handleError('Authentication token is required.');
      return;
    }

    try {
      await initializeRoom(roomId, username, token);
    } catch (error) {
      handleError(`Failed to join room: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [connectionState.isInitializing, isJoined, initializeRoom, handleError]);

  // Auto-join effect
  useEffect(() => {
    // Logic:
    // 1. Must check autoJoin param
    // 2. Must have all required params (roomId, username, token)
    // 3. Must NOT be already joined
    // 4. Must NOT be currently initializing

    if (
      params?.autoJoin &&
      params.roomId &&
      params.username &&
      params.token &&
      !isJoined &&
      !connectionState.isInitializing
    ) {
      // NOTE: React Strict Mode will run this effect twice.
      // The first call sets isInitializing=true synchronously (mostly) in the store
      // or at least kicks off the async process.
      // We rely on the store's state to prevent the second call from doing duplicated work.

      joinRoomWithAuth(params.roomId, params.username, params.token);
    }
  }, [
    params?.autoJoin,
    params?.roomId,
    params?.username,
    params?.token,
    isJoined,
    connectionState.isInitializing,
    joinRoomWithAuth
  ]);

  const isRoomReady = connectionState.wsConnected && isJoined && !isWaitingRoom;
  const hasConnectionIssues = connectionState.wsReconnecting || (!connectionState.wsConnected && isJoined);

  // Expose exit method that cleans up everything
  const exitRoom = useCallback(() => {
    leaveRoom();
  }, [leaveRoom]);

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
    exitRoom,
    updateRoomSettings,
    clearError,
  };
};