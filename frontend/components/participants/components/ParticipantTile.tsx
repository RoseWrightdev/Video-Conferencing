'use client';

import { useEffect, useRef, useState } from 'react';
import { MicOff, Hand, Monitor, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Participant } from '@/store/types';
import { loggers } from '@/lib/logger';

import { useMediaStreamLifecycle } from '@/hooks/useMediaStreamLifecycle';

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
  screenShareStream?: MediaStream | null;
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlaybackMuted, setIsPlaybackMuted] = useState(false);

  // Determine the stream object to watch
  const rawStream = (isLocal && isScreenSharing && screenShareStream)
    ? screenShareStream
    : participant.stream;

  // Use the lifecycle hook to listen for internal track changes (mute/unmute/add/remove)
  // This ensures we re-render even if 'rawStream' reference stays the same
  const { stream: streamToDisplay, videoTracks } = useMediaStreamLifecycle(rawStream);

  // We should attempt to show video if:
  // 1. We have a valid stream
  // 2. We are either screen sharing OR video is enabled
  // 3. The stream actually has video tracks
  const hasVideoTracks = videoTracks.length > 0;
  const shouldShowVideo = !!streamToDisplay && hasVideoTracks && (isScreenSharing || isVideoEnabled);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Fix: We must attach the stream even if video is disabled, so audio can play!
    if (!streamToDisplay) {
      if (videoEl.srcObject) {
        loggers.media.debug('ParticipantTile: Clearing video srcObject (no stream)', {
          participantId: participant.id
        });
        videoEl.srcObject = null;
        // Defer to avoid set-state-in-effect
        setTimeout(() => {
          setIsPlaying(false);
          setIsPlaybackMuted(false);
        }, 0);
      }
      return;
    }

    // Only re-attach if object changed
    if (videoEl.srcObject !== streamToDisplay) {
      loggers.media.info('ParticipantTile: Attaching new stream', {
        participantId: participant.id,
        streamId: streamToDisplay.id,
        trackCount: streamToDisplay.getTracks().length
      });

      videoEl.srcObject = streamToDisplay;

      // Reset states - Defer to avoid set-state-in-effect
      setTimeout(() => {
        setIsPlaying(false);
        setIsPlaybackMuted(false);
      }, 0);

      // Attempt playback
      const attemptPlay = async () => {
        try {
          if (isLocal) {
            videoEl.muted = true;
          } else {
            videoEl.muted = false;
          }
          await videoEl.play();
        } catch (err) {
          const error = err as Error;
          if (error.name === 'NotAllowedError') {
            loggers.media.warn('ParticipantTile: Autoplay blocked, retrying muted', { participantId: participant.id });
            videoEl.muted = true;
            setIsPlaybackMuted(true);
            try {
              await videoEl.play();
            } catch (mutedErr) {
              loggers.media.error('ParticipantTile: Muted playback failed', {
                err: mutedErr,
                participantId: participant.id
              });
            }
          } else {
            if (error.name !== 'AbortError') {
              loggers.media.error('ParticipantTile: Play failed', {
                name: error.name,
                message: error.message,
                participantId: participant.id
              });
            }
          }
        }
      };

      attemptPlay();
    }
  }, [streamToDisplay, isLocal, participant.id]);

  // Event listeners for reliable state updates
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    // Synchronously check if it's already playing when the effect runs
    // (e.g. if state changed but the video element survived)
    // Defer to avoid set-state-in-effect warning
    setTimeout(() => {
      if (videoEl.readyState >= 2 && !videoEl.paused) {
        setIsPlaying(true);
      }
    }, 0);

    const onPlaying = () => {
      loggers.media.debug('ParticipantTile: Video started playing', { participantId: participant.id });
      setIsPlaying(true);
    };

    const onWaiting = () => {
      loggers.media.debug('ParticipantTile: Video buffering/waiting', { participantId: participant.id });
      setIsPlaying(false);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    videoEl.addEventListener('playing', onPlaying);
    videoEl.addEventListener('play', onPlaying);
    videoEl.addEventListener('canplay', onPlaying);
    videoEl.addEventListener('waiting', onWaiting);
    videoEl.addEventListener('pause', onPause);
    videoEl.addEventListener('ended', onPause);

    return () => {
      videoEl.removeEventListener('playing', onPlaying);
      videoEl.removeEventListener('play', onPlaying);
      videoEl.removeEventListener('canplay', onPlaying);
      videoEl.removeEventListener('waiting', onWaiting);
      videoEl.removeEventListener('pause', onPause);
      videoEl.removeEventListener('ended', onPause);
    };
  }, [participant.id]); // Removed shouldShowVideo as a dependency to prevent event listener churn

  const getInitials = (name: string) => {
    return name?.substring(0, 2).toUpperCase() || '??';
  };

  const handleUnmute = () => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.muted = false;
      setIsPlaybackMuted(false);
    }
  };

  return (
    <div
      className={cn(
        'group relative rounded-2xl overflow-hidden aspect-video bg-gray-900', // added bg-gray-900 for dark background behind video
        'transition-all duration-200',
        isSpeaking && isVideoEnabled && 'ring-4 ring-green-500 shadow-lg shadow-green-500/50',
        className
      )}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Always mute local video
        className={cn(
          'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
          isLocal && !isScreenSharing && 'scale-x-[-1]', // Mirror local video unless sharing screen
          (shouldShowVideo && isPlaying) ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Avatar / Placeholder */}
      <div className={cn(
        'absolute inset-0 w-full h-full flex items-center justify-center bg-linear-to-br from-gray-700 to-gray-800 transition-opacity duration-300',
        (shouldShowVideo && isPlaying) ? 'opacity-0' : 'opacity-100'
      )}>
        <div className="relative flex flex-col items-center">
          <div className={cn(
            'w-24 h-24 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg transition-all duration-200',
            isSpeaking && !isVideoEnabled && 'ring-4 ring-green-500 shadow-xl shadow-green-500/50'
          )}>
            {getInitials(participant.username)}
          </div>
          <div className={cn(
            "absolute -bottom-6 left-1/2 -translate-x-1/2 w-max transition-opacity duration-300",
            (shouldShowVideo && !isPlaying) ? "opacity-100" : "opacity-0 pointer-events-none"
          )}>
            <p className="text-xs text-gray-400 animate-pulse italic">Connecting video...</p>
          </div>
        </div>
      </div>

      {/* Autoplay blocked overlay */}
      {isPlaybackMuted && !isLocal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
          <button
            onClick={handleUnmute}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2 transition-transform hover:scale-105"
          >
            <MicOff className="w-5 h-5" />
            Click to Unmute
          </button>
        </div>
      )}

      {/* Overlay: Status Icons & Controls */}
      <div className="absolute inset-0 pointer-events-none p-3 flex flex-col justify-between">

        {/* Top Bar */}
        <div className="flex justify-between items-start">
          {/* Status Badges */}
          <div className="flex gap-2 pointer-events-auto">
            {participant.role === 'host' && (
              <Badge variant="secondary" className="bg-black/50 backdrop-blur-sm text-white border-0 font-bold text-xs">
                Host
              </Badge>
            )}
            {isScreenSharing && (
              <Badge variant="secondary" className="bg-purple-500/90 text-purple-950 border-0">
                <Monitor className="w-3 h-3 mr-1" /> Sharing
              </Badge>
            )}
            {isHandRaised && (
              <Badge variant="secondary" className="bg-yellow-500/90 animate-pulse text-yellow-950 border-0">
                <Hand className="w-3 h-3 mr-1" /> Hand
              </Badge>
            )}
          </div>

          {/* Pin Button */}
          {onPin && (
            <button
              onClick={() => onPin(participant.id)}
              className={cn(
                'p-2 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all text-white/80 hover:text-white pointer-events-auto',
                !isPinned && 'opacity-0 group-hover:opacity-100'
              )}
            >
              <Pin className={cn('w-4 h-4', isPinned && 'fill-current text-blue-400')} />
            </button>
          )}
        </div>

        {/* Bottom Bar: Name & Indicators */}
        <div className="flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white truncate drop-shadow-md">
              {participant.username} {isLocal && '(You)'}
            </span>
          </div>

          <div className="flex gap-1.5">
            {!isAudioEnabled && (
              <div className="w-6 h-6 rounded-full bg-red-500/90 flex items-center justify-center backdrop-blur-sm">
                <MicOff className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
