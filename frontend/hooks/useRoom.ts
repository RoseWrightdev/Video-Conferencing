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
    const state = useRoomStore.getState();
    // If we are already initializing or joined, don't try again
    if (state.connectionState.isInitializing || state.isJoined) return;

    // Prevent infinite loop: do not retry if there is an active error
    if (state.connectionState.lastError) return;

    if (!token) {
      handleError('Authentication token is required.');
      return;
    }

    try {
      await initializeRoom(roomId, username, token);
    } catch (error) {
      handleError(`Failed to join room: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [initializeRoom, handleError]);

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
      params.token
    ) {
      // NOTE: React Strict Mode will run this effect twice.
      // The first call sets isInitializing=true synchronously (mostly) in the store
      // or at least kicks off the async process.
      // We rely on the store's state to prevent the second call from doing duplicated work.

      joinRoomWithAuth(params.roomId, params.username, params.token);
    }

    // Cleanup function to prevent ghost connections
    return () => {
      if (params?.autoJoin) { // Only auto-leave if we auto-joined
        // We need to be careful not to leave if we are just re-rendering, 
        // but in Strict Mode we WANT to leave and rejoin to prove resilience.
        // Ideally, leaveRoom() disconnects socket -> RoomClient cleanup -> Backend sees disconnect.
        leaveRoom();
      }
    };
  }, [
    params?.autoJoin,
    params?.roomId,
    params?.username,
    params?.token,
    // Remove dependencies that cause unnecessary re-joins if they change without intent
    // Actually, if these change we probably DO want to rejoin.
    // Keeping logic simple: deps change -> cleanup -> new effect -> join
    joinRoomWithAuth,
    leaveRoom
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