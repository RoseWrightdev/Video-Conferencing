'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useRoom, useParticipants, useChat, useMediaControls } from '@/hooks';
import { useMediaStream } from '@/hooks/useMediaStream';
import ChatPanel from '@/components/chat-panel/components/ChatPanel';
import ControlsPanel from '@/components/room/components/Controls';
import PermissionsScreen from '@/components/room/components/PermissionsScreen';
import { WaitingScreen } from '@/components/room/WaitingScreen';
import ParticipantGrid, { type GridLayout } from '@/components/participants/components/ParticipantGrid';
import ParticipantsPanel from '@/components/participants/components/ParticipantsPanel';
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
  const [isParticipantsPanelOpen, setIsParticipantsPanelOpen] = useState(false);
  const [speakingParticipants, setSpeakingParticipants] = useState<Set<string>>(new Set());
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<GridLayout>('gallery');

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
    
    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;
    microphone.connect(analyser);

    let animationFrame: number;
    const detectSpeaking = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      
      // Threshold for speaking detection (lower = more sensitive)
      const isSpeaking = average > 3;
      
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
          <div className="flex-1 bg-[#1a1a1a] overflow-hidden relative">
            {/* Layout Mode Selector */}
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <select
                value={layoutMode}
                onChange={(e) => setLayoutMode(e.target.value as typeof layoutMode)}
                className="px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white text-sm border border-white/10 hover:bg-black/70 transition-colors"
              >
                <option value="gallery">Gallery</option>
                <option value="speaker">Speaker</option>
                <option value="sidebar">Sidebar</option>
              </select>
            </div>

            {/* Participant Grid */}
            <ParticipantGrid
              participants={Array.from(participants.values())}
              currentUserId={currentUserId || undefined}
              pinnedParticipantId={pinnedParticipantId}
              layout={layoutMode}
              unmutedParticipants={unmutedParticipants}
              cameraOnParticipants={cameraOnParticipants}
              sharingScreenParticipants={sharingScreenParticipants}
              raisingHandParticipants={raisingHandParticipants}
              speakingParticipants={speakingParticipants}
              onPinParticipant={(id) => {
                setPinnedParticipantId(pinnedParticipantId === id ? null : id);
              }}
            />
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

        {/* Participants Panel - Right Side */}
        {isParticipantsPanelOpen && (
          <ParticipantsPanel
            participants={Array.from(participants.values())}
            waitingParticipants={Array.from(waitingParticipants.values())}
            currentUserId={currentUserId || undefined}
            isHost={isHost || false}
            onClose={() => setIsParticipantsPanelOpen(false)}
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
          />
        )}
      </div>
    </div>
  );
}
