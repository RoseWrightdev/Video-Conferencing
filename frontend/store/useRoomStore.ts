import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { type RoomStoreState } from './types';
import { createChatSlice } from './slices/chatSlice';
import { createConnectionSlice } from './slices/connectionSlice';
import { createDeviceSlice } from './slices/deviceSlice';
import { createMediaSlice } from './slices/mediaSlice';
import { createParticipantSlice } from './slices/participantSlice';
import { createRoomSlice } from './slices/roomSlice';
import { createUISlice } from './slices/uiSlice';

export const useRoomStore = create<RoomStoreState>()(devtools((...a) => ({
  ...createChatSlice(...a),
  ...createConnectionSlice(...a),
  ...createDeviceSlice(...a),
  ...createMediaSlice(...a),
  ...createParticipantSlice(...a),
  ...createRoomSlice(...a),
  ...createUISlice(...a),
}), { name: 'RoomStore' }));