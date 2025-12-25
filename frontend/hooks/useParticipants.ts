import { useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

export const useParticipants = () => {
  const {
    participants,
    localParticipant,
    raisingHandParticipants,
    waitingParticipants,
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
  const raisingHandList = participantList.filter(p => raisingHandParticipants.has(p.id));
  
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
    return raisingHandParticipants.has(id);
  }, [raisingHandParticipants]);

  const hostActions = isHost ? {
    approveParticipant,
    kickParticipant,
    toggleParticipantAudio,
    toggleParticipantVideo,
  } : {};

  return {
    participants: participantList,
    localParticipant,
    speakingParticipants: raisingHandList,
    pendingParticipants: waitingParticipants,
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
