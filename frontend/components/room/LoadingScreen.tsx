'use client';

import { Loader2 } from 'lucide-react';

interface LoadingScreenProps {
  status?: 'connecting' | 'authenticating' | 'joining' | 'loading';
  message?: string;
}

/**
 * Loading screen displayed during initial room connection.
 * 
 * Prevents the flash of waiting room content when refreshing or first loading the room page.
 * Shows while:
 * - Establishing WebSocket connection
 * - Authenticating with JWT token
 * - Receiving initial room state
 * - Determining waiting room vs. active room status
 * 
 * @param status - Current loading phase for appropriate messaging
 * @param message - Optional custom message to display
 */
export function LoadingScreen({ status = 'loading', message }: LoadingScreenProps) {
  const statusMessages = {
    authenticating: 'Authenticating...',
    connecting: 'Connecting to room...',
    joining: 'Joining room...',
    loading: 'Loading...',
  };

  const displayMessage = message || statusMessages[status];

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-xl font-semibold">{displayMessage}</h2>
          <p className="text-sm text-muted-foreground">Please wait...</p>
        </div>
      </div>
    </div>
  );
}
