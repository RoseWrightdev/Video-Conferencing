import { StateCreator } from 'zustand';
import { type ChatSlice, type RoomStoreState } from '../types';

export const createChatSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  ChatSlice
> = (set, get) => ({
  messages: [],
  unreadCount: 0,
  isChatPanelOpen: false,

  sendMessage: (content, type = 'text') => {
    const wsClient = get().wsClient;
    const clientInfo = get().clientInfo;

    if (!wsClient || !clientInfo) {
      get().handleError('Cannot send message: Not connected to room');
      return;
    }
    
    try {
      wsClient.sendChat(content, clientInfo);
    } catch (error) {
      get().handleError(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (type === 'private') {
      // maybe some special handling for private messages
    }
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
      unreadCount: state.isChatPanelOpen ? state.unreadCount : state.unreadCount + 1,
    }));
  },

  markMessagesRead: () => {
    set({ unreadCount: 0 });
  },

  toggleChatPanel: () => {
    set((state) => {
      const newOpen = !state.isChatPanelOpen;
      return {
        isChatPanelOpen: newOpen,
        unreadCount: newOpen ? 0 : state.unreadCount,
      };
    });
  },
});