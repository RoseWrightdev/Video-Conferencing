import { StateCreator } from 'zustand';
import { type MediaSlice, type RoomStoreState } from '../types';

export const createMediaSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  MediaSlice
> = (set, get) => ({
  localStream: null,
  screenShareStream: null,
  isAudioEnabled: true,
  isVideoEnabled: true,
  isScreenSharing: false,

  setLocalStream: (stream) => set({ localStream: stream }),

  toggleAudio: async () => {
    const { localStream, isAudioEnabled } = get();
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      set({ isAudioEnabled: !isAudioEnabled });
    } else {
      const error = 'Microphone not available. Please check permissions.';
      get().handleError(error);
      throw new Error(error);
    }
  },

  toggleVideo: async () => {
    const { localStream, isVideoEnabled } = get();
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      set({ isVideoEnabled: !isVideoEnabled });
    } else {
      const error = 'Camera not available. Please check permissions.';
      get().handleError(error);
      throw new Error(error);
    }
  },

  startScreenShare: async () => {
    try {
      const webrtcManager = get().webrtcManager;
      if (webrtcManager) {
        const screenStream = await webrtcManager.startScreenShare();
        set({ 
          screenShareStream: screenStream,
          isScreenSharing: true 
        });
      }
    } catch (error) {
      const errorMessage = `Failed to start screen share: ${error instanceof Error ? error.message : String(error)}`;
      get().handleError(errorMessage);
      throw new Error(errorMessage);
    }
  },

  stopScreenShare: async () => {
    const webrtcManager = get().webrtcManager;
    if (webrtcManager) {
        await webrtcManager.stopScreenShare();
    }
    set({ 
      screenShareStream: null,
      isScreenSharing: false 
    });
  },
});