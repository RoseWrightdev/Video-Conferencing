'use client';

import { Clock, Loader2, Wifi, WifiOff } from 'lucide-react';

interface WaitingScreenProps {
  roomName?: string | null;
  username: string | null;
  isConnected: boolean;
  isReconnecting?: boolean;
}

/**
 * WaitingScreen displays a friendly interface for users in the waiting room.
 * 
 * Shows:
 * - Room name and user's display name
 * - Connection status with animated indicators
 * - Informative message about host approval
 * - Reconnection state when network issues occur
 * 
 * Design:
 * - Centered layout with frosted glass effect
 * - Animated loading spinner
 * - Connection status badge with icon
 * - Responsive text sizing
 * 
 * @example
 * ```tsx
 * <WaitingScreen
 *   roomName="Team Standup"
 *   username="Alice"
 *   isConnected={true}
 *   isReconnecting={false}
 * />
 * ```
 */
export function WaitingScreen({
  roomName,
  username,
  isConnected,
  isReconnecting = false,
}: WaitingScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Clock className="h-12 w-12 text-muted-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Waiting Room</h1>
          {roomName && (
            <p className="text-sm text-muted-foreground">
              Room: <span className="font-medium">{roomName}</span>
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Waiting for host approval...</span>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Joined as <span className="font-medium">{username || 'Guest'}</span>
          </p>

          <div className="flex items-center justify-center gap-2 text-sm">
            {isReconnecting ? (
              <>
                <WifiOff className="h-4 w-4 text-orange-500" />
                <span className="text-orange-500">Reconnecting...</span>
              </>
            ) : isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-green-500">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <span className="text-red-500">Disconnected</span>
              </>
            )}
          </div>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              The host will be notified of your request. You&apos;ll be admitted to the room shortly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
