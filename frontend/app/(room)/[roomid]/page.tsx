'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useRoom, useParticipants, useChat, useMediaControls } from '@/hooks';
import { useMediaStream } from '@/hooks/useMediaStream';
import { createLogger } from '@/lib/logger';
import ChatPanel from '@/components/chat-panel/components/ChatPanel';
import ControlsPanel from '@/components/room/components/Controls';
import PermissionsScreen from '@/components/room/components/PermissionsScreen';
import { WaitingScreen } from '@/components/room/WaitingScreen';
import { LoadingScreen } from '@/components/room/LoadingScreen';
import ParticipantGrid from '@/components/participants/components/ParticipantGrid';
import ParticipantsPanel from '@/components/participants/components/ParticipantsPanel';
import SettingsPanel from '@/components/settings/components/SettingsPanel';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useRef } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

const logger = createLogger('Room');

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const roomId = params.roomid as string;
  const [permissionsGranted, setPermissionsGranted] = useState(() => {
    // Check localStorage for previously granted permissions
    if (typeof window !== 'undefined') {
      return localStorage.getItem('media-permissions-granted') === 'true';
    }
    return false;
  });
  const [speakingParticipants, setSpeakingParticipants] = useState<Set<string>>(new Set());
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const { requestPermissions, initializeStream, refreshDevices } = useMediaStream();
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
    isSettingsPanelOpen,
    pinnedParticipantId,
    gridLayout,
    handleError,
    toggleParticipantsPanel,
    toggleSettingsPanel,
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
      // Don't initialize stream yet - only when user enables audio/video
      setPermissionsGranted(true);
      // Store permissions grant in localStorage
      localStorage.setItem('media-permissions-granted', 'true');
    } catch (error) {
      handleError(error instanceof Error ? error.message : 'Failed to get permissions');
    }
  };

  // Check browser permissions on mount - don't auto-initialize stream
  useEffect(() => {
    const checkBrowserPermissions = async () => {
      if (typeof navigator === 'undefined' || !navigator.permissions) return;
      
      try {
        const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        const microphonePermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        
        // If both are granted, just set permissions flag (don't create stream yet)
        if (cameraPermission.state === 'granted' && microphonePermission.state === 'granted') {
          setPermissionsGranted(true);
          localStorage.setItem('media-permissions-granted', 'true');
        }
      } catch (error) {
        // Permissions API might not be fully supported, fall back to localStorage check
        logger.debug('Permissions API not available', { error });
      }
    };

    if (!permissionsGranted && status === 'authenticated' && !isWaitingRoom) {
      checkBrowserPermissions();
    }
  }, [status, permissionsGranted, isWaitingRoom]);

  // Audio level detection for speaking indicator (Local + Remote)
  useEffect(() => {
    if (!currentUserId) return;

    // Single AudioContext for all participants to avoid browser limits
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analysers = new Map<string, AnalyserNode>();
    const sources = new Map<string, MediaStreamAudioSourceNode>();
    const clonedTracks = new Map<string, MediaStreamTrack>();

    // Helper to setup detection for a stream
    const setupAudioDetection = (id: string, stream: MediaStream) => {
      if (analysers.has(id)) return; // Already setup

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      try {
        // Clone track to avoid interfering with video playback
        const track = audioTracks[0];
        const clonedTrack = track.clone();
        clonedTracks.set(id, clonedTrack);

        const sourceStream = new MediaStream([clonedTrack]);
        const source = audioContext.createMediaStreamSource(sourceStream);
        const analyser = audioContext.createAnalyser();
        
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);

        sources.set(id, source);
        analysers.set(id, analyser);
      } catch (err) {
        logger.error('Failed to setup audio detection', { participantId: id, error: err });
      }
    };

    // 1. Setup Local Stream
    if (localStream && isAudioEnabled) {
      setupAudioDetection(currentUserId, localStream);
    }

    // 2. Setup Remote Streams
    participants.forEach((p) => {
      if (p.id !== currentUserId && p.stream && unmutedParticipants.has(p.id)) {
        setupAudioDetection(p.id, p.stream);
      }
    });

    // Detection Loop
    const dataArray = new Uint8Array(256);
    const threshold = 0.02; // Sensitivity threshold
    let animationFrameId: number;

    const checkAudioLevels = () => {
      const speakingNow = new Set<string>();

      analysers.forEach((analyser, id) => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / dataArray.length / 255;
        
        if (average > threshold) {
          speakingNow.add(id);
        }
      });

      setSpeakingParticipants(prev => {
        // Only update if changed to avoid re-renders
        let changed = false;
        if (prev.size !== speakingNow.size) changed = true;
        else {
          for (const id of speakingNow) {
            if (!prev.has(id)) {
              changed = true;
              break;
            }
          }
        }
        return changed ? speakingNow : prev;
      });

      animationFrameId = requestAnimationFrame(checkAudioLevels);
    };

    checkAudioLevels();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      
      sources.forEach(source => source.disconnect());
      analysers.forEach(analyser => analyser.disconnect());
      clonedTracks.forEach(track => track.stop());
      
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [localStream, isAudioEnabled, currentUserId, participants, unmutedParticipants]);

  // Auto-hide controls on mouse inactivity (freeze when settings panel is open)
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      
      // Don't set hide timeout if settings panel is open
      if (isSettingsPanelOpen) return;
      
      // Clear existing timeout
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
      
      // Set new timeout to hide controls after 3 seconds of inactivity
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    // Show controls initially or when settings panel opens
    setShowControls(true);
    
    // Clear timeout when settings panel opens
    if (isSettingsPanelOpen && hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
      hideControlsTimeout.current = null;
    }
    
    // Add mouse move listener
    window.addEventListener('mousemove', handleMouseMove);
    
    // Initial timeout (only if settings panel is closed)
    if (!isSettingsPanelOpen) {
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, [isSettingsPanelOpen]);

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
      toggleSettingsPanel: toggleSettingsPanel,
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

  // Show loading screen during authentication or initial connection
  if (status === 'loading') {
    return <LoadingScreen status="authenticating" />;
  }

  // Show loading screen while initializing room connection (prevents waiting room flash)
  // Also show loading if we're authenticated but haven't received room state yet (currentUserId not set)
  if (status === 'authenticated' && (connectionState.isInitializing || !currentUserId)) {
    return <LoadingScreen status="connecting" />;
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

  // Show waiting screen ONLY if user is in waiting room AND initialization is complete
  // This prevents the flash of waiting room during the initial connection
  if (isWaitingRoom && !connectionState.isInitializing) {
    return (
      <WaitingScreen
        roomName={roomName}
        username={session?.user?.name || session?.user?.email || 'Guest'}
        isConnected={connectionState.wsConnected}
        isReconnecting={connectionState.wsReconnecting}
      />
    );
  }

  // Show permissions screen ONLY after initialization AND when not in waiting room
  // This prevents the flash of permissions screen during initial load
  if (!permissionsGranted && !isWaitingRoom && !connectionState.isInitializing) {
    return (
      <PermissionsScreen
        permissionError={null}
        onRequestPermissions={handleRequestPermissions}
        onSkipPermissions={() => {
          setPermissionsGranted(true);
          localStorage.setItem('media-permissions-granted', 'true');
        }}
      />
    );
  }

  // If permissions not granted yet but still initializing, show loading (catch-all)
  if (!permissionsGranted) {
    return <LoadingScreen status="loading" />;
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Area */}
        <div className={`flex-1 flex flex-col relative ${!showControls ? 'cursor-none' : ''}`}>
          <div className="flex-1 bg-[#1a1a1a] overflow-hidden relative">
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
                }
              }}
              onRemoveParticipant={(id) => {
                // Host can remove participants via WebSocket
                if (isHost && wsClient && clientInfo) {
                  // TODO: Implement remove participant event
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

        {/* Settings Panel - Centered Modal */}
        {isSettingsPanelOpen && (
          <SettingsPanel
            gridLayout={gridLayout}
            setGridLayout={setGridLayout}
            refreshDevices={refreshDevices}
            onClose={() => toggleSettingsPanel()}
          />
        )}
      </div>
    </div>
  );
}
