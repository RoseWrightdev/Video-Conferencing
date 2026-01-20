import { StateCreator } from 'zustand';
import { type UiSlice, type RoomStoreState } from '../types';

export const createUISlice: StateCreator<
  RoomStoreState,
  [],
  [],
  UiSlice
> = (set) => ({
  isSettingsPanelOpen: false,
  gridLayout: 'gallery',
  isPinned: false,
  pinnedParticipantId: null,
  isLeaveDialogOpen: false,
  isSummaryModalOpen: false,

  toggleSettingsPanel: () => {
    set((state) => ({ isSettingsPanelOpen: !state.isSettingsPanelOpen }));
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

  setLeaveDialogOpen: (open: boolean) => {
    set({ isLeaveDialogOpen: open });
  },

  toggleSummaryModal: () => {
    set((state) => ({ isSummaryModalOpen: !state.isSummaryModalOpen }));
  },

  isCaptionsEnabled: false,
  toggleCaptions: () => {
    set((state) => ({ isCaptionsEnabled: !state.isCaptionsEnabled }));
  },
});