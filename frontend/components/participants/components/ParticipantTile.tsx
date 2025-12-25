'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MicOff, VideoOff, Hand, Monitor, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Participant } from '@/store/types';
import { loggers } from '@/lib/logger';

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
  screenShareStream?: MediaStream | null; // Screen share stream for local participant
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
  screenShareStream,
}: ParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isReallyPlaying, setIsReallyPlaying] = useState(false);

  // Connect video stream to video element
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // For local participant sharing screen, use screen share stream
    const streamToDisplay = isLocal && screenShareStream ? screenShareStream : participant.stream;

    const hasVideo = !!streamToDisplay && streamToDisplay.getVideoTracks().length > 0;
    const isVisible = isVideoEnabled || isScreenSharing;

    loggers.media.debug('ParticipantTile: updating video stream', {
      participantId: participant.id,
      username: participant.username,
      isLocal,
      hasStream: !!streamToDisplay,
      streamId: streamToDisplay?.id,
      hasVideo,
      isVideoEnabled,
      isScreenSharing,
      isVisible,
    });

    // DEBUG: Inspect individual tracks
    if (streamToDisplay) {
      streamToDisplay.getVideoTracks().forEach(t => {
        loggers.media.info('ParticipantTile: Video Track Status', {
          id: t.id,
          label: t.label,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
          kind: t.kind
        });
      });
    }

    if (streamToDisplay && isVisible) {
      if (videoElement.srcObject !== streamToDisplay) {
        loggers.media.info('ParticipantTile: setting new srcObject', {
          participantId: participant.id,
          streamId: streamToDisplay.id
        });
        setIsReallyPlaying(false);
        videoElement.srcObject = streamToDisplay;
      }

      const attemptPlay = async () => {
        try {
          // Reset muted state to what it should be (muted if local)
          videoElement.muted = isLocal;
          await videoElement.play();
          setIsReallyPlaying(true);
          loggers.media.debug('ParticipantTile: video playing', { participantId: participant.id });
        } catch (err) {
          const jsErr = err as Error;
          if (jsErr.name === 'NotAllowedError') {
            loggers.media.warn('ParticipantTile: Autoplay blocked. Attempting muted playback.', {
              participantId: participant.id
            });
            try {
              // Fallback: Mute and play
              videoElement.muted = true;
              await videoElement.play();
              setIsReallyPlaying(true);
              loggers.media.info('ParticipantTile: Muted playback started (Autoplay workaround).', {
                participantId: participant.id
              });
            } catch (mutedErr) {
              loggers.media.error('ParticipantTile: Muted playback also failed', {
                err: mutedErr,
                participantId: participant.id
              });
            }
          } else {
            loggers.media.warn('ParticipantTile: play() failed, waiting for metadata or interaction', {
              errName: jsErr.name,
              errMsg: jsErr.message,
              participantId: participant.id,
              readyState: videoElement.readyState
            });
          }
        }
      };

      attemptPlay();
    } else {
      // If we shouldn't show video, clean up srcObject to save resources
      if (videoElement.srcObject) {
        loggers.media.debug('ParticipantTile: clearing srcObject', { participantId: participant.id });
        videoElement.srcObject = null;
        setIsReallyPlaying(false);
      }
    }
  }, [participant.stream, isLocal, screenShareStream, isVideoEnabled, isScreenSharing]);

  // Log and handle metadata events and track mute state
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Track listeners
    const stream = isLocal && screenShareStream ? screenShareStream : participant.stream;
    const tracks = stream?.getVideoTracks() || [];

    const onTrackUnmute = (e: Event) => {
      loggers.media.info('ParticipantTile: Track unmuted (data receiving)', {
        trackId: (e.target as MediaStreamTrack).id,
        participantId: participant.id
      });
    };

    const onTrackMute = (e: Event) => {
      loggers.media.warn('ParticipantTile: Track muted (no data)', {
        trackId: (e.target as MediaStreamTrack).id,
        participantId: participant.id
      });
    };

    tracks.forEach(t => {
      t.addEventListener('unmute', onTrackUnmute);
      t.addEventListener('mute', onTrackMute);
    });

    const onLoadedMetadata = () => {
      loggers.media.debug('ParticipantTile: metadata loaded', { participantId: participant.id });
      // Retry play on metadata load
      const attemptPlay = async () => {
        try {
          await videoElement.play();
          setIsReallyPlaying(true);
        } catch (e) {
          // If failed again, try muted
          if ((e as Error).name === 'NotAllowedError') {
            videoElement.muted = true;
            videoElement.play().then(() => setIsReallyPlaying(true)).catch(() => { });
          }
        }
      };
      attemptPlay();
    };

    const onPlaying = () => setIsReallyPlaying(true);
    const onWaiting = () => setIsReallyPlaying(false);

    videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
    videoElement.addEventListener('playing', onPlaying);
    videoElement.addEventListener('waiting', onWaiting);

    return () => {
      videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
      videoElement.removeEventListener('playing', onPlaying);
      videoElement.removeEventListener('waiting', onWaiting);
      tracks.forEach(t => {
        t.removeEventListener('unmute', onTrackUnmute);
        t.removeEventListener('mute', onTrackMute);
      });
    };
  }, [participant.id, participant.stream, isLocal, screenShareStream]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Determine if we have a stream to display
  const hasStreamToDisplay = (isLocal && screenShareStream) || participant.stream;
  const shouldShowVideo = hasStreamToDisplay && (isVideoEnabled || isScreenSharing);

  return (
    <div
      className={cn(
        'group relative rounded-2xl overflow-hidden aspect-video',
        'transition-all duration-200',
        isSpeaking && isVideoEnabled && 'ring-4 ring-green-500 shadow-lg shadow-green-500/50',
        className
      )}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        onClick={() => {
          // Manual play click in case of autoplay block
          videoRef.current?.play().then(() => setIsReallyPlaying(true)).catch(() => { });
        }}
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
          isLocal && !isScreenSharing && 'scale-x-[-1]',
          (!shouldShowVideo || !isReallyPlaying) && 'opacity-0'
        )}
      />

      {/* Avatar Placeholder - shown when video is not visible or not yet playing */}
      <div className={cn(
        'absolute inset-0 w-full h-full flex items-center justify-center bg-linear-to-br from-gray-700 to-gray-800 transition-opacity duration-300',
        (shouldShowVideo && isReallyPlaying) && 'opacity-0'
      )}>
        <div className="flex flex-col items-center gap-4">
          <div className={cn(
            'w-24 h-24 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg transition-all duration-200',
            isSpeaking && !isVideoEnabled && 'ring-4 ring-green-500 shadow-xl shadow-green-500/50'
          )}>
            {participant.username.charAt(0).toUpperCase()}
          </div>
          {!isReallyPlaying && shouldShowVideo && (
            <p className="text-xs text-gray-400 animate-pulse italic">Connecting video...</p>
          )}
        </div>
      </div>

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
          <div className="flex items-center gap-1 pointer-events-auto">
            {/* Pin button */}
            {onPin && (
              <button
                onClick={() => onPin(participant.id)}
                className={cn(
                  'p-1.5 rounded bg-black/50 hover:bg-black/70 backdrop-blur-sm transition-all',
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
        </div>

        {/* Bottom Bar - Name and Audio Status */}
        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/60 to-transparent p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm font-medium text-white truncate">
                {participant.username}{isLocal && ' (You)'}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!isVideoEnabled && (
                <div className="p-1 rounded-full bg-red-500/80">
                  <VideoOff className="h-3 w-3 text-white black" />
                </div>
              )}

              {!isAudioEnabled && (
                <div className="p-1 rounded-full bg-red-500/80">
                  <MicOff className="h-3 w-3 text-white black" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
