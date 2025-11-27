import { useState, useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Room UI layout and panel management hook.
 * 
 * Controls:
 * - Grid layout mode (gallery, speaker, sidebar)
 * - Chat panel visibility
 * - Participants panel visibility
 * - Participant pinning for spotlight view
 * - Device settings menu
 * - General settings dialog
 * 
 * Layout Modes:
 * - gallery: Equal-sized grid of all participants
 * - speaker: Large view of active speaker, small thumbnails of others
 * - sidebar: Main content with collapsible sidebar for participants
 * 
 * Panel State:
 * - Managed in Zustand store for global access
 * - Local state for menus/dialogs that don't affect other components
 * - Toggles close if already open, open if closed
 * 
 * @returns UI state and control functions
 * 
 * @example
 * ```tsx
 * const {
 *   gridLayout,
 *   setGridLayout,
 *   toggleChatPanel,
 *   isChatPanelOpen,
 *   pinParticipant,
 *   pinnedParticipantId
 * } = useRoomUI();
 * 
 * // Layout selector
 * <Select value={gridLayout} onValueChange={setGridLayout}>
 *   <option value="gallery">Gallery View</option>
 *   <option value="speaker">Speaker View</option>
 *   <option value="sidebar">Sidebar View</option>
 * </Select>
 * 
 * // Toggle panels
 * <Button onClick={toggleChatPanel}>Chat</Button>
 * {isChatPanelOpen && <ChatPanel />}
 * 
 * // Pin participant for focus
 * <Button onClick={() => pinParticipant(participantId)}>Pin</Button>
 * ```
 */
export const useRoomUI = () => {
  const {
    gridLayout,
    isChatPanelOpen,
    isParticipantsPanelOpen,
    pinnedParticipantId,
    selectedParticipantId,
    setGridLayout,
    toggleChatPanel,
    toggleParticipantsPanel,
    pinParticipant,
    selectParticipant,
  } = useRoomStore()

  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const unpinParticipant = useCallback(() => {
    pinParticipant(null);
  }, [pinParticipant]);

  return {
    gridLayout,
    isChatPanelOpen,
    isParticipantsPanelOpen,
    pinnedParticipantId,
    selectedParticipantId,
    setGridLayout,
    toggleChatPanel,
    toggleParticipantsPanel,
    pinParticipant,
    unpinParticipant,
    selectParticipant,
    isDeviceMenuOpen,
    setIsDeviceMenuOpen,
    isSettingsOpen,
    setIsSettingsOpen,
  }
}