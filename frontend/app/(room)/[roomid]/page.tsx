'use client';

import { useParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useRoom, useChat,} from '@/hooks';
import { useMediaStream } from '@/hooks/useMediaStream';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';
import { createLogger } from '@/lib/logger';
import ChatPanel from '@/components/chat-panel/components/ChatPanel';
import ControlBar from '@/components/room/components/Controls';
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
    screenShareStream,
    isAudioEnabled,
    raisingHandParticipants,
    participants,
    unmutedParticipants,
    cameraOnParticipants,
    sharingScreenParticipants,
    isWaitingRoom,
    roomName,
    isParticipantsPanelOpen,
    isSettingsPanelOpen,
    pinnedParticipantId,
    gridLayout,
    handleError,
    toggleSettingsPanel,
    setGridLayout,
    pinParticipant,
  } = useRoomStore();

  const {
    currentUserId,
    connectionState,
  } = useRoom({
    roomId,
    username: session?.user?.name || session?.user?.email || 'Anonymous',
    token: session?.accessToken,
    autoJoin: status === 'authenticated' && !!session?.accessToken,
  });

  const { isChatPanelOpen } = useChat();

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

  // Audio Level Detection
  useAudioVisualizer({
    currentUserId,
    localStream,
    isAudioEnabled,
    participants,
    unmutedParticipants,
    setSpeakingParticipants,
  });

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

  // Show loading screen during authentication or initial connection
  if (status === 'loading') {
    return <LoadingScreen status="authenticating" />;
  }

  // Show loading screen while initializing room connection (prevents waiting room flash)
  // Don't block on currentUserId alone - user might be in waiting room with a valid userId
  if (status === 'authenticated' && connectionState.isInitializing) {
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
              screenShareStream={screenShareStream}
              onPinParticipant={(id) => {
                pinParticipant(pinnedParticipantId === id ? null : id);
              }}
            />
          </div>

          {/* Controls at bottom of video - auto-hide on inactivity */}
          <div
            className={`absolute bottom-0 left-0 right-0 z-30 flex justify-center py-4 transition-all duration-300 ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
          >
            <ControlBar />
          </div>
        </div>

        {/* Chat Panel - Right Side */}
        {isChatPanelOpen && (
          <ChatPanel />
        )}

        {/* Participants Panel - Left Side */}
        {isParticipantsPanelOpen && (
          <div className="absolute inset-0 pointer-events-none">
            <ParticipantsPanel className="pointer-events-auto" />
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
