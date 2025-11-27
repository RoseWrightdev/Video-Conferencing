import { useEffect, useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Media controls for video conferencing
 * 
 * @example
 * ```tsx
 * const { toggleAudio, toggleVideo, toggleScreenShare } = useMediaControls();
 * ```
 */
export const useMediaControls = () => {
  const {
    localStream,
    screenShareStream,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    availableDevices,
    selectedDevices,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    switchCamera,
    switchMicrophone,
    refreshDevices,
  } = useRoomStore();

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const toggleScreenShare = useCallback(async () => {    
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  const hasCamera = availableDevices.cameras.length > 0;
  const hasMicrophone = availableDevices.microphones.length > 0;
  const hasSpeaker = availableDevices.speakers.length > 0;

  return {
    localStream,
    screenShareStream,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    availableDevices,
    selectedDevices,
    hasCamera,
    hasMicrophone,
    hasSpeaker,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    switchCamera,
    switchMicrophone,
    refreshDevices,
  };
};
