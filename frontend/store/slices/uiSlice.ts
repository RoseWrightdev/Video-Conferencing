import { StateCreator } from 'zustand';
import { type UiSlice, type RoomStoreState } from '../types';

/**
 * UI slice for managing room layout and panel visibility.
 * 
 * State:
 * - isParticipantsPanelOpen: Participants list sidebar visibility
 * - gridLayout: Current video grid mode (gallery/speaker/sidebar)
 * - isPinned: Whether any participant is pinned
 * - pinnedParticipantId: ID of pinned participant for spotlight
 * 
 * Actions:
 * - toggleParticipantsPanel: Show/hide participants sidebar
 * - setGridLayout: Change video grid arrangement
 * - pinParticipant: Pin participant for large view
 * 
 * Layout Modes:
 * - gallery: Equal-sized grid of all participants
 *   - Responsive columns (1-4 based on count)
 *   - All participants visible simultaneously
 * 
 * - speaker: Active speaker dominates view
 *   - Large view for current speaker
 *   - Small thumbnails for others
 *   - Auto-switches based on audio level
 * 
 * - sidebar: Main content + participant list
 *   - Shared content or pinned participant full screen
 *   - Participant thumbnails in collapsible sidebar
 * 
 * Pinning:
 * - Sets participant in spotlight view
 * - Overrides active speaker detection
 * - Clear by passing null to pinParticipant
 * - Used for focusing on specific participant
 * 
 * Panel Management:
 * - Panels can overlap on mobile (stack vertically)
 * - Desktop shows panels side-by-side
 * - Toggle methods support keyboard shortcuts
 * 
 * @see GridLayout For layout type definitions
 * @see useRoomUI For hook interface
 */
export const createUISlice: StateCreator<
  RoomStoreState,
  [],
  [],
  UiSlice
> = (set) => ({
  isParticipantsPanelOpen: false,
  isSettingsPanelOpen: false,
  gridLayout: 'gallery',
  isPinned: false,
  pinnedParticipantId: null,

  toggleParticipantsPanel: () => {
    set((state) => ({ isParticipantsPanelOpen: !state.isParticipantsPanelOpen }));
  },

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
});