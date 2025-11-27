import { StateCreator } from 'zustand';
import { type DeviceSlice, type RoomStoreState } from '../types';

/**
 * Device slice for managing available media input/output devices.
 * 
 * State:
 * - availableDevices: Lists of cameras, microphones, and speakers
 * - selectedDevices: Currently active device IDs for each type
 * 
 * Actions:
 * - refreshDevices: Query browser for all media devices
 * - switchCamera: Change active video input device
 * - switchMicrophone: Change active audio input device
 * 
 * Device Enumeration:
 * - Uses navigator.mediaDevices.enumerateDevices API
 * - Filters by kind: videoinput, audioinput, audiooutput
 * - Device labels only available after permission grant
 * - Auto-refreshes on 'devicechange' events (plug/unplug)
 * 
 * Device Switching:
 * - Updates selectedDevices state immediately
 * - WebRTCManager handles renegotiation with new constraints
 * - Requires restarting local stream with new deviceId constraint
 * 
 * Permissions:
 * - Device list may show empty labels before getUserMedia
 * - First media access triggers permission prompt
 * - Subsequent calls populate labels automatically
 * 
 * Browser Compatibility:
 * - enumerateDevices supported in all modern browsers
 * - audiooutput (speakers) not available in Firefox
 * - Device labels may vary by browser/OS
 * 
 * @see MediaDeviceInfo For device metadata structure
 * @see useDeviceCapabilities For capability detection
 */
export const createDeviceSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  DeviceSlice
> = (set, get) => ({
  availableDevices: {
    cameras: [],
    microphones: [],
    speakers: [],
  },
  selectedDevices: {},

  refreshDevices: async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      const microphones = devices.filter(device => device.kind === 'audioinput');
      const speakers = devices.filter(device => device.kind === 'audiooutput');

      set({
        availableDevices: { cameras, microphones, speakers }
      });
    } catch (error) {
      const errorMessage = `Failed to refresh devices: ${error instanceof Error ? error.message : String(error)}`;
      get().handleError(errorMessage);
      throw new Error(errorMessage);
    }
  },

  switchCamera: async (deviceId) => {
    const { webrtcManager } = get();
    if (webrtcManager) {
      // Logic for switching camera might involve WebRTCManager directly
      // For now, we just update the selected device
      set((state) => ({
        selectedDevices: { ...state.selectedDevices, camera: deviceId }
      }));
    }
  },

  switchMicrophone: async (deviceId) => {
    const { webrtcManager } = get();
    if (webrtcManager) {
      // Logic for switching microphone
      set((state) => ({
        selectedDevices: { ...state.selectedDevices, microphone: deviceId }
      }));
    }
  },
});