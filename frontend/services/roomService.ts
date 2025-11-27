import { WebSocketClient } from '@/lib/websockets';
import { WebRTCManager } from '@/lib/webrtc';
import { useRoomStore } from '@/store/useRoomStore';
import {
  type ChatMessage,
  type Participant,
} from '../store/types';
import type {
  AddChatPayload,
  RoomStatePayload,
  HandStatePayload,
  ClientInfo,
} from '../../shared/types/events';

/**
 * RoomService manages the lifecycle of a video conferencing room.
 * 
 * Responsibilities:
 * - Initializes and maintains WebSocket connections to the signaling server
 * - Manages WebRTC peer connections for audio/video streaming
 * - Handles room state synchronization and event routing
 * - Coordinates chat messages and participant actions
 * 
 * Architecture:
 * - Singleton pattern via exported instance
 * - Event-driven communication through WebSocket message handlers
 * - State management delegated to Zustand store
 * - Separation of concerns: WebSocket for signaling, WebRTC for media
 * 
 * @example
 * ```typescript
 * // Initialize room connection
 * await roomService.initializeRoom('room-123', 'John Doe', 'jwt-token');
 * 
 * // Join as participant
 * await roomService.joinRoom();
 * 
 * // Clean up on exit
 * roomService.leaveRoom();
 * ```
 */
export class RoomService {
  private wsClient: WebSocketClient | null = null;
  private webrtcManager: WebRTCManager | null = null;
  private clientInfo: ClientInfo | null = null;

  /**
   * Initializes the room connection and establishes WebSocket/WebRTC infrastructure.
   * 
   * This method:
   * 1. Disconnects any existing WebSocket connection
   * 2. Generates a unique client ID for this session
   * 3. Creates WebSocket client with auto-reconnect
   * 4. Establishes connection to signaling server
   * 5. Initializes WebRTC manager for peer connections
   * 6. Updates global store with connection state
   * 7. Refreshes available media devices
   * 
   * @param roomId - Unique identifier for the room to join
   * @param username - Display name for this participant
   * @param token - JWT authentication token for authorization
   * 
   * @throws {Error} If WebSocket connection fails
   * @throws {Error} If device enumeration fails
   * 
   * @example
   * ```typescript
   * try {
   *   await roomService.initializeRoom(
   *     'room-abc123',
   *     'Alice',
   *     session.accessToken
   *   );
   * } catch (error) {
   *   console.error('Failed to initialize room:', error);
   * }
   * ```
   */
  public async initializeRoom(roomId: string, username: string, token: string) {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }

    this.clientInfo = {
      clientId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      displayName: username,
    };

    this.wsClient = new WebSocketClient({
      url: `ws://localhost:8080/ws/hub/${roomId}`,
      token,
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
    });

    this.setupEventHandlers();

