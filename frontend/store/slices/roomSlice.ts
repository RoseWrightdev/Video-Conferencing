import { StateCreator } from 'zustand';
import { WebSocketClient } from '@/lib/websockets';
import { SFUClient } from '@/lib/webrtc';
import { type RoomSlice, type RoomStoreState, type Participant, type ChatMessage } from '../types';
import { WebSocketMessage } from '@/types/proto/signaling'; // Ensure this path matches your structure

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
  sfuClient: null, // Initialized as null

  initializeRoom: async (roomId, username, token) => {
    const state = get();
    if (state.wsClient) state.wsClient.disconnect();

    // 1. Setup WebSocket (Signal Transport)
    // Ensure URL is correct for your Go server
    const wsUrl = 'ws://localhost:8080/ws/hub';
    const wsClient = new WebSocketClient(wsUrl, token);

    // 2. Setup SFU Client (Media Transport)
    // We pass a callback to handle incoming tracks from the SFU
    const sfuClient = new SFUClient(wsClient, (stream, track) => {
      // When SFU sends a track, we need to map it to a user.
      // For the MVP, we assume the stream.id matches the userId.
      const userId = stream.id;
      get().setParticipantStream(userId, stream);
    });

    // 3. Register Protobuf Event Listeners
    wsClient.onMessage((msg: WebSocketMessage) => {
      // A. Handle Chat
      if (msg.chatEvent) {
        const chat = msg.chatEvent;
        const newMsg: ChatMessage = {
          id: chat.id,
          participantId: chat.senderId,
          username: chat.senderName,
          content: chat.content,
          timestamp: new Date(Number(chat.timestamp)), // Convert Long/string to date
          type: chat.isPrivate ? 'private' : 'text',
        };
        get().addMessage(newMsg);
      }

      // B. Handle Room State (Participants List)
      if (msg.roomState) {
        const newParticipants = new Map<string, Participant>();

        msg.roomState.participants.forEach((p) => {
          newParticipants.set(p.id, {
            id: p.id,
            username: p.displayName,
            role: p.isHost ? 'host' : 'participant',
            // Preserve existing stream if we already have it
            stream: get().participants.get(p.id)?.stream,
          });

          // Sync Media State
          get().setAudioEnabled(p.id, p.isAudioEnabled);
          get().setVideoEnabled(p.id, p.isVideoEnabled);
          get().setScreenSharing(p.id, p.isScreenSharing);
          get().setHandRaised(p.id, p.isHandRaised);
        });

        set({ participants: newParticipants });
      }

      // C. Handle Join Response (Success/Fail)
      if (msg.joinResponse) {
        if (msg.joinResponse.success) {
          set({
            isJoined: true,
            currentUserId: msg.joinResponse.userId,
            isHost: msg.joinResponse.isHost
          });
        } else {
          get().handleError('Failed to join room');
        }
      }

      // D. Handle Errors
      if (msg.error) {
        get().handleError(msg.error.message);
      }
    });

    // 4. Connect
    try {
      await wsClient.connect();

      set({
        roomId,
        currentUsername: username,
        wsClient,
        sfuClient,
        clientInfo: { clientId: 'temp', displayName: username }
      });

      // 5. Send Join Request (Protobuf)
      wsClient.send({
        join: {
          token: token,
          roomId: roomId,
          displayName: username
        }
      });

    } catch (error) {
      get().handleError(`Connection failed: ${error}`);
    }
  },

  joinRoom: async () => {
    // Legacy support: logic moved to initializeRoom for smoother flow
  },

  leaveRoom: () => {
    const { sfuClient, wsClient, localStream } = get();
    localStream?.getTracks().forEach(t => t.stop());

    // Cleanup SFU
    if (sfuClient) sfuClient.close();
    if (wsClient) wsClient.disconnect();

    set({
      roomId: null,
      isJoined: false,
      wsClient: null,
      sfuClient: null,
      participants: new Map(),
      messages: []
    });
  },

  updateRoomSettings: () => { },
});