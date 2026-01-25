'use client';

import { cn } from '@/lib/utils';
import ParticipantTile from './ParticipantTile';
import type { Participant } from '@/store/types';
import { AspectRatio } from "@/components/ui/aspect-ratio";

export type GridLayout = 'gallery' | 'speaker' | 'sidebar';

export interface ParticipantGridProps {
  participants: Participant[];
  currentUserId?: string;
  pinnedParticipantId?: string | null;
  layout?: GridLayout;
  onPinParticipant?: (participantId: string) => void;
  onLayoutChange?: (layout: GridLayout) => void;
  className?: string;
  unmutedParticipants?: Set<string>;
  cameraOnParticipants?: Set<string>;
  sharingScreenParticipants?: Set<string>;
  raisingHandParticipants?: Set<string>;
  speakingParticipants?: Set<string>;
  screenShareStream?: MediaStream | null;
}

export default function ParticipantGrid({
  participants,
  currentUserId,
  pinnedParticipantId,
  layout = 'gallery',
  onPinParticipant,
  className,
  sharingScreenParticipants = new Set(),
  speakingParticipants = new Set(),
  screenShareStream,
}: ParticipantGridProps) {
  const getFeaturedParticipant = (): Participant | null => {
    if (pinnedParticipantId) {
      return participants.find(p => p.id === pinnedParticipantId) || null;
    }

    const screenSharer = participants.find(p => sharingScreenParticipants.has(p.id));
    if (screenSharer) return screenSharer;

    const speaker = participants.find(p => speakingParticipants.has(p.id));
    if (speaker) return speaker;

    return participants[0] || null;
  };

  const getGridColumns = (count: number): string => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
    if (count <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    if (count <= 9) return 'grid-cols-2 lg:grid-cols-3';
    if (count <= 12) return 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
  };

  if (participants.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center">
          <p className="text-muted-foreground">No participants yet</p>
          <p className="text-sm text-muted-foreground/70 mt-2">
            Waiting for others to join...
          </p>
        </div>
      </div>
    );
  }

  if (layout === 'gallery') {
    if (participants.length === 1) {
      return (
        <div className={cn('w-full h-full p-8 flex items-center justify-center', className)}>
          <div className="w-full max-w-7xl">
            <AspectRatio ratio={16 / 9}>
              <ParticipantTile
                key={participants[0].id}
                participant={participants[0]}
                isAudioEnabled={participants[0].isAudioEnabled}
                isVideoEnabled={participants[0].isVideoEnabled}
                isScreenSharing={participants[0].isScreenSharing}
                isHandRaised={participants[0].isHandRaised}
                isSpeaking={speakingParticipants.has(participants[0].id)}
                isLocal={participants[0].id === currentUserId}
                isPinned={participants[0].id === pinnedParticipantId}
                onPin={onPinParticipant}
                screenShareStream={participants[0].id === currentUserId ? screenShareStream : undefined}
              />
            </AspectRatio>
          </div>
        </div>
      );
    }

    // Multiple participants - use grid
    return (
      <div className={cn('w-full h-full p-4 relative', className)}>
        <div className={cn('grid gap-4 w-full h-full', getGridColumns(participants.length))}>
          {participants.map((participant) => (
            <ParticipantTile
              key={participant.id}
              participant={participant}
              isAudioEnabled={participant.isAudioEnabled}
              isVideoEnabled={participant.isVideoEnabled}
              isScreenSharing={participant.isScreenSharing}
              isHandRaised={participant.isHandRaised}
              isSpeaking={speakingParticipants.has(participant.id)}
              isLocal={participant.id === currentUserId}
              isPinned={participant.id === pinnedParticipantId}
              onPin={onPinParticipant}
              screenShareStream={participant.id === currentUserId ? screenShareStream : undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  // Speaker layout - featured participant with thumbnails below
  if (layout === 'speaker') {
    const featured = getFeaturedParticipant();
    const thumbnails = participants.filter(p => p.id !== featured?.id);

    return (
      <div className={cn('w-full h-full flex flex-col gap-4 p-4', className)}>
        {/* Featured participant */}
        {featured && (
          <div className="flex-1 min-h-0">
            <ParticipantTile
              participant={featured}
              isAudioEnabled={featured.isAudioEnabled}
              isVideoEnabled={featured.isVideoEnabled}
              isScreenSharing={featured.isScreenSharing}
              isHandRaised={featured.isHandRaised}
              isSpeaking={speakingParticipants.has(featured.id)}
              isLocal={featured.id === currentUserId}
              isPinned={featured.id === pinnedParticipantId}
              onPin={onPinParticipant}
              screenShareStream={featured.id === currentUserId ? screenShareStream : undefined}
              className="h-full"
            />
          </div>
        )}

        {/* Thumbnails */}
        {thumbnails.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 h-32">
            {thumbnails.map(participant => (
              <ParticipantTile
                key={participant.id}
                participant={participant}
                isAudioEnabled={participant.isAudioEnabled}
                isVideoEnabled={participant.isVideoEnabled}
                isScreenSharing={participant.isScreenSharing}
                isHandRaised={participant.isHandRaised}
                isSpeaking={speakingParticipants.has(participant.id)}
                isLocal={participant.id === currentUserId}
                isPinned={participant.id === pinnedParticipantId}
                onPin={onPinParticipant}
                screenShareStream={participant.id === currentUserId ? screenShareStream : undefined}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Sidebar layout - featured with vertical sidebar
  if (layout === 'sidebar') {
    const featured = getFeaturedParticipant();
    const sidebar = participants.filter(p => p.id !== featured?.id);

    return (
      <div className={cn('w-full h-full flex gap-4 p-4', className)}>
        {/* Featured participant */}
        {featured && (
          <div className="flex-1 min-w-0">
            <ParticipantTile
              participant={featured}
              isAudioEnabled={featured.isAudioEnabled}
              isVideoEnabled={featured.isVideoEnabled}
              isScreenSharing={featured.isScreenSharing}
              isHandRaised={featured.isHandRaised}
              isSpeaking={speakingParticipants.has(featured.id)}
              isLocal={featured.id === currentUserId}
              isPinned={featured.id === pinnedParticipantId}
              onPin={onPinParticipant}
              screenShareStream={featured.id === currentUserId ? screenShareStream : undefined}
              className="h-full"
            />
          </div>
        )}

        {/* Sidebar thumbnails */}
        {sidebar.length > 0 && (
          <div className="w-48 flex flex-col gap-2 overflow-y-auto">
            {sidebar.map(participant => (
              <ParticipantTile
                key={participant.id}
                participant={participant}
                isAudioEnabled={participant.isAudioEnabled}
                isVideoEnabled={participant.isVideoEnabled}
                isScreenSharing={participant.isScreenSharing}
                isHandRaised={participant.isHandRaised}
                isSpeaking={speakingParticipants.has(participant.id)}
                isLocal={participant.id === currentUserId}
                isPinned={participant.id === pinnedParticipantId}
                onPin={onPinParticipant}
                screenShareStream={participant.id === currentUserId ? screenShareStream : undefined}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
