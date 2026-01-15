'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useRoom } from '@/hooks';
import { useMediaStream } from '@/hooks/useMediaStream';
import { createLogger } from '@/lib/logger';
import PermissionsScreen from '@/components/room/components/PermissionsScreen';
import { WaitingScreen } from '@/components/room/WaitingScreen';
import { LoadingScreen } from '@/components/room/LoadingScreen';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { toast } from "sonner";
import { ActiveRoom } from '@/components/room/ActiveRoom';

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


  const { requestPermissions, refreshDevices } = useMediaStream();
  const {
    isWaitingRoom,
    roomName,
    handleError,
  } = useRoomStore();


  const {
    currentUserId,
    connectionState,
    isKicked,
  } = useRoom({
    roomId,
    username: session?.user?.name || 'Guest',
    token: session?.accessToken,
    autoJoin: hasJoinedLobby
  });

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
    <ActiveRoom
      permissionsGranted={permissionsGranted}
      refreshDevices={refreshDevices}
    />
  );
}
