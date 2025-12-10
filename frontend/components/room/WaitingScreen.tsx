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
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
            <Clock className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">Waiting Room</h1>
          {roomName && (
            <p className="text-sm text-gray-400">
              Room: <span className="font-medium text-gray-300">{roomName}</span>
            </p>
          )}
        </div>

        {/* Status */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            <span className="text-gray-300">
              Waiting for host approval...
            </span>
          </div>

          <p className="text-sm text-gray-400">
            Joined as <span className="font-medium text-gray-300">{username || 'Guest'}</span>
          </p>
        </div>

        {/* Connection Status Badge */}
        <div className="flex items-center justify-center gap-2 rounded-lg bg-black/20 px-4 py-2">
          {isReconnecting ? (
            <>
              <WifiOff className="h-4 w-4 text-orange-400" />
              <span className="text-sm text-orange-400">Reconnecting...</span>
            </>
          ) : isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-green-400" />
              <span className="text-sm text-green-400">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-red-400" />
              <span className="text-sm text-red-400">Disconnected</span>
            </>
          )}
        </div>

        {/* Info Message */}
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-sm text-gray-300">
            The host will be notified of your request. You&apos;ll be admitted to the room shortly.
          </p>
        </div>
      </div>
    </div>
  );
}
