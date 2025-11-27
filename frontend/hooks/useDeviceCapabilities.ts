import { useMemo } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Device capabilities detection and management hook.
 * 
 * Provides:
 * - Browser feature detection (WebRTC, screen sharing, device selection)
 * - Hardware availability (cameras, microphones, speakers)
 * - Device enumeration and metadata
 * - Capability flags for conditional UI rendering
 * 
 * Capabilities Detected:
 * - hasCamera/hasMicrophone/hasSpeaker: Hardware presence
 * - supportsScreenShare: Display media API availability
 * - supportsDeviceSelection: Device enumeration API
 * - supportsAudioOutput: Speaker selection capability
 * - supportsWebRTC: Peer connection API
 * - supportsDataChannels: RTC data channel API
 * - supportsConstraints: Media constraints API
 * 
 * Device Info:
 * - Count of each device type
 * - Default device identification
 * - Device label availability (requires permissions)
 * 
 * @returns Device capabilities, info, and management functions
 * 
 * @example
 * ```tsx
 * const {
 *   capabilities,
 *   deviceInfo,
 *   availableDevices,
 *   refreshDevices
 * } = useDeviceCapabilities();
 * 
 * // Check browser support
 * if (!capabilities.supportsWebRTC) {
 *   return <Alert>WebRTC not supported</Alert>;
 * }
 * 
 * // Show camera selector only if multiple cameras
 * {deviceInfo.cameraCount > 1 && (
 *   <Select>
 *     {availableDevices.cameras.map(cam => (
 *       <option key={cam.deviceId} value={cam.deviceId}>
 *         {cam.label}
 *       </option>
 *     ))}
 *   </Select>
 * )}
 * 
 * // Request permissions to get device labels
 * if (!deviceInfo.devicesLabeled) {
 *   <Button onClick={refreshDevices}>Enable Devices</Button>
 * }
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
