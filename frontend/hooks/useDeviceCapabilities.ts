import { useMemo } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Device capabilities and management
 * 
 * @example
 * ```tsx
 * const { capabilities, switchCamera, refreshDevices } = useDeviceCapabilities();
 * ```
 */
export const useDeviceCapabilities = () => {
  const {
    availableDevices,
    refreshDevices,
    switchCamera,
    switchMicrophone,
  } = useRoomStore()

  const capabilities = useMemo(() => ({
    hasCamera: availableDevices.cameras.length > 0,
    hasMicrophone: availableDevices.microphones.length > 0,
    hasSpeaker: availableDevices.speakers.length > 0,
    supportsScreenShare: 'getDisplayMedia' in navigator.mediaDevices,
    supportsDeviceSelection: 'enumerateDevices' in navigator.mediaDevices,
    supportsAudioOutput: 'setSinkId' in HTMLMediaElement.prototype,
    supportsWebRTC: !!(window.RTCPeerConnection),
    supportsDataChannels: !!(window.RTCDataChannel),
    supportsConstraints: !!(navigator.mediaDevices && navigator.mediaDevices.getSupportedConstraints),
  }), [availableDevices]);

  const deviceInfo = useMemo(() => ({
    cameraCount: availableDevices.cameras.length,
    microphoneCount: availableDevices.microphones.length,
    speakerCount: availableDevices.speakers.length,
    hasDefaultCamera: availableDevices.cameras.some(device => device.deviceId === 'default'),
    hasDefaultMicrophone: availableDevices.microphones.some(device => device.deviceId === 'default'),
    hasDefaultSpeaker: availableDevices.speakers.some(device => device.deviceId === 'default'),
    devicesLabeled: availableDevices.cameras.every(device => device.label !== ''),
  }), [availableDevices]);

  return {
    availableDevices,
    deviceInfo,
    capabilities,
    refreshDevices,
    switchCamera,
    switchMicrophone,
  }
}
