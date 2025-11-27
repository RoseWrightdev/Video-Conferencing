import { useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Participant management for video conferencing
 * 
 * @example
 * ```tsx
 * const { participants, isParticipantSpeaking } = useParticipants();
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
