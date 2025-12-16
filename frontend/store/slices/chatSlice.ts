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

  sendMessage: (content, type = 'text', targetId) => {
    const { wsClient } = get();
    if (!wsClient) return;

    wsClient.send({
      chat: {
        content: content,
        targetId: (type === 'private' && targetId) || "",
      }
    });
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