'use client';

import { useRoom, useParticipants, useChat } from '@/hooks';
import ChatPanel from '@/components/chat-panel/components/ChatPanel';

export default function RoomPage() {
  const { currentUserId } = useRoom();
  const { messages, sendTextMessage, closeChat } = useChat();
  const { getParticipant } = useParticipants();

  const chatDependencies = {
    chatService: {
      messages: messages,
      sendChat: sendTextMessage,
      closeChat: closeChat,
    },
    roomService: {
      currentUserId: currentUserId,
    },
    participantService: {
      getParticipant: getParticipant,
    },
  };

  return (
    <div style={{ padding: '20px' }}>
      <ChatPanel dependencies={chatDependencies} />
    </div>
  );
}
