import { useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Chat functionality hook for real-time messaging in video conferences.
 * 
 * Features:
 * - Send text messages to all participants
 * - Send private messages to specific users (planned)
 * - Track unread message count
 * - Chat panel visibility management
 * - Auto-mark as read when panel opens
 * 
 * Message flow:
 * 1. sendTextMessage → WebSocket 'add_chat' event
 * 2. Server broadcasts to all participants
 * 3. Clients receive via 'add_chat' handler
 * 4. Store updates trigger UI re-render
 * 
 * @returns Chat state and actions
 * 
 * @example
 * ```tsx
 * const { sendTextMessage, openChat, hasUnreadMessages } = useChat();
 * 
 * // Send message
 * sendTextMessage('Hello everyone!');
 * 
 * // Show notification badge
 * {hasUnreadMessages && <Badge>{unreadCount}</Badge>}
 * 
 * // Open chat panel
 * <Button onClick={openChat}>Chat</Button>
 * ```
 */
export const useChat = () => {
  const {
    messages,
    unreadCount,
    isChatPanelOpen,
    sendMessage,
    markMessagesRead,
    toggleChatPanel,
  } = useRoomStore();

  const sendTextMessage = useCallback((content: string) => {
    sendMessage(content, 'text');
  }, [sendMessage]);

  const sendPrivateMessage = useCallback((content: string, targetId: string) => {
    sendMessage(content, 'private', targetId);
  }, [sendMessage]);

  const openChat = useCallback(() => {
    if (!isChatPanelOpen) {
      toggleChatPanel();
    }
    markMessagesRead();
  }, [isChatPanelOpen, toggleChatPanel, markMessagesRead]);

  const closeChat = useCallback(() => {
    if (isChatPanelOpen) {
      toggleChatPanel();
    }
  }, [isChatPanelOpen, toggleChatPanel]);

  return {
    messages,
    unreadCount,
    isChatPanelOpen,
    hasUnreadMessages: unreadCount > 0,
    sendTextMessage,
    sendPrivateMessage,
    openChat,
    closeChat,
    markMessagesRead,
  };
};
