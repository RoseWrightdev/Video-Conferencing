'use client';

import { X as XIcon, Users, Hand, Monitor, Check, Ban, Clock, MoreVertical, UserX, Mic, MicOff, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useRoomStore } from '@/store/useRoomStore';
import { useShallow } from 'zustand/react/shallow';
import { useMemo } from 'react';
import { Participant } from '@/store/types';

export interface ParticipantsPanelProps {
  className?: string;
}

interface ParticipantsPanelContentProps {
  className?: string;
  participants: Participant[];
  waitingParticipants: Participant[];
  currentUserId: string | null;
  isHost: boolean;
  unmutedParticipants: Set<string>;
  cameraOnParticipants: Set<string>;
  sharingScreenParticipants: Set<string>;
  raisingHandParticipants: Set<string>;
  onClose: () => void;
  onApprove: (id: string) => void;
  onKick: (id: string) => void;
  onToggleAudio: (id: string) => void;
  onTransferOwnership?: (id: string) => void;
}

/**
 * Pure presentational component for ParticipantsPanel.
 */
export function ParticipantsPanelContent({
  className,
  participants,
  waitingParticipants,
  currentUserId,
  isHost,
  unmutedParticipants,
  cameraOnParticipants,
  sharingScreenParticipants,
  raisingHandParticipants,
  onClose,
  onApprove,
  onKick,
  onToggleAudio,
  onTransferOwnership,
}: ParticipantsPanelContentProps) {
  // Sort participants: host first, then hand raised, then alphabetical
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.role === 'host' && b.role !== 'host') return -1;
    if (a.role !== 'host' && b.role === 'host') return 1;

    const aHandRaised = raisingHandParticipants.has(a.id);
    const bHandRaised = raisingHandParticipants.has(b.id);
    if (aHandRaised && !bHandRaised) return -1;
    if (!aHandRaised && bHandRaised) return 1;

    return a.username.localeCompare(b.username);
  });

  return (
    <div className={cn('absolute left-4 top-4 bottom-6 h-[calc(100vh-7rem)] w-120 border-r rounded-2xl flex flex-col bg-white/60 frosted-2 z-50 overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h3 className="font-semibold">Participants</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="rounded-full -m-2"
          aria-label="Close chat panel"
        >
          <XIcon className="h-5 w-5 text-black" />
        </Button>
      </div>

      {/* Waiting Room Section */}
      {isHost && waitingParticipants.length > 0 && (
        <div>
          <div className="p-3">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <Clock className="h-4 w-4" />
              <h4 className="font-semibold text-sm">
                Waiting Room ({waitingParticipants.length})
              </h4>
            </div>
          </div>
          <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
            {waitingParticipants.map((participant) => (
              <div
                key={participant.id}
                className="rounded-lg p-3 bg-background hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Left: Avatar + Name */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {participant.username
                        .split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <p className="font-medium text-sm truncate">
                      {participant.username}
                    </p>
                  </div>

                  {/* Right: Approve/Deny buttons */}
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onApprove(participant.id)}
                      className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/20"
                      title="Approve"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onKick(participant.id)}
                      className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                      title="Deny"
                    >
                      <Ban className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Participant List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {sortedParticipants.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No participants yet</p>
            </div>
          ) : (
            sortedParticipants.map(participant => {
              const isCurrentUser = participant.id === currentUserId;
              const isAudioOn = participant.isAudioEnabled;
              const isVideoOn = participant.isVideoEnabled;
              const isScreenSharing = participant.isScreenSharing;
              const hasHandRaised = participant.isHandRaised;
              const isParticipantHost = participant.role === 'host';

              return (
                <div
                  key={participant.id}
                  className={cn(
                    'group rounded-lg p-3 transition-colors',
                    'hover:bg-accent/50',
                    isCurrentUser && 'bg-accent/30'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Left: Avatar */}
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {participant.username
                        .split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>

                    {/* Middle: Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">
                          {participant.username}
                          {isCurrentUser && (
                            <span className="text-muted-foreground ml-1">(You)</span>
                          )}
                        </p>
                      </div>

                      {/* Status badges */}
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {isParticipantHost && (
                          <Badge
                            variant="secondary"
                            className=" text-xs px-1.5 py-0"
                          >
                            Host
                          </Badge>
                        )}

                        {isScreenSharing && (
                          <Badge
                            variant="secondary"
                            className="bg-purple-500/90 text-white text-xs px-1.5 py-0"
                          >
                            <Monitor className="h-3 w-3" />
                          </Badge>
                        )}

                        {hasHandRaised && (
                          <Badge
                            variant="secondary"
                            className="bg-yellow-500/90 text-yellow-950 text-xs animate-pulse"
                          >
                            <Hand className="h-3 w-3" />
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Right: Host controls + Audio/Video status */}
                    <div className="flex items-start gap-2 shrink-0">
                      {/* Host controls */}
                      {isHost && !isCurrentUser && (
                        <div className="flex items-center gap-1 mr-2">
                          {isAudioOn && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => onToggleAudio(participant.id)}
                                  className="h-7 w-7 rounded-sm hover:bg-yellow-50 text-muted-foreground hover:text-yellow-600"
                                >
                                  <MicOff className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mute Participant</TooltipContent>
                            </Tooltip>
                          )}

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onTransferOwnership?.(participant.id)}
                                className="h-7 w-7 rounded-sm hover:bg-blue-50 text-muted-foreground hover:text-blue-600"
                              >
                                <Crown className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Make Host</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onKick(participant.id)}
                                className="h-7 w-7 rounded-sm hover:bg-red-50 text-muted-foreground hover:text-red-600"
                              >
                                <UserX className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove from Room</TooltipContent>
                          </Tooltip>
                        </div>
                      )}

                      {/* Audio/Video status indicators */}
                      <div className="flex items-center gap-1 pt-1">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full',
                            isAudioOn ? 'bg-green-500' : 'bg-red-500'
                          )}
                          title={isAudioOn ? 'Audio on' : 'Audio off'}
                          aria-label={isAudioOn ? 'Audio on' : 'Audio off'}
                        />
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full',
                            isVideoOn ? 'bg-blue-500' : 'bg-red-500'
                          )}
                          title={isVideoOn ? 'Video on' : 'Video off'}
                          aria-label={isVideoOn ? 'Video on' : 'Video off'}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div >
  );
}

/**
 * Sidebar panel displaying participant list with management controls.
 * Connected directly to useRoomStore.
 */
export default function ParticipantsPanel({
  className,
}: ParticipantsPanelProps) {
  const {
    participantsMap,
    waitingParticipantsMap,
    currentUserId,
    isHost,
    unmutedParticipants,
    cameraOnParticipants,
    sharingScreenParticipants,
    raisingHandParticipants,
    toggleParticipantsPanel,
    approveParticipant,
    kickParticipant,
    toggleParticipantAudio,
    transferOwnership,
  } = useRoomStore(useShallow(state => ({
    participantsMap: state.participants,
    waitingParticipantsMap: state.waitingParticipants,
    currentUserId: state.currentUserId,
    isHost: state.isHost,
    unmutedParticipants: state.unmutedParticipants,
    cameraOnParticipants: state.cameraOnParticipants,
    sharingScreenParticipants: state.sharingScreenParticipants,
    raisingHandParticipants: state.raisingHandParticipants,
    toggleParticipantsPanel: state.toggleParticipantsPanel,
    approveParticipant: state.approveParticipant,
    kickParticipant: state.kickParticipant,
    toggleParticipantAudio: state.toggleParticipantAudio,
    transferOwnership: state.transferOwnership,
  })));

  const participants = useMemo(() => Array.from(participantsMap.values()), [participantsMap]);
  const waitingParticipants = useMemo(() => Array.from(waitingParticipantsMap.values()), [waitingParticipantsMap]);

  return (
    <ParticipantsPanelContent
      className={className}
      participants={participants}
      waitingParticipants={waitingParticipants}
      currentUserId={currentUserId}
      isHost={isHost}
      unmutedParticipants={unmutedParticipants}
      cameraOnParticipants={cameraOnParticipants}
      sharingScreenParticipants={sharingScreenParticipants}
      raisingHandParticipants={raisingHandParticipants}
      onClose={toggleParticipantsPanel}
      onApprove={approveParticipant}
      onKick={kickParticipant}
      onToggleAudio={toggleParticipantAudio}
      onTransferOwnership={transferOwnership}
    />
  );
}
