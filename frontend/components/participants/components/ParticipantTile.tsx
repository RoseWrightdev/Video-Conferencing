'use client';

import { useEffect, useRef, useState } from 'react';
import { MicOff, VideoOff, Hand, Monitor, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Participant } from '@/store/types';

interface ParticipantTileProps {
  participant: Participant;
  isAudioEnabled?: boolean;
  isVideoEnabled?: boolean;
  isScreenSharing?: boolean;
  isHandRaised?: boolean;
  isSpeaking?: boolean;
  isLocal?: boolean;
  isPinned?: boolean;
  onPin?: (participantId: string) => void;
  className?: string;
}

export default function ParticipantTile({
  participant,
  isAudioEnabled = false,
  isVideoEnabled = false,
  isScreenSharing = false,
  isHandRaised = false,
  isSpeaking = false,
  isLocal = false,
  isPinned = false,
  onPin,
  className,
}: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  // Connect video stream to video element
  useEffect(() => {
    if (videoRef.current && participant.stream && isVideoEnabled) {
      videoRef.current.srcObject = participant.stream;
      setHasVideo(true);
    } else {
      setHasVideo(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  }, [participant.stream, isVideoEnabled]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div
      className={cn(
        'group relative rounded-lg overflow-hidden bg-[#1a1a1a] aspect-video',
        'transition-all duration-200',
        isSpeaking && 'ring-4 ring-green-500 shadow-lg shadow-green-500/50',
        className
      )}
    >
      {/* Video Stream */}
      {hasVideo && isVideoEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn(
            'w-full h-full object-cover',
            isLocal && 'scale-x-[-1]' // Mirror local video
          )}
        />
      ) : (
        /* Avatar Placeholder */
        // todo: I actually like this style, consider making it a separate Avatar component with dynamic colors and the cn(...) utility
        <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-gray-700 to-gray-800">
          <div className="w-24 h-24 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg">
            {getInitials(participant.username)}
          </div>
        </div>
      )}

      {/* Overlay Container */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top Bar - Status Indicators */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
          {/* Left side indicators */}
          <div className="flex items-center gap-1 pointer-events-auto">
            {participant.role === 'host' && (
              <Badge variant="secondary" className="bg-black/50 backdrop-blur-sm text-white border-0 font-bold text-xs px-2.5 py-1">
                Host
              </Badge>
            )}
            
            {isScreenSharing && (
              <Badge variant="secondary" className="bg-purple-500/90 backdrop-blur-sm text-purple-950 border-0 px-2.5 py-1 [&>svg]:size-4">
                <Monitor strokeWidth={2.5} />
              </Badge>
            )}

            {isHandRaised && (
              <Badge variant="secondary" className="bg-yellow-500/90 backdrop-blur-sm animate-pulse text-yellow-950 border-0 px-2.5 py-1 [&>svg]:size-4">
                <Hand strokeWidth={2.5} />
              </Badge>
            )}
          </div>

          {/* Right side - Pin button */}
          {onPin && (
            <button
              onClick={() => onPin(participant.id)}
              className={cn(
                'p-1.5 rounded bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-all pointer-events-auto',
                !isPinned && 'opacity-0 group-hover:opacity-100'
              )}
            >
              <Pin
                className={cn('h-3 w-3', isPinned ? 'text-blue-400' : 'text-white')}
                fill={isPinned ? 'currentColor' : 'none'}
              />
            </button>
          )}
        </div>

        {/* Bottom Bar - Name and Audio Status */}
        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/90 via-black/60 to-transparent p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm font-medium text-white truncate">
                {participant.username}{isLocal && ' (You)'}
              </span>
            </div>
            
            <div className="flex items-center gap-1 shrink-0">
              {!isVideoEnabled && (
                <div className="p-1 rounded bg-red-500/90">
                  <VideoOff className="h-3 w-3 text-white" />
                </div>
              )}
              
              {!isAudioEnabled && (
                <div className="p-1 rounded bg-red-500/90">
                  <MicOff className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