    try {
      await this.wsClient.connect();
      this.webrtcManager = new WebRTCManager(this.clientInfo, this.wsClient);

      useRoomStore.setState({
        roomId,
        currentUserId: this.clientInfo.clientId,
        currentUsername: username,
        clientInfo: this.clientInfo,
        wsClient: this.wsClient,
      });

      // Assuming refreshDevices is a method in the store
      await useRoomStore.getState().refreshDevices();
    } catch (error) {
      useRoomStore.getState().handleError(
        `Failed to initialize room: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Requests to join the room as a participant.
   * 
   * For rooms with waiting room enabled, this sends a request to the host
   * for approval. The host will receive a waiting room event and can
   * accept or deny the request.
   * 
   * @throws {Error} If connection is not initialized
   * @throws {Error} If WebSocket send fails
   * 
   * @see setupEventHandlers For accept_waiting and deny_waiting event handling
   * 
   * @example
   * ```typescript
   * await roomService.joinRoom();
   * // Wait for 'accept_waiting' or 'deny_waiting' event
   * ```
   */
  public async joinRoom() {
    if (!this.wsClient || !this.clientInfo) {
      useRoomStore.getState().handleError('Connection not ready. Please try again.');
      return;
    }
    try {
      this.wsClient.requestWaiting(this.clientInfo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useRoomStore.getState().handleError(`Failed to join room: ${message}`);
      throw error;
    }
  }

  /**
   * Gracefully disconnects from the room and cleans up all resources.
   * 
   * Cleanup process:
   * 1. Stops all local media tracks (camera, microphone)
   * 2. Stops screen sharing if active
   * 3. Closes all WebRTC peer connections
   * 4. Disconnects WebSocket connection
   * 5. Resets store to initial state
   * 
   * Safe to call multiple times - will not throw if already disconnected.
   * 
   * @example
   * ```typescript
   * // On component unmount or user logout
   * roomService.leaveRoom();
   * ```
   */
  public leaveRoom() {
    const { localStream, screenShareStream } = useRoomStore.getState();

    localStream?.getTracks().forEach((track) => track.stop());
    screenShareStream?.getTracks().forEach((track) => track.stop());
    this.webrtcManager?.cleanup();
    this.wsClient?.disconnect();

    useRoomStore.setState({
      roomId: null,
      roomName: null,
      roomSettings: null,
      isJoined: false,
      isHost: false,
      currentUserId: null,
      currentUsername: null,
      clientInfo: null,
      wsClient: null,
      webrtcManager: null,
      participants: new Map(),
      localParticipant: null,
      speakingParticipants: new Set(),
      localStream: null,
      screenShareStream: null,
      messages: [],
      unreadCount: 0,
      isChatPanelOpen: false,
      isParticipantsPanelOpen: false,
      isWaitingRoom: false,
      pendingParticipants: [],
      selectedParticipantId: null,
      gridLayout: 'gallery',
      isPinned: false,
      pinnedParticipantId: null,
      connectionState: {
        wsConnected: false,
        wsReconnecting: false,
        webrtcConnected: false,
      },
    });
  }

  /**
   * Registers WebSocket event handlers for room-level events.
   * 
   * Event handlers:
   * - add_chat: Receives new chat messages from other participants
   * - recents_chat: Loads chat history when joining room
   * - room_state: Synchronizes participant list and room metadata
   * - accept_waiting: Notification of approval to join room
   * - deny_waiting: Notification of denied room access
   * - raise_hand: Participant requests to speak
   * - lower_hand: Participant cancels speak request
   * 
   * All handlers update the Zustand store to trigger React re-renders.
   * Error handling delegates to store's handleError method.
   * 
   * @private
   * @see WebSocketClient.on For event subscription API
   */
  private setupEventHandlers() {
    if (!this.wsClient) return;

    this.wsClient.on('add_chat', (message) => {
      const chatPayload = message.payload as AddChatPayload;
      const chatMessage: ChatMessage = {
        id: chatPayload.chatId,
        participantId: chatPayload.clientId,
        username: chatPayload.displayName,
        content: chatPayload.chatContent,
        timestamp: new Date(chatPayload.timestamp),
        type: 'text',
      };
      useRoomStore.getState().addMessage(chatMessage);
    });

    this.wsClient.on('recents_chat', (message) => {
      const payload = message.payload as unknown as { chats: AddChatPayload[] };
      const chatMessages: ChatMessage[] = (payload.chats || []).map((chat) => ({
        id: chat.chatId,
        participantId: chat.clientId,
        username: chat.displayName,
        content: chat.chatContent,
        timestamp: new Date(chat.timestamp),
        type: 'text' as const,
      }));
      useRoomStore.setState({ messages: chatMessages });
    });

    this.wsClient.on('room_state', (message) => {
      const payload = message.payload as RoomStatePayload;
      const newParticipants = new Map<string, Participant>();

      payload.hosts?.forEach((host) => {
        newParticipants.set(host.clientId, {
          id: host.clientId,
          username: host.displayName,
          role: 'host',
          isAudioEnabled: true,
          isVideoEnabled: true,
          isScreenSharing: false,
          isSpeaking: false,
          lastActivity: new Date(),
        });
      });

      payload.participants?.forEach((participant) => {
        newParticipants.set(participant.clientId, {
          id: participant.clientId,
          username: participant.displayName,
          role: 'participant',
          isAudioEnabled: true,
          isVideoEnabled: true,
          isScreenSharing: false,
          isSpeaking: false,
          lastActivity: new Date(),
        });
      });

      const waitingParticipants: Participant[] =
        payload.waitingUsers?.map((user) => ({
          id: user.clientId,
          username: user.displayName,
          role: 'participant' as const,
          isAudioEnabled: false,
          isVideoEnabled: false,
          isScreenSharing: false,
          isSpeaking: false,
          lastActivity: new Date(),
        })) || [];

      const isHost = payload.hosts?.some((h) => h.clientId === this.clientInfo?.clientId) || false;

      useRoomStore.setState({
        participants: newParticipants,
        pendingParticipants: waitingParticipants,
        isHost,
        isJoined: true,
      });

      // Request chat history when room state is received (for hosts or approved participants)
      if (this.wsClient && this.clientInfo) {
        this.wsClient.requestChatHistory(this.clientInfo);
      }
    });

    this.wsClient.on('accept_waiting', () => {
      useRoomStore.setState({ isWaitingRoom: false, isJoined: true });
      
      // Request chat history when accepted into room
      if (this.wsClient && this.clientInfo) {
        this.wsClient.requestChatHistory(this.clientInfo);
      }
    });

    this.wsClient.on('deny_waiting', () => {
      useRoomStore.getState().handleError('Access to room denied by host');
    });

    this.wsClient.on('raise_hand', (message) => {
      const payload = message.payload as HandStatePayload;
      useRoomStore.setState((state) => {
        const newSpeaking = new Set(state.speakingParticipants);
        newSpeaking.add(payload.clientId);
        return { speakingParticipants: newSpeaking };
      });
    });

    this.wsClient.on('lower_hand', (message) => {
      const payload = message.payload as HandStatePayload;
      useRoomStore.setState((state) => {
        const newSpeaking = new Set(state.speakingParticipants);
        newSpeaking.delete(payload.clientId);
        return { speakingParticipants: newSpeaking };
      });
    });

    this.wsClient.onConnectionChange?.((connectionState) => {
      useRoomStore.getState().updateConnectionState({
        wsConnected: connectionState === 'connected',
        wsReconnecting: connectionState === 'reconnecting',
      });
    });

    this.wsClient.onError((error) => {
      useRoomStore.getState().handleError(`Connection error: ${error.message}`);
    });
  }
}

export const roomService = new RoomService();
