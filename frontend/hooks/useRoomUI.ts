import { useState, useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Room UI layout and controls
 * 
 * @example
 * ```tsx
 * const { toggleChatPanel, pinParticipant, setGridLayout } = useRoomUI();
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