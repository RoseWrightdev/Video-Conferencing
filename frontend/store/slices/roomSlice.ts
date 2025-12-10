import { StateCreator } from 'zustand';
import { WebSocketClient } from '@/lib/websockets';
import { WebRTCManager } from '@/lib/webrtc';
import { type RoomSlice, type RoomStoreState, type Participant, type ChatMessage } from '../types';
import type { AddChatPayload, RoomStatePayload, HandStatePayload } from '../../../shared/types/events';

/**
 * Room slice for managing room lifecycle and core connection infrastructure.
 * 
 * State:
 * - roomId/roomName: Room identifiers
 * - roomSettings: Configuration (max participants, waiting room, permissions)
 * - isJoined: Whether successfully joined and approved
 * - isWaitingRoom: Whether waiting for host approval
 * - currentUserId/currentUsername: This client's identity
 * - clientInfo: ClientInfo object for WebSocket messages
 * - wsClient: WebSocket connection instance
 * - webrtcManager: WebRTC peer connection manager
 * 
 * Actions:
 * - initializeRoom: Create WebSocket/WebRTC infrastructure
 * - joinRoom: Request to join (may enter waiting room)
 * - leaveRoom: Cleanup all connections and reset state
 * - updateRoomSettings: Modify room configuration (host only)
 * 
 * Initialization Flow:
 * 1. Generate unique client ID
 * 2. Create WebSocket client with JWT token
 * 3. Register all event handlers (chat, room_state, etc.)
 * 4. Connect to WebSocket server
 * 5. Create WebRTC manager for peer connections
 * 6. Update store with references
 * 7. Enumerate available devices
 * 
 * Event Handlers:
 * - add_chat: Append incoming messages
 * - room_state: Sync participant list
 * - accept_waiting: Transition from lobby to room
 * - deny_waiting: Show rejection error
 * - raise_hand/lower_hand: Update speaking indicators
 * - Connection state changes: Update UI status
 * 
 * Cleanup:
 * - Stops all media tracks
 * - Closes WebRTC connections
 * - Disconnects WebSocket (code 1000)
 * - Resets all state to null/empty
 * 
 * @see RoomService For alternative initialization API
 * @see WebSocketClient For connection management
 * @see WebRTCManager For peer connection handling
 */
