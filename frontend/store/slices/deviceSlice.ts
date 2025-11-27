import { StateCreator } from 'zustand';
import { type DeviceSlice, type RoomStoreState } from '../types';

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