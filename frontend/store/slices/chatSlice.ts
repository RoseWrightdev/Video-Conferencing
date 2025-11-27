import { StateCreator } from 'zustand';
import { type ChatSlice, type RoomStoreState } from '../types';

/**
 * Chat slice for managing real-time messaging in video conferences.
 * 
 * State:
 * - messages: Array of all chat messages in chronological order
 * - unreadCount: Number of messages received while chat panel closed
 * - isChatPanelOpen: Visibility state of chat UI panel
 * 
 * Actions:
 * - sendMessage: Send text or private message via WebSocket
 * - addMessage: Add incoming message to local state
 * - markMessagesRead: Clear unread badge count
 * - toggleChatPanel: Show/hide chat UI
 * 
 * Message Flow:
 * 1. User calls sendMessage → WebSocket 'add_chat' event sent
 * 2. Server broadcasts to all participants
 * 3. All clients receive via WebSocket handler
 * 4. Handler calls addMessage to update local state
 * 5. React components re-render with new messages
 * 
 * Unread Tracking:
 * - Increments when message received and panel closed
 * - Resets to 0 when panel opens or markMessagesRead called
 * - Used for notification badges and browser notifications
 * 
 * @see ChatMessage For message data structure
 * @see WebSocketClient.sendChat For network protocol
 */
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