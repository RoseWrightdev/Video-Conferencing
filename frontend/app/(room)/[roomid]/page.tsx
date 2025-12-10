'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useRoom, useParticipants, useChat, useMediaControls } from '@/hooks';
import { useMediaStream } from '@/hooks/useMediaStream';
import ChatPanel from '@/components/chat-panel/components/ChatPanel';
import ControlsPanel from '@/components/room/components/Controls';
import PermissionsScreen from '@/components/room/components/PermissionsScreen';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const roomId = params.roomid as string;
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isParticipantsPanelOpen, setIsParticipantsPanelOpen] = useState(false);

  const { requestPermissions, initializeStream } = useMediaStream();
  const { 
    localStream, 
    leaveRoom, 
    wsClient, 
    clientInfo, 
    raisingHandParticipants,
    setHandRaised 
  } = useRoomStore();

  const { 
    currentUserId, 
    connectionState 
  } = useRoom({
    roomId,
    username: session?.user?.name || session?.user?.email || 'Anonymous',
    token: session?.accessToken,
    autoJoin: status === 'authenticated' && !!session?.accessToken,
  });

  const { messages, sendTextMessage, closeChat, isChatPanelOpen, toggleChatPanel, unreadCount, markMessagesRead } = useChat();
  const { getParticipant } = useParticipants();
  const { 
    isAudioEnabled, 
    isVideoEnabled, 
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare
  } = useMediaControls();

  const isConnecting = status === 'authenticated' && !connectionState.wsConnected;

  const handleRequestPermissions = async () => {
    try {
      setPermissionError(null);
      await requestPermissions();
      // Actually initialize the media stream after permissions granted
      await initializeStream();
      setPermissionsGranted(true);
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : 'Failed to get permissions');
    }
  };

  // Auto-initialize stream when authenticated
  useEffect(() => {
    if (status === 'authenticated' && !localStream && !permissionsGranted) {
      console.log('Auto-requesting permissions...');
      handleRequestPermissions();
    }
  }, [status]);

  // Connect video element to local stream
  useEffect(() => {
    if (videoElement && localStream) {
      console.log('Connecting video element to stream:', localStream);
      videoElement.srcObject = localStream;
      videoElement.play().catch((e: Error) => console.error('Error playing video:', e));
    }
  }, [videoElement, localStream]);

  // Audio level detection for speaking indicator
  useEffect(() => {
    if (!localStream || !isAudioEnabled) {
      setIsSpeaking(false);
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(localStream);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;
    microphone.connect(analyser);

    let animationFrame: number;
    const detectSpeaking = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      
      // Threshold for speaking detection (lower = more sensitive)
      setIsSpeaking(average > 3);
      
      animationFrame = requestAnimationFrame(detectSpeaking);
    };

    detectSpeaking();

    return () => {
      cancelAnimationFrame(animationFrame);
      microphone.disconnect();
      analyser.disconnect();
      audioContext.close();
    };
  }, [localStream, isAudioEnabled]);

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

  const controlDependencies = {
    mediaService: {
      isAudioEnabled,
      isVideoEnabled,
      isScreenSharing,
      toggleAudio,
      toggleVideo,
      startScreenShare: toggleScreenShare,
      stopScreenShare: toggleScreenShare,
      requestScreenShare: async () => {
        await toggleScreenShare();
        return isScreenSharing;
      },
    },
    roomControlService: {
      isHost: false,
      isMuted: !isAudioEnabled,
      isHandRaised: currentUserId ? raisingHandParticipants.has(currentUserId) : false,
      canScreenShare: true,
      leaveRoom: () => {
        leaveRoom();
        router.push('/');
      },
      toggleParticipantsPanel: () => {
        setIsParticipantsPanelOpen(!isParticipantsPanelOpen);
      },
      toggleChatPanel: toggleChatPanel,
      toggleHand: () => {
        if (!wsClient || !clientInfo || !currentUserId) return;
        
        const isCurrentlyRaised = raisingHandParticipants.has(currentUserId);
        
        if (isCurrentlyRaised) {
          wsClient.lowerHand(clientInfo);
          setHandRaised(currentUserId, false);
        } else {
          wsClient.raiseHand(clientInfo);
          setHandRaised(currentUserId, true);
        }
      },
    },
    chatService: {
      unreadCount,
      markMessagesRead,
    },
  };

  if (status === 'loading') {
    return <div className="p-10 text-center">Loading...</div>;
  }

  if (status === 'unauthenticated') {
    return (
      <div className="p-10 text-center max-w-md mx-auto">
        <h1 className="mb-5">Sign In Required</h1>
        <p className="mb-8 text-muted-foreground">Please sign in to join the room.</p>
        <Button onClick={() => signIn('auth0')} size="lg">Sign In with Auth0</Button>
      </div>
    );
  }

  if (!permissionsGranted) {
    return (
      <PermissionsScreen
        permissionError={permissionError}
        onRequestPermissions={handleRequestPermissions}
        onSkipPermissions={() => setPermissionsGranted(true)}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-lg font-semibold">Room: {roomId}</h2>
          <p className="text-sm text-muted-foreground">
            {session?.user?.name || session?.user?.email}
          </p>
        </div>
        <div>
          {isConnecting && <span className="text-muted-foreground">Connecting...</span>}
          {connectionState.wsConnected && <span className="text-green-600">✓ Connected</span>}
          {!connectionState.wsConnected && !isConnecting && (
            <span className="text-orange-500">⚠ Offline</span>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 bg-[#1a1a1a] flex items-center justify-center relative">
            <video
              ref={setVideoElement}
              autoPlay
              playsInline
              muted
              className={`max-w-full max-h-full object-contain rounded-lg transition-all duration-200 ${
                isSpeaking ? 'ring-4 ring-green-500 shadow-lg shadow-green-500/50' : ''
              }`}
              style={{ transform: 'scaleX(-1)' }}
            />
            {!localStream && (
              <div className="text-center absolute">
                <p className="text-muted-foreground mb-2">Initializing camera...</p>
                <p className="text-sm text-muted-foreground/70">hasStream: {String(!!localStream)}</p>
              </div>
            )}
          </div>
          
          {/* Controls at bottom of video */}
          <div className="shrink-0 flex justify-center py-4 backdrop-blur bg-black">
            <ControlsPanel dependencies={controlDependencies} />
          </div>
        </div>

        {/* Chat Panel - Right Side */}
        {isChatPanelOpen && (
          <div className="w-[400px] border-l shrink-0 flex flex-col bg-black">
            <ChatPanel dependencies={chatDependencies} />
          </div>
        )}
      </div>
    </div>
  );
}
