'use client';

import { Clock, Loader2, Wifi, WifiOff } from 'lucide-react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';

interface WaitingScreenProps {
  roomName?: string | null;
  username: string | null;
  isConnected: boolean;
  isReconnecting?: boolean;
}

export function WaitingScreen({
  roomName,
  username,
  isConnected,
  isReconnecting = false,
}: WaitingScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Empty className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Clock className="h-12 w-12" />
          </EmptyMedia>
          <EmptyTitle>Waiting Room</EmptyTitle>
          <EmptyDescription>
            {roomName && (
              <span className="block mb-2">
                Room: <span className="font-medium">{roomName}</span>
              </span>
            )}
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for host approval...
            </span>
          </EmptyDescription>
        </EmptyHeader>
        
        <EmptyContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Joined as <span className="font-medium">{username || 'Guest'}</span>
            </p>

            <Badge variant={isReconnecting ? "outline" : isConnected ? "default" : "destructive"} className="gap-2">
              {isReconnecting ? (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span>Reconnecting...</span>
                </>
              ) : isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span>Disconnected</span>
                </>
              )}
            </Badge>

            <p className="text-xs text-muted-foreground">
              The host will be notified of your request. You&apos;ll be admitted to the room shortly.
            </p>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
