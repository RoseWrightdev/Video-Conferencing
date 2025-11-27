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

/**
 * Global Zustand store for video conferencing room state.
 * 
 * Combines multiple slices into a unified state management solution:
 * - ChatSlice: Messages, unread count, panel visibility
 * - ConnectionSlice: WebSocket/WebRTC status, errors
 * - DeviceSlice: Available cameras/mics, device selection
 * - MediaSlice: Local streams, audio/video toggles
 * - ParticipantSlice: Room members, speaking states
 * - RoomSlice: Room lifecycle, WebSocket/WebRTC infrastructure
 * - UISlice: Layout modes, panel toggles, pinning
 * 
 * Features:
 * - DevTools integration for debugging state changes
 * - Named store ('RoomStore') in Redux DevTools
 * - Type-safe with full TypeScript inference
 * - Supports React Suspense and concurrent rendering
 * 
 * Usage:
 * ```tsx
 * // Hook usage in components
 * const { messages, sendMessage } = useRoomStore();
 * 
 * // Selective subscriptions for performance
 * const isJoined = useRoomStore(state => state.isJoined);
 * 
 * // Direct store access (outside React)
 * useRoomStore.getState().leaveRoom();
 * useRoomStore.setState({ roomName: 'New Name' });
 * ```
 * 
 * @see RoomStoreState For complete state type
 */
export const useRoomStore = create<RoomStoreState>()(devtools((...a) => ({
  ...createChatSlice(...a),
  ...createConnectionSlice(...a),
  ...createDeviceSlice(...a),
  ...createMediaSlice(...a),
  ...createParticipantSlice(...a),
  ...createRoomSlice(...a),
  ...createUISlice(...a),
}), { name: 'RoomStore' }));