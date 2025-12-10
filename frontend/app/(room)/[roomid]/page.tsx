'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useRoom, useParticipants, useChat, useMediaControls } from '@/hooks';
import { useMediaStream } from '@/hooks/useMediaStream';
import ChatPanel from '@/components/chat-panel/components/ChatPanel';
import ControlsPanel from '@/components/room/components/Controls';
import PermissionsScreen from '@/components/room/components/PermissionsScreen';
import { WaitingScreen } from '@/components/room/WaitingScreen';
import ParticipantGrid from '@/components/participants/components/ParticipantGrid';
import ParticipantsPanel from '@/components/participants/components/ParticipantsPanel';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useRef } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const roomId = params.roomid as string;
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [speakingParticipants, setSpeakingParticipants] = useState<Set<string>>(new Set());
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const { requestPermissions, initializeStream } = useMediaStream();
  const { 
    localStream, 
    leaveRoom, 
    wsClient, 
    clientInfo, 
    raisingHandParticipants,
    setHandRaised,
    participants,
    unmutedParticipants,
    cameraOnParticipants,
    sharingScreenParticipants,
    waitingParticipants,
    isWaitingRoom,
    roomName,
    approveParticipant,
    kickParticipant,
    isParticipantsPanelOpen,
    pinnedParticipantId,
    gridLayout,
    handleError,
    toggleParticipantsPanel,
    setGridLayout,
    pinParticipant,
  } = useRoomStore();

  const { 
    currentUserId, 
    connectionState,
    isHost 
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


  const handleRequestPermissions = async () => {
    try {
      await requestPermissions();
      // Actually initialize the media stream after permissions granted
      await initializeStream();
      setPermissionsGranted(true);
    } catch (error) {
      handleError(error instanceof Error ? error.message : 'Failed to get permissions');
    }
  };

  // Auto-initialize stream when authenticated
  useEffect(() => {
    if (status === 'authenticated' && !localStream && !permissionsGranted) {
      handleRequestPermissions();
    }
  }, [status]);

  // Audio level detection for speaking indicator
  useEffect(() => {
    if (!localStream || !isAudioEnabled || !currentUserId) {
      setSpeakingParticipants(prev => {
        const next = new Set(prev);
        if (currentUserId) next.delete(currentUserId);
        return next;
      });
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(localStream);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // More responsive settings for better speech detection
    analyser.smoothingTimeConstant = 0.3; // Reduced from 0.8 for faster response
    analyser.fftSize = 2048; // Increased for better frequency resolution
    microphone.connect(analyser);

    let animationFrame: number;
    const detectSpeaking = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      
      // More sensitive threshold for clearer audio detection
      const isSpeaking = average > 2; // Lowered from 3 for higher sensitivity
      
      setSpeakingParticipants(prev => {
        const next = new Set(prev);
        if (isSpeaking) {
          next.add(currentUserId);
        } else {
          next.delete(currentUserId);
        }
        return next;
      });
      
      animationFrame = requestAnimationFrame(detectSpeaking);
    };

    detectSpeaking();

    return () => {
      cancelAnimationFrame(animationFrame);
      microphone.disconnect();
      analyser.disconnect();
      audioContext.close();
    };
  }, [localStream, isAudioEnabled, currentUserId]);

  // Auto-hide controls on mouse inactivity
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      
      // Clear existing timeout
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
      
      // Set new timeout to hide controls after 3 seconds of inactivity
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    // Show controls initially
    setShowControls(true);
    
    // Add mouse move listener
    window.addEventListener('mousemove', handleMouseMove);
    
    // Initial timeout
    hideControlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, []);

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
      isHost: isHost || false,
      isMuted: !isAudioEnabled,
      isHandRaised: currentUserId ? raisingHandParticipants.has(currentUserId) : false,
      canScreenShare: true,
      leaveRoom: () => {
        leaveRoom();
        router.push('/');
      },
      toggleParticipantsPanel: toggleParticipantsPanel,
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
        permissionError={null}
        onRequestPermissions={handleRequestPermissions}
        onSkipPermissions={() => setPermissionsGranted(true)}
      />
    );
  }

  // Show waiting screen if user is in waiting room
  if (isWaitingRoom) {
    return (
      <WaitingScreen
        roomName={roomName}
        username={session?.user?.name || session?.user?.email || 'Guest'}
        isConnected={connectionState.wsConnected}
        isReconnecting={connectionState.wsReconnecting}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Area */}
        <div className="flex-1 flex flex-col relative">
          <div className="flex-1 bg-[#1a1a1a] overflow-hidden relative pb-24">
            {/* Participant Grid */}
            <ParticipantGrid
              participants={Array.from(participants.values())}
              currentUserId={currentUserId || undefined}
              pinnedParticipantId={pinnedParticipantId}
              layout={gridLayout}
              onLayoutChange={(layout) => setGridLayout(layout)}
              unmutedParticipants={unmutedParticipants}
              cameraOnParticipants={cameraOnParticipants}
              sharingScreenParticipants={sharingScreenParticipants}
              raisingHandParticipants={raisingHandParticipants}
              speakingParticipants={speakingParticipants}
              onPinParticipant={(id) => {
                pinParticipant(pinnedParticipantId === id ? null : id);
              }}
            />
          </div>
          
          {/* Controls at bottom of video - auto-hide on inactivity */}
          <div 
            className={`absolute bottom-0 left-0 right-0 z-30 flex justify-center py-4 transition-all duration-300 ${
              showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          >
            <ControlsPanel dependencies={controlDependencies} />
          </div>
        </div>

        {/* Chat Panel - Right Side */}
        {isChatPanelOpen && (
            <ChatPanel dependencies={chatDependencies} />
        )}

        {/* Participants Panel - Left Side */}
        {isParticipantsPanelOpen && (
          <div className="absolute inset-0 pointer-events-none">
            <ParticipantsPanel
              participants={Array.from(participants.values())}
              waitingParticipants={Array.from(waitingParticipants.values())}
              currentUserId={currentUserId || undefined}
              isHost={isHost || false}
              onClose={() => toggleParticipantsPanel()}
              onMuteParticipant={(id) => {
                // Host can mute participants via WebSocket
                if (isHost && wsClient && clientInfo) {
                  // TODO: Implement mute participant event
                  console.log('Mute participant:', id);
                }
              }}
              onRemoveParticipant={(id) => {
                // Host can remove participants via WebSocket
                if (isHost && wsClient && clientInfo) {
                  // TODO: Implement remove participant event
                  console.log('Remove participant:', id);
                }
              }}
              onApproveWaiting={(id) => {
                if (isHost) {
                  approveParticipant(id);
                }
              }}
              onDenyWaiting={(id) => {
                if (isHost) {
                  kickParticipant(id);
                }
              }}
              unmutedParticipants={unmutedParticipants}
              cameraOnParticipants={cameraOnParticipants}
              sharingScreenParticipants={sharingScreenParticipants}
              raisingHandParticipants={raisingHandParticipants}
              className="pointer-events-auto"
            />
          </div>
        )}
      </div>
    </div>
  );
}
