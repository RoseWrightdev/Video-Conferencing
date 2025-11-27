import { useEffect, useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Simplified media controls for toggling audio, video, and screen sharing.
 * 
 * Provides a higher-level API than useMediaStream, focusing on
 * common user actions rather than stream initialization.
 * 
 * Features:
 * - Toggle microphone on/off
 * - Toggle camera on/off
 * - Start/stop screen sharing
 * - Switch between cameras and microphones
 * - Query available devices
 * - Refresh device list when hardware changes
 * 
 * Device Detection:
 * - Auto-refreshes on mount
 * - Provides hasCamera, hasMicrophone, hasSpeaker flags
 * - Lists all available devices for selection
 * 
 * @returns Media control state and toggle functions
 * 
 * @example
 * ```tsx
 * const {
 *   toggleAudio,
 *   toggleVideo,
 *   toggleScreenShare,
 *   isAudioEnabled,
 *   hasCamera
 * } = useMediaControls();
 * 
 * // Mute/unmute microphone
 * <Button onClick={toggleAudio}>
 *   {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
 * </Button>
 * 
 * // Toggle screen sharing
 * <Button onClick={toggleScreenShare} disabled={isScreenSharing}>
 *   {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
 * </Button>
 * 
 * // Conditional rendering based on device availability
 * {!hasCamera && <Alert>No camera detected</Alert>}
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
