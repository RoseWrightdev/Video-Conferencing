'use client';

import { useParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useRoom, useParticipants, useChat } from '@/hooks';
import ChatPanel from '@/components/chat-panel/components/ChatPanel';
import { Button } from '@/components/ui/button';

export default function RoomPage() {
  const params = useParams();
  const { data: session, status } = useSession();
  const roomId = params.roomid as string;

  const { 
    currentUserId, 
    connectionState 
  } = useRoom({
    roomId,
    username: session?.user?.name || session?.user?.email || 'Anonymous',
    token: session?.accessToken,
    autoJoin: status === 'authenticated' && !!session?.accessToken,
  });

  const { messages, sendTextMessage, closeChat } = useChat();
  const { getParticipant } = useParticipants();

  const isConnecting = status === 'authenticated' && !connectionState.wsConnected;

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

  if (status === 'loading') {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  if (status === 'unauthenticated') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', maxWidth: '500px', margin: '0 auto' }}>
        <h1 style={{ marginBottom: '20px' }}>Sign In Required</h1>
        <p style={{ marginBottom: '30px', color: '#666' }}>Please sign in to join the room.</p>
        <Button onClick={() => signIn('auth0')} size="lg">Sign In with Auth0</Button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Room: {roomId}</h2>
          <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
            {session?.user?.name || session?.user?.email}
          </p>
        </div>
        <div>
          {isConnecting && <span style={{ color: '#666' }}>Connecting...</span>}
          {connectionState.wsConnected && <span style={{ color: 'green' }}>✓ Connected</span>}
          {!connectionState.wsConnected && !isConnecting && (
            <span style={{ color: 'orange' }}>⚠ Offline</span>
          )}
        </div>
      </div>
      <ChatPanel dependencies={chatDependencies} />
    </div>
  );
}
