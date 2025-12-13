'use client';

import { X as XIcon, Users, Hand, Monitor, Check, Ban, Clock, MoreVertical, UserX, Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import type { Participant } from '@/store/types';

export interface ParticipantsPanelProps {
  participants: Participant[];
  waitingParticipants?: Participant[];
  currentUserId?: string;
  isHost?: boolean;
  onClose: () => void;
  onMuteParticipant?: (participantId: string) => void;
  onRemoveParticipant?: (participantId: string) => void;
  onApproveWaiting?: (participantId: string) => void;
  onDenyWaiting?: (participantId: string) => void;
  className?: string;
  // Participant state maps
  unmutedParticipants?: Set<string>;
  cameraOnParticipants?: Set<string>;
  sharingScreenParticipants?: Set<string>;
  raisingHandParticipants?: Set<string>;
}

/**
 * Sidebar panel displaying participant list with management controls.
 * 
 * Features:
 * - Participant list with status indicators
 * - Host-only controls (mute, remove)
 * - Waiting room management (approve/deny)
 * - Hand raise indicators
 * - Screen sharing status
 * - Role badges
 * 
 * Dependency Injection:
 * - All data passed via props
 * - No direct store access
 * - Callbacks for actions
 * 
 * @example
 * ```tsx
 * <ParticipantsPanel
 *   participants={participants}
 *   waitingParticipants={waitingUsers}
 *   currentUserId="user-123"
 *   isHost={true}
 *   onClose={() => setOpen(false)}
 *   onMuteParticipant={(id) => handleMute(id)}
 *   onApproveWaiting={(id) => approveParticipant(id)}
 *   unmutedParticipants={unmutedSet}
 * />
 * ```
 */
export default function ParticipantsPanel({
  participants,
  waitingParticipants = [],
  currentUserId,
  isHost = false,
  onClose,
  onMuteParticipant,
  onRemoveParticipant,
  onApproveWaiting,
  onDenyWaiting,
  className,
  unmutedParticipants = new Set(),
  cameraOnParticipants = new Set(),
  sharingScreenParticipants = new Set(),
  raisingHandParticipants = new Set(),
}: ParticipantsPanelProps) {
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
    <div className={cn('absolute left-4 top-4 bottom-6 h-[calc(100vh-7rem)] w-80 border-r rounded-2xl flex flex-col bg-white/60 frosted-2 z-50 overflow-hidden', className)}>
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
                        .map((n) => n[0])
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
                    {onApproveWaiting && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onApproveWaiting(participant.id)}
                        className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/20"
                        title="Approve"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    {onDenyWaiting && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDenyWaiting(participant.id)}
                        className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                        title="Deny"
                      >
                        <Ban className="h-3 w-3" />
                      </Button>
                    )}
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
              const isAudioOn = unmutedParticipants.has(participant.id);
              const isVideoOn = cameraOnParticipants.has(participant.id);
              const isScreenSharing = sharingScreenParticipants.has(participant.id);
              const hasHandRaised = raisingHandParticipants.has(participant.id);
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
                        .map((n) => n[0])
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
                        <div>
                          <Select onValueChange={(value) => {
                            if (value === 'mute' && onMuteParticipant && isAudioOn) {
                              onMuteParticipant(participant.id);
                            } else if (value === 'remove' && onRemoveParticipant) {
                              onRemoveParticipant(participant.id);
                            }
                          }}>
                            <SelectTrigger>
                              <MoreVertical />
                            </SelectTrigger>
                            <SelectContent>
                              {onMuteParticipant && isAudioOn && (
                                <SelectItem value="mute">
                                  <div className="flex items-center gap-2">
                                    <MicOff className="h-3 w-3" />
                                    <span>Mute</span>
                                  </div>
                                </SelectItem>
                              )}
                              {onRemoveParticipant && (
                                <SelectItem value="remove" className="text-destructive focus:text-destructive">
                                  <div className="flex items-center gap-2">
                                    <UserX className="h-3 w-3" />
                                    <span>Remove</span>
                                  </div>
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
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
    </div>
  );
}
