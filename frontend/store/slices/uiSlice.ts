import { StateCreator } from 'zustand';
import { type UiSlice, type RoomStoreState } from '../types';

export const createUISlice: StateCreator<
  RoomStoreState,
  [],
  [],
  UiSlice
> = (set) => ({
  isParticipantsPanelOpen: false,
  gridLayout: 'gallery',
  isPinned: false,
  pinnedParticipantId: null,

  toggleParticipantsPanel: () => {
    set((state) => ({ isParticipantsPanelOpen: !state.isParticipantsPanelOpen }));
  },

  setGridLayout: (layout) => {
    set({ gridLayout: layout });
  },

  pinParticipant: (participantId) => {
    set({
      pinnedParticipantId: participantId,
      isPinned: participantId !== null,
    });
  },
});