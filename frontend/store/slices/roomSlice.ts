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

  updateRoomSettings: (settings) => {
    set((state) => ({
      roomSettings: { ...state.roomSettings!, ...settings },
    }));
  },
});
