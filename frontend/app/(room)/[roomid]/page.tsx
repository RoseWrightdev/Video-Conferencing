'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useRoom, useChat, } from '@/hooks';
import { useMediaStream } from '@/hooks/useMediaStream';
import { useAudioDetection } from '@/hooks/useAudioDetection';
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
import LeaveRoomDialog from '@/components/room/components/LeaveRoomDialog';
import { toast } from "sonner";

const logger = createLogger('Room');

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const roomId = params.roomid as string;

  // [AUTO-PLAY FIX] Force a user interaction before joining to unlock AudioContext
  const [hasJoinedLobby, setHasJoinedLobby] = useState(false);

  const [permissionsGranted, setPermissionsGranted] = useState(() => {
    // Check localStorage for previously granted permissions
    if (typeof window !== 'undefined') {
      return localStorage.getItem('media-permissions-granted') === 'true';
    }
    return false;
  });

  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    hideControlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    // Start initial timer
    handleMouseMove();
    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, []);

  const { requestPermissions, refreshDevices } = useMediaStream();
  const {
    screenShareStream,
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

  const speakingParticipants = useAudioDetection(
    Array.from(participants.values()),
    0.02,
    permissionsGranted
  );

  const {
    currentUserId,
    connectionState,
    isKicked,
  } = useRoom({
    roomId,
    username: session?.user?.name || session?.user?.email || 'Anonymous',
    token: session?.accessToken,
    // only auto-join if authenticated AND user has clicked "Join" in Lobby
    autoJoin: status === 'authenticated' && !!session?.accessToken && hasJoinedLobby,
  });

  const { isChatPanelOpen } = useChat();

  // Handle kick redirect
  useEffect(() => {
    if (isKicked || connectionState.lastError?.includes('kicked')) {
      toast.error('You have been kicked from the room.');
      router.push('/');
    }
  }, [isKicked, connectionState.lastError, router]);

  const handleRequestPermissions = async () => {
    // If permissions already granted (or just granted), this acts as the "Join" button
    if (permissionsGranted) {
      setHasJoinedLobby(true);
      return;
    }

    try {
      await requestPermissions();
      // Don't initialize stream yet - only when user enables audio/video
      setPermissionsGranted(true);
      // Store permissions grant in localStorage
      localStorage.setItem('media-permissions-granted', 'true');

      // Auto-join after granting permissions (counts as interaction)
      setHasJoinedLobby(true);
    } catch (error) {
      handleError(error instanceof Error ? error.message : 'Failed to get permissions');
    }
  };

  // Show waiting screen as soon as we know we are in it, regardless of initialization
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

  // Show loading screen during authentication or initial connection
  if (status === 'loading') {
    return <LoadingScreen status="authenticating" />;
  }

  // Show loading screen while initializing room connection (prevents waiting room flash)
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



  // UNIFIED PRE-JOIN SCREEN (Permissions + Lobby)
  // Show if we haven't actively joined the lobby yet (and aren't waiting/initializing)
  if (!hasJoinedLobby && !isWaitingRoom && !connectionState.isInitializing) {
    return (
      <PermissionsScreen
        permissionError={null}
        hasPermissions={permissionsGranted}
        onRequestPermissions={handleRequestPermissions}
        onSkipPermissions={() => {
          setPermissionsGranted(true);
          setHasJoinedLobby(true);
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
    <div
      className="h-screen w-screen flex flex-col overflow-hidden bg-background"
      onMouseMove={handleMouseMove}
    >
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

      {/* Global Modals */}
      <LeaveRoomDialog />
    </div>
  );
}
