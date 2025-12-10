import { StateCreator } from 'zustand';
import { type ParticipantSlice, type RoomStoreState, type Participant } from '../types';

/**
 * Participant slice for managing room members and their states.
 * 
 * Mirrors backend Room architecture where participant states are tracked
 * in separate maps rather than as Participant properties:
 * - Backend: r.unmuted, r.cameraOn, r.sharingScreen, r.raisingHand
 * - Frontend: unmutedParticipants, cameraOnParticipants, etc.
 * 
 * State:
 * - participants: Map of all active participants
 * - hosts: Map of participants with host role
 * - waitingParticipants: Map of users in waiting room
 * - unmutedParticipants: Set of IDs with audio enabled
 * - cameraOnParticipants: Set of IDs with video enabled
 * - sharingScreenParticipants: Set of IDs sharing screen
 * - raisingHandParticipants: Set of IDs with hand raised
 * 
 * Actions:
 * - addParticipant: Add new participant to room
 * - removeParticipant: Remove participant and cleanup all state maps
 * - setAudioEnabled/setVideoEnabled/etc: Update state maps
 * - approveParticipant: Admit from waiting room (host only)
 * - kickParticipant: Remove participant from room (host only)
 * - toggleParticipantAudio/Video: Remote media control (host only)
 * 
 * Synchronization:
 * - Full state received via 'room_state' WebSocket event
 * - Incremental updates via join/leave/media change events
 * - State maps updated separately from participant objects
 * 
 * @see RoomStatePayload For backend structure
 * @see WebSocketClient For event handlers
 */
export const createParticipantSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  ParticipantSlice
> = (set, get) => ({
  participants: new Map(),
  hosts: new Map(),
  waitingParticipants: new Map(),
  localParticipant: null,
  unmutedParticipants: new Set(),
  cameraOnParticipants: new Set(),
  sharingScreenParticipants: new Set(),
  raisingHandParticipants: new Set(),
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
      
      const newHosts = new Map(state.hosts);
      newHosts.delete(participantId);
      
      const newWaiting = new Map(state.waitingParticipants);
      newWaiting.delete(participantId);
      
      // Remove from all state tracking maps
      const newUnmuted = new Set(state.unmutedParticipants);
      newUnmuted.delete(participantId);
      
      const newCameraOn = new Set(state.cameraOnParticipants);
      newCameraOn.delete(participantId);
      
      const newSharing = new Set(state.sharingScreenParticipants);
      newSharing.delete(participantId);
      
      const newRaising = new Set(state.raisingHandParticipants);
      newRaising.delete(participantId);

      return {
        participants: newParticipants,
        hosts: newHosts,
        waitingParticipants: newWaiting,
        unmutedParticipants: newUnmuted,
        cameraOnParticipants: newCameraOn,
        sharingScreenParticipants: newSharing,
        raisingHandParticipants: newRaising,
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

  setParticipantStream: (participantId, stream) => {
    set((state) => {
      const newParticipants = new Map(state.participants);
      const existing = newParticipants.get(participantId);
      
      if (existing) {
        newParticipants.set(participantId, { ...existing, stream: stream || undefined });
      }
      
      return { participants: newParticipants };
    });
  },

  setAudioEnabled: (participantId, enabled) => {
    set((state) => {
      const newUnmuted = new Set(state.unmutedParticipants);
      if (enabled) {
        newUnmuted.add(participantId);
      } else {
        newUnmuted.delete(participantId);
      }
      return { unmutedParticipants: newUnmuted };
    });
  },

  setVideoEnabled: (participantId, enabled) => {
    set((state) => {
      const newCameraOn = new Set(state.cameraOnParticipants);
      if (enabled) {
        newCameraOn.add(participantId);
      } else {
        newCameraOn.delete(participantId);
      }
      return { cameraOnParticipants: newCameraOn };
    });
  },

  setScreenSharing: (participantId, sharing) => {
    set((state) => {
      const newSharing = new Set(state.sharingScreenParticipants);
      if (sharing) {
        newSharing.add(participantId);
      } else {
        newSharing.delete(participantId);
      }
      return { sharingScreenParticipants: newSharing };
    });
  },

  setHandRaised: (participantId, raised) => {
    set((state) => {
      const newRaising = new Set(state.raisingHandParticipants);
      if (raised) {
        newRaising.add(participantId);
      } else {
        newRaising.delete(participantId);
      }
      return { raisingHandParticipants: newRaising };
    });
  },

  approveParticipant: (participantId) => {
    const { wsClient, clientInfo, waitingParticipants } = get();
    const targetParticipant = waitingParticipants.get(participantId);

    if(wsClient && clientInfo && targetParticipant) {
        const targetClientInfo = { clientId: targetParticipant.id, displayName: targetParticipant.username };
        wsClient.acceptWaiting(targetClientInfo, clientInfo);
        set((state) => {
          const newWaiting = new Map(state.waitingParticipants);
          newWaiting.delete(participantId);
          return { waitingParticipants: newWaiting };
        });
    }
  },

  kickParticipant: (participantId) => {
    get().removeParticipant(participantId);
    // Note: Host-initiated kick requires server-side implementation.
    // Server should emit 'kick_participant' event to target client.
    // Target client should handle event and disconnect gracefully.
    // Uncomment when backend supports kick functionality:
    // const { wsClient, clientInfo } = get();
    // if (wsClient && clientInfo && get().isHost) {
    //   wsClient.send('kick_participant', { targetId: participantId, ...clientInfo });
    // }
  },

  toggleParticipantAudio: (participantId) => {
    const { unmutedParticipants } = get();
    const isCurrentlyMuted = !unmutedParticipants.has(participantId);
    
    get().setAudioEnabled(participantId, isCurrentlyMuted);
    
    // Note: Remote mute/unmute requires server-side implementation.
    // Server should relay mute command to target participant.
    // Target client should honor mute request and update local audio state.
    // Uncomment when backend supports remote audio control:
    // const { wsClient, clientInfo } = get();
    // if (wsClient && clientInfo && get().isHost) {
    //   wsClient.send('toggle_participant_audio', { 
    //     targetId: participantId, 
    //     enabled: isCurrentlyMuted,
    //     ...clientInfo 
    //   });
    // }
  },

  toggleParticipantVideo: (participantId) => {
    const isCurrentlyOn = get().cameraOnParticipants.has(participantId);
    get().setVideoEnabled(participantId, !isCurrentlyOn);
    // Note: Remote video toggle requires server-side implementation.
    // Server should relay command to target participant.
    // Target client should honor request and update local video state.
    // Uncomment when backend supports remote video control:
    // const { wsClient, clientInfo } = get();
    // if (wsClient && clientInfo && get().isHost) {
    //   wsClient.send('toggle_participant_video', { 
    //     targetId: participantId, 
    //     enabled: !isCurrentlyOn,
    //     ...clientInfo 
    //   });
    // }
  },

  selectParticipant: (participantId) => {
    set({ selectedParticipantId: participantId });
  },
});