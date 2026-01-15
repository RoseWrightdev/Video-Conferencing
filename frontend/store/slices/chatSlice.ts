import { StateCreator } from 'zustand';
import { type ChatSlice, type RoomStoreState } from '../types';
import DOMPurify from 'dompurify';
import throttle from 'lodash/throttle';

export const createChatSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  ChatSlice
> = (set, get) => {
  // Throttled function to handle the actual WebSocket sending
  // Defined inside the creator to capture the `get` scope for the specific store instance
  const throttledSend = throttle((content: string, type: 'text' | 'private' = 'text', targetId?: string) => {
    const { wsClient } = get();
    if (!wsClient) return;

    wsClient.send({
      chat: {
        content,
        targetId: (type === 'private' && targetId) || "",
      }
    });
  }, 500); // 500ms throttle window

  return {
    messages: [],
    unreadCount: 0,
    isChatPanelOpen: false,

    sendMessage: (content, type = 'text', targetId) => {
      // 1. Sanitize content
      const cleanContent = DOMPurify.sanitize(content);
      if (!cleanContent.trim()) return; // Prevent empty messages after sanitization

      // 2. Throttled send
      throttledSend(cleanContent, type, targetId);
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

    fetchHistory: () => {
      const { wsClient } = get();
      if (!wsClient) return;

      // Send the empty request object defined in your proto
      wsClient.send({
        getRecentChats: {}
      });
    },
  };
};