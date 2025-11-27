import { StateCreator } from 'zustand';
import { type ParticipantSlice, type RoomStoreState, type Participant } from '../types';

export const createParticipantSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  ParticipantSlice
> = (set, get) => ({
  participants: new Map(),
  localParticipant: null,
  speakingParticipants: new Set(),
  pendingParticipants: [],
  selectedParticipantId: null,
  isHost: false,

  addParticipant: (participant) => {
    set((state) => {
      const newParticipants = new Map(state.participants);
      newParticipants.set(participant.id, participant);
      return { participants: newParticipants };
    });
  },

  removeParticipant: (participantId) => {
    set((state) => {
      const newParticipants = new Map(state.participants);
      newParticipants.delete(participantId);
      
      const newSpeaking = new Set(state.speakingParticipants);
      newSpeaking.delete(participantId);

      return {
        participants: newParticipants,
        speakingParticipants: newSpeaking,
        selectedParticipantId: state.selectedParticipantId === participantId ? null : state.selectedParticipantId,
        pinnedParticipantId: state.pinnedParticipantId === participantId ? null : state.pinnedParticipantId,
      };
    });
  },

  updateParticipant: (participantId, updates) => {
    set((state) => {
      const newParticipants = new Map(state.participants);
      const existing = newParticipants.get(participantId);
      
      if (existing) {
        newParticipants.set(participantId, { ...existing, ...updates });
      } else {
        throw new Error(`Attempted to update non-existent participant: ${participantId}`);
      }
      
      return { participants: newParticipants };
    });
  },

  approveParticipant: (participantId) => {
    const { wsClient, clientInfo, pendingParticipants } = get();
    const targetParticipant = pendingParticipants.find(p => p.id === participantId);

    if(wsClient && clientInfo && targetParticipant) {
        wsClient.acceptWaiting({ clientId: targetParticipant.id, displayName: targetParticipant.username }, clientInfo);
        set((state) => ({
          pendingParticipants: state.pendingParticipants.filter(p => p.id !== participantId)
        }));
    }
  },

  kickParticipant: (participantId) => {
    get().removeParticipant(participantId);
    // TODO: WebSocket logic to kick would go here
  },

  toggleParticipantAudio: (participantId) => {
    const participant = get().participants.get(participantId);
    if (participant) {
      get().updateParticipant(participantId, {
        isAudioEnabled: !participant.isAudioEnabled
      });
      // TODO: WebSocket logic to mute/unmute would go here
    }
  },

  toggleParticipantVideo: (participantId) => {
    const participant = get().participants.get(participantId);
    if (participant) {
      get().updateParticipant(participantId, {
        isVideoEnabled: !participant.isVideoEnabled
      });
       // TODO: WebSocket logic to enable/disable video would go here
    }
  },

  selectParticipant: (participantId) => {
    set({ selectedParticipantId: participantId });
  },
});