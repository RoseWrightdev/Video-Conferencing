import { useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Chat functionality for video conferencing
 * 
 * @example
 * ```tsx
 * const { sendTextMessage, openChat, hasUnreadMessages } = useChat();
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
