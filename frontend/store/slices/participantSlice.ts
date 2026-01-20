import { StateCreator } from 'zustand';
import { type ParticipantSlice, type RoomStoreState } from '../types';
import { loggers } from '@/lib/logger';

export const createParticipantSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  ParticipantSlice
> = (set, get) => ({
  // --- Data Structures ---
  participants: new Map(),
  hosts: new Map(),
  waitingParticipants: new Map(),
  localParticipant: null,

  // --- State Flags (Mirrors Protobuf ParticipantInfo) ---
  unmutedParticipants: new Set(),
  cameraOnParticipants: new Set(),
  sharingScreenParticipants: new Set(),
  raisingHandParticipants: new Set(),

  // --- UI State ---
  selectedParticipantId: null,
  isHost: false,
  isParticipantsPanelOpen: false,
  unreadParticipantsCount: 0,

  // --- Basic Actions ---
  addParticipant: (participant) => {
    set((state) => {
      const newParticipants = new Map(state.participants);
      const existing = newParticipants.get(participant.id);

      // Preserving existing stream if available
      if (existing?.stream) {
        participant.stream = existing.stream;
      }

      newParticipants.set(participant.id, participant);

      // Increment unread count if panel is closed
      const currentUnread = state.unreadParticipantsCount ?? 0;
      const unreadCount = state.isParticipantsPanelOpen ? currentUnread : currentUnread + 1;

      return {
        participants: newParticipants,
        unreadParticipantsCount: unreadCount,
      };
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

      // Clean up state sets
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
        // Deselect if removed
        selectedParticipantId: state.selectedParticipantId === participantId ? null : state.selectedParticipantId,
      };
    });
  },

  updateParticipant: (participantId, updates) => {
    set((state) => {
      const newParticipants = new Map(state.participants);
      const existing = newParticipants.get(participantId);

      if (existing) {
        newParticipants.set(participantId, { ...existing, ...updates });
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

  // --- State Setters (Helpers) ---
  setAudioEnabled: (participantId, enabled) => {
    loggers.media.debug('setAudioEnabled', { participantId, enabled });
    set((state) => {
      const newUnmuted = new Set(state.unmutedParticipants);
      if (enabled) newUnmuted.add(participantId);
      else newUnmuted.delete(participantId);
      return { unmutedParticipants: newUnmuted };
    });
  },

  setVideoEnabled: (participantId, enabled) => {
    loggers.media.debug('setVideoEnabled', { participantId, enabled });
    set((state) => {
      const newCameraOn = new Set(state.cameraOnParticipants);
      if (enabled) newCameraOn.add(participantId);
      else newCameraOn.delete(participantId);
      return { cameraOnParticipants: newCameraOn };
    });
  },

  setScreenSharing: (participantId, sharing) => {
    loggers.media.debug('setScreenSharing', { participantId, sharing });
    set((state) => {
      const newSharing = new Set(state.sharingScreenParticipants);
      if (sharing) newSharing.add(participantId);
      else newSharing.delete(participantId);
      return { sharingScreenParticipants: newSharing };
    });
  },

  setHandRaised: (participantId, raised) => {
    loggers.room.debug('setHandRaised', { participantId, raised });
    set((state) => {
      const newRaising = new Set(state.raisingHandParticipants);
      let unreadCount = state.unreadParticipantsCount || 0;

      if (raised) {
        newRaising.add(participantId);
        // Increment unread count if panel is closed
        if (!state.isParticipantsPanelOpen) {
          unreadCount += 1;
        }
      } else {
        newRaising.delete(participantId);
      }
      return {
        raisingHandParticipants: newRaising,
        unreadParticipantsCount: unreadCount
      };
    });
  },

  selectParticipant: (participantId) => {
    loggers.room.debug('selectParticipant', { participantId });
    set({ selectedParticipantId: participantId });
  },

  // --- Admin / Host Actions (Protobuf Implementation) ---

  approveParticipant: (participantId) => {
    const { wsClient, waitingParticipants } = get();
    const target = waitingParticipants.get(participantId);

    if (wsClient && target) {
      wsClient.send({
        adminAction: {
          targetUserId: participantId,
          action: 'approve'
        }
      });

      // Optimistic UI update: Remove from waiting immediately
      set((state) => {
        const newWaiting = new Map(state.waitingParticipants);
        newWaiting.delete(participantId);
        return { waitingParticipants: newWaiting };
      });
    }
  },

  kickParticipant: (participantId) => {
    const { wsClient } = get();

    // Send Kick Command to Server
    if (wsClient) {
      wsClient.send({
        adminAction: {
          targetUserId: participantId,
          action: 'kick'
        }
      });
    }

    // Optimistic UI update
    get().removeParticipant(participantId);
  },

  toggleParticipantAudio: (participantId) => {
    const { wsClient, unmutedParticipants } = get();
    // If they are in the "unmuted" set, they are currently talking.
    // So if true, we want to mute them.
    const isCurrentlyUnmuted = unmutedParticipants.has(participantId);

    if (wsClient) {
      wsClient.send({
        adminAction: {
          targetUserId: participantId,
          action: isCurrentlyUnmuted ? 'mute' : 'unmute'
        }
      });
    }
  },

  toggleParticipantVideo: (participantId) => {
    const { wsClient, cameraOnParticipants } = get();
    const isCurrentlyOn = cameraOnParticipants.has(participantId);

    if (wsClient) {
      wsClient.send({
        adminAction: {
          targetUserId: participantId,
          action: isCurrentlyOn ? 'disable_video' : 'enable_video'
        }
      });
    }
  },

  transferOwnership: (participantId) => {
    const { roomClient } = get();
    if (roomClient) {
      roomClient.transferOwnership(participantId);
    }
  },

  toggleHand: async () => {
    const { roomClient, currentUserId, raisingHandParticipants } = get();
    if (roomClient && currentUserId) {
      const isCurrentlyRaised = raisingHandParticipants.has(currentUserId);
      roomClient.toggleHand(!isCurrentlyRaised);
    }
  },

  toggleParticipantsPanel: () => {
    set((state) => {
      const newOpen = !state.isParticipantsPanelOpen;
      return {
        isParticipantsPanelOpen: newOpen,
        unreadParticipantsCount: newOpen ? 0 : state.unreadParticipantsCount,
      };
    });
  },
});