'use client';

import { Loader2 } from 'lucide-react';

interface LoadingScreenProps {
  status?: 'connecting' | 'authenticating' | 'joining' | 'loading';
  message?: string;
}

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
