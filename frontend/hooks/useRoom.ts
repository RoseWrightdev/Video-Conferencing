import { useCallback, useEffect, useRef } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { roomService } from '@/services/roomService';

/**
 * Room management hook for video conferencing sessions.
 * 
 * Provides high-level room operations including:
 * - Automatic room initialization and connection
 * - Authentication-aware joining (waits for Auth0 session)
 * - Connection state monitoring and reconnection handling
 * - Room lifecycle management (join/leave)
 * - Settings configuration
 * 
 * Architecture:
 * - Delegates actual WebSocket/WebRTC logic to RoomService
 * - Uses refs to prevent duplicate initialization attempts
 * - Auto-join triggers when authentication completes
 * - Cleanup on unmount via exitRoom
 * 
 * @param params - Configuration for room connection
 * @param params.roomId - Room identifier to join
 * @param params.username - Display name for this participant
 * @param params.token - JWT authentication token
 * @param params.autoJoin - Whether to automatically join when ready (default: false)
 * 
 * @returns Room state and control methods
 * 
 * @example
 * ```tsx
 * // Manual join
 * const { joinRoomWithAuth, isRoomReady } = useRoom();
 * 
 * // Auto-join when authenticated
 * const { isRoomReady } = useRoom({
 *   roomId: 'room-123',
 *   username: session.user.name,
 *   token: session.accessToken,
 *   autoJoin: status === 'authenticated'
 * });
 * 
 * if (isRoomReady) {
 *   return <RoomInterface />;
 * }
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
