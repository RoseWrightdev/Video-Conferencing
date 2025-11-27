import { useCallback, useEffect, useRef } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { roomService } from '@/services/roomService';

/**
 * Room management hook for video conferencing
 * 
 * @example
 * ```tsx
 * const { isRoomReady } = useRoom();
 * // Auto-joins room when authentication is ready
 * ```
 */
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
  } = useRoomStore();

  const hasInitialized = useRef(false);
  const isInitializing = useRef(false);

  const joinRoomWithAuth = useCallback(async (
    roomId: string,
    username: string,
    token?: string,
  ) => {    
    if (isInitializing.current) return;
    
    try {
      isInitializing.current = true;
      await roomService.initializeRoom(roomId, username, token || '');
      await roomService.joinRoom();
      hasInitialized.current = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      handleError(`Failed to join room: ${message}`);
      hasInitialized.current = false;
      throw error;
    } finally {
      isInitializing.current = false;
    }
  }, [handleError]);

  const exitRoom = useCallback(() => {
    roomService.leaveRoom();
    hasInitialized.current = false;
    isInitializing.current = false;
  }, []);

  // Auto-join effect
  useEffect(() => {
    if (
      params?.autoJoin &&
      params.roomId &&
      params.username &&
      params.token &&
      !isJoined &&
      !hasInitialized.current &&
      !isInitializing.current
    ) {
      joinRoomWithAuth(params.roomId, params.username, params.token).catch(() => {});
    }
  }, [params?.autoJoin, params?.roomId, params?.username, params?.token, isJoined, joinRoomWithAuth]);

  const isRoomReady = connectionState.wsConnected && isJoined && !isWaitingRoom;
  const hasConnectionIssues = connectionState.wsReconnecting || 
    (!connectionState.wsConnected && isJoined);

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
