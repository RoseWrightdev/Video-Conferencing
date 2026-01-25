'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useRoom, usePermissions } from '@/hooks';
import { useMediaStream } from '@/hooks/useMediaStream';
import PermissionsScreen from '@/components/room/components/PermissionsScreen';
import { WaitingScreen } from '@/components/room/WaitingScreen';
import { LoadingScreen } from '@/components/room/LoadingScreen';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import { toast } from "sonner";
import { ActiveRoom } from '@/components/room/ActiveRoom';

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomid as string;
  const router = useRouter();
  
  const { data: session, status } = useSession();
  const [hasJoinedLobby, setHasJoinedLobby] = useState(false);
  const { requestPermissions, refreshDevices } = useMediaStream();
  const { isWaitingRoom, roomName, handleError } = useRoomStore();
  const { permissionsGranted, setPermissionsGranted, handleRequestPermissions } = usePermissions({
    requestPermissions,
    setHasJoinedLobby,
    handleError
  });
  const { connectionState, isKicked } = useRoom({
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
