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

export class RoomService {
  private wsClient: WebSocketClient | null = null;
  private webrtcManager: WebRTCManager | null = null;
  private clientInfo: ClientInfo | null = null;

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
      });

      // Assuming refreshDevices is a method in the store
      await useRoomStore.getState().refreshDevices();
    } catch (error) {
      console.error('Failed to initialize room:', error);
      useRoomStore.getState().handleError(
        `Failed to initialize room: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

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

      useRoomStore.setState({
        participants: newParticipants,
        pendingParticipants: waitingParticipants,
        isHost:
          payload.hosts?.some((h) => h.clientId === this.clientInfo?.clientId) ||
          false,
      });
    });

    this.wsClient.on('accept_waiting', () => {
      useRoomStore.setState({ isWaitingRoom: false, isJoined: true });
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
      console.error('WebSocket error:', error);
      useRoomStore.getState().handleError(`Connection error: ${error.message}`);
    });
  }
}

export const roomService = new RoomService();
