import { StateCreator } from 'zustand';
import { WebSocketClient } from '@/lib/websockets';
import { WebRTCManager } from '@/lib/webrtc';
import { type RoomSlice, type RoomStoreState, type Participant, type ChatMessage } from '../types';
import type { AddChatPayload, RoomStatePayload, HandStatePayload } from '../../../shared/types/events';

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

    const clientInfo = {
      clientId: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      displayName: username,
    };

    const wsClient = new WebSocketClient({
      url: `ws://localhost:8080/ws/hub/${roomId}`,
      token,
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
    });

    // Setup all WebSocket event handlers here
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
      
      const waitingParticipants: Participant[] = payload.waitingUsers?.map((user) => ({
        id: user.clientId,
        username: user.displayName,
        role: 'participant' as const,
        isAudioEnabled: false,
        isVideoEnabled: false,
        isScreenSharing: false,
        isSpeaking: false,
        lastActivity: new Date(),
      })) || [];

      set({
        participants: newParticipants,
        pendingParticipants: waitingParticipants,
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
      set((state) => {
        const newSpeaking = new Set(state.speakingParticipants);
        newSpeaking.add(payload.clientId);
        return { speakingParticipants: newSpeaking };
      });
    });

    wsClient.on('lower_hand', (message) => {
      const payload = message.payload as HandStatePayload;
      set((state) => {
        const newSpeaking = new Set(state.speakingParticipants);
        newSpeaking.delete(payload.clientId);
        return { speakingParticipants: newSpeaking };
      });
    });

    wsClient.onConnectionChange?.((connectionState) => {
      get().updateConnectionState({
        wsConnected: connectionState === 'connected',
        wsReconnecting: connectionState === 'reconnecting',
      });
    });

    wsClient.onError((error) => {
      console.error('WebSocket error:', error);
      get().handleError(`Connection error: ${error.message}`);
    });

    try {
      await wsClient.connect();
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
      console.error('Failed to initialize room:', error);
      get().handleError(`Failed to initialize room: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
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
