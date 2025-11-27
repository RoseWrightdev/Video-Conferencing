import { useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Participant management hook for video conference rooms.
 * 
 * Provides access to:
 * - List of all active participants with their media states
 * - Local participant information
 * - Speaking indicators (raised hands)
 * - Pending participants in waiting room
 * - Selected/pinned participant for spotlight view
 * 
 * Host Actions (only available when isHost is true):
 * - Approve participants from waiting room
 * - Kick participants from room
 * - Toggle participant audio/video remotely
 * 
 * State Synchronization:
 * - Participant list synced via 'room_state' WebSocket events
 * - Real-time updates when participants join/leave
 * - Audio/video states updated via WebRTC track events
 * 
 * @returns Participant data and management functions
 * 
 * @example
 * ```tsx
 * const {
 *   participants,
 *   speakingParticipants,
 *   pendingParticipants,
 *   isParticipantSpeaking,
 *   approveParticipant,
 *   kickParticipant
 * } = useParticipants();
 * 
 * // Render participant grid
 * {participants.map(p => (
 *   <ParticipantTile
 *     key={p.id}
 *     participant={p}
 *     isSpeaking={isParticipantSpeaking(p.id)}
 *   />
 * ))}
 * 
 * // Host controls for waiting room
 * {pendingParticipants.map(p => (
 *   <div key={p.id}>
 *     {p.username}
 *     <Button onClick={() => approveParticipant(p.id)}>Admit</Button>
 *     <Button onClick={() => kickParticipant(p.id)}>Deny</Button>
 *   </div>
 * ))}
 * ```
 */
export const useParticipants = () => {
  const {
    participants,
    localParticipant,
    speakingParticipants,
    pendingParticipants,
    selectedParticipantId,
    pinnedParticipantId,
    isHost,
    approveParticipant,
    kickParticipant,
    toggleParticipantAudio,
    toggleParticipantVideo,
    selectParticipant,
    pinParticipant,
  } = useRoomStore();

  const participantList = Array.from(participants.values());
  const speakingList = participantList.filter(p => speakingParticipants.has(p.id));
  
  const selectedParticipant = selectedParticipantId 
    ? participants.get(selectedParticipantId) 
    : null;
    
  const pinnedParticipant = pinnedParticipantId 
    ? participants.get(pinnedParticipantId) 
    : null;

  const getParticipant = useCallback((id: string) => {
    return participants.get(id);
  }, [participants]);

  const isParticipantSpeaking = useCallback((id: string) => {
    return speakingParticipants.has(id);
  }, [speakingParticipants]);

  const hostActions = isHost ? {
    approveParticipant,
    kickParticipant,
    toggleParticipantAudio,
    toggleParticipantVideo,
  } : {};

  return {
    participants: participantList,
    localParticipant,
    speakingParticipants: speakingList,
    pendingParticipants,
    selectedParticipant,
    pinnedParticipant,
    participantCount: participantList.length,
    getParticipant,
    isParticipantSpeaking,
    selectParticipant,
    pinParticipant,
    ...hostActions,
  };
};