export const createRoomSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  RoomSlice
> = (set, get) => ({
  roomId: null,
  roomName: null,
  roomSettings: null,
  isJoined: false,
  isWaitingRoom: false,
  currentUserId: null,
  currentUsername: null,
  clientInfo: null,
  wsClient: null,
  webrtcManager: null,

  initializeRoom: async (roomId, username, token) => {
    const state = get();
    
    if (state.wsClient) {
      state.wsClient.disconnect();
    }

    // Extract client ID from JWT token's 'sub' claim (backend uses this as the client ID)
    let clientId: string;
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        throw new Error('Invalid JWT token format');
      }
      const payload = JSON.parse(atob(tokenParts[1]));
      clientId = payload.sub || payload.subject;
      if (!clientId) {
        throw new Error('JWT token missing sub/subject claim');
      }
    } catch (error) {
      console.error('[RoomSlice] Failed to extract clientId from token:', error);
      throw new Error('Invalid authentication token');
    }

    const clientInfo = {
      clientId,
      displayName: username,
    };

    console.log('[RoomSlice] Creating WebSocket client for room:', roomId);
    const wsClient = new WebSocketClient({
      url: `ws://localhost:8080/ws/hub/${roomId}`,
      token,
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
    });
    console.log('[RoomSlice] WebSocket client created');

    // Setup all WebSocket event handlers here
    console.log('[RoomSlice] Registering WebSocket event handlers');
    wsClient.on('add_chat', (message) => {
      const chatPayload = message.payload as AddChatPayload;
      const chatMessage: ChatMessage = {
        id: chatPayload.chatId,
        participantId: chatPayload.clientId,
        username: chatPayload.displayName,
        content: chatPayload.chatContent,
        timestamp: new Date(chatPayload.timestamp),
        type: 'text',
      };
      get().addMessage(chatMessage);
    });

    wsClient.on('room_state', (message) => {
      const payload = message.payload as RoomStatePayload;
      console.log('[RoomSlice] room_state received:', {
        hostsCount: payload.hosts?.length || 0,
        participantsCount: payload.participants?.length || 0,
        waitingCount: payload.waitingUsers?.length || 0,
        payload
      });
      const newParticipants = new Map<string, Participant>();
      const newHosts = new Map<string, Participant>();
      const newWaiting = new Map<string, Participant>();
      
      payload.hosts?.forEach((host) => {
        const participant: Participant = {
          id: host.clientId,
          username: host.displayName,
          role: 'host',
        };
        newParticipants.set(host.clientId, participant);
        newHosts.set(host.clientId, participant);
      });

      payload.participants?.forEach((participant) => {
        const p: Participant = {
          id: participant.clientId,
          username: participant.displayName,
          role: 'participant',
        };
        newParticipants.set(participant.clientId, p);
      });
      
      payload.waitingUsers?.forEach((user) => {
        const participant: Participant = {
          id: user.clientId,
          username: user.displayName,
          role: 'waiting',
        };
        newWaiting.set(user.clientId, participant);
      });

      console.log('[RoomSlice] Setting participants state:', {
        participantsCount: newParticipants.size,
        hostsCount: newHosts.size,
        waitingCount: newWaiting.size
      });
      set({
        participants: newParticipants,
        hosts: newHosts,
        waitingParticipants: newWaiting,
        isHost: payload.hosts?.some((h) => h.clientId === clientInfo.clientId) || false,
      });
    });

    wsClient.on('accept_waiting', () => {
      set({ isWaitingRoom: false, isJoined: true });
    });

    wsClient.on('deny_waiting', () => {
      get().handleError('Access to room denied by host');
    });

    wsClient.on('raise_hand', (message) => {
      const payload = message.payload as HandStatePayload;
      get().setHandRaised(payload.clientId, true);
    });

    wsClient.on('lower_hand', (message) => {
      const payload = message.payload as HandStatePayload;
      get().setHandRaised(payload.clientId, false);
    });

    wsClient.onConnectionChange?.((connectionState) => {
      get().updateConnectionState({
        wsConnected: connectionState === 'connected',
        wsReconnecting: connectionState === 'reconnecting',
      });
    });

    wsClient.onError((error) => {
      get().handleError(`Connection error: ${error.message}`);
    });

    console.log('[RoomSlice] All event handlers registered, calling connect()');
    try {
      await wsClient.connect();
      console.log('[RoomSlice] WebSocket connected successfully');
      const webrtcManager = new WebRTCManager(clientInfo, wsClient);

      set({
        roomId,
        currentUserId: clientInfo.clientId,
        currentUsername: username,
        wsClient,
        webrtcManager,
        clientInfo,
      });

      await get().refreshDevices();
    } catch (error) {
      const errorMessage = `Failed to initialize room: ${error instanceof Error ? error.message : String(error)}`;
      get().handleError(errorMessage);
      throw new Error(errorMessage);
    }
  },

  joinRoom: async () => {
    const { wsClient, clientInfo, handleError } = get();
    if (!wsClient || !clientInfo) {
      handleError('Connection not ready. Please try again.');
      return;
    }
    try {
      wsClient.requestWaiting(clientInfo);
      // Backend will send 'accept_waiting' or 'deny_waiting'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      handleError(`Failed to join room: ${message}`);
      throw error;
    }
  },

  leaveRoom: () => {
    const { webrtcManager, wsClient, localStream, screenShareStream } = get();
    
    localStream?.getTracks().forEach(track => track.stop());
    screenShareStream?.getTracks().forEach(track => track.stop());
    webrtcManager?.cleanup();
    wsClient?.disconnect();

    set({
      roomId: null,
      roomName: null,
      isJoined: false,
      currentUserId: null,
      currentUsername: null,
      clientInfo: null,
      wsClient: null,
      webrtcManager: null,
      participants: new Map(),
      messages: [],
    });
  },

  updateRoomSettings: (settings) => {
    set((state) => ({
      roomSettings: { ...state.roomSettings!, ...settings },
    }));
  },
});
