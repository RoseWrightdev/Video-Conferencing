'use client';

import { ArrowRight, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

interface LobbyScreenProps {
  roomId: string;
  username: string;
  onJoin: () => void;
}

export function LobbyScreen({ roomId, username, onJoin }: LobbyScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 animate-in fade-in duration-500">
      <Empty className="max-w-md shadow-2xl border bg-card/50 backdrop-blur-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="bg-primary/10 text-primary mb-6">
            <Video className="h-12 w-12" />
          </EmptyMedia>
          <EmptyTitle className="text-2xl">Ready to Join?</EmptyTitle>
          <EmptyDescription className="text-base">
            You are about to join room <span className="font-semibold text-foreground">{roomId}</span>
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="space-y-6 mt-8">
          <div className="flex flex-col items-center gap-2">
            <div className="h-16 w-16 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white shadow-lg mb-2">
              {username.substring(0, 2).toUpperCase()}
            </div>
            <p className="text-sm text-muted-foreground">
              Joining as <span className="font-medium text-foreground">{username}</span>
            </p>
          </div>
          <Button
            size="lg"
            className="w-full text-lg h-12 gap-2 shadow-lg hover:shadow-primary/25 transition-all"
            onClick={onJoin}
          >
            Join Room <ArrowRight className="h-5 w-5" />
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Clicking Join ensures your audio and video connect automatically.
          </p>
        </EmptyContent>
      </Empty>
    </div>
  );
}
