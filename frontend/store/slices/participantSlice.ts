import { StateCreator } from 'zustand';
import { type ParticipantSlice, type RoomStoreState, type Participant } from '../types';

/**
 * Participant slice for managing room members and their states.
 * 
 * State:
 * - participants: Map of all active participants (hosts + regular participants)
 * - localParticipant: This client's participant data (for self-view)
 * - speakingParticipants: Set of participant IDs with raised hands
 * - pendingParticipants: Array of users waiting in lobby for approval
 * - selectedParticipantId: Currently selected participant for actions
 * - isHost: Whether current user has host privileges
 * 
 * Actions:
 * - addParticipant: Add new participant to room
 * - removeParticipant: Remove participant and cleanup references
 * - updateParticipant: Update specific fields (audio/video state)
 * - approveParticipant: Admit from waiting room (host only)
 * - kickParticipant: Remove participant from room (host only)
 * - toggleParticipantAudio: Mute/unmute participant (host only)
 * - toggleParticipantVideo: Enable/disable video (host only)
 * - selectParticipant: Set selected for spotlight view
 * 
 * Participant Synchronization:
 * - Full participant list received via 'room_state' WebSocket event
 * - Incremental updates via join/leave events
 * - Audio/video states from WebRTC track enabled flags
 * - Speaking states from 'raise_hand'/'lower_hand' events
 * 
 * Host Permissions:
 * - Only hosts can approve/kick participants
 * - Only hosts can toggle other participants' media
 * - Host status determined by room_state.hosts array
 * 
 * Cleanup:
 * - removeParticipant clears from all collections
 * - Auto-clears selection/pin if removed participant
 * - WebRTC peer connections closed separately
 * 
 * @see RoomStatePayload For participant list structure
 * @see WebSocketClient For host action methods
 */
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