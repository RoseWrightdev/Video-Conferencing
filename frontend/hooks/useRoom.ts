import { useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { roomService } from '@/services/roomService';

/**
 * Room management hook for video conferencing
 * 
 * @example
 * ```tsx
 * const { joinRoomWithAuth, exitRoom, isRoomReady } = useRoom();
 * await joinRoomWithAuth('room-123', 'John Doe', 'jwt-token');
 * ```
 */
export const useRoom = () => {
  const {
    roomId,
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

  const joinRoomWithAuth = useCallback(async (
    roomId: string,
    username: string,
    token?: string,
  ) => {    
    try {
      await roomService.initializeRoom(roomId, username, token || '');
      await roomService.joinRoom();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to join room:', message);
      handleError(`Failed to join room: ${message}`);
      throw error;
    }
  }, [handleError]);

  const exitRoom = useCallback(() => {
    roomService.leaveRoom();
  }, []);

  const isRoomReady = connectionState.wsConnected && isJoined && !isWaitingRoom;
  const hasConnectionIssues = connectionState.wsReconnecting || 
    (!connectionState.wsConnected && isJoined);

  return {
    roomId,
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
