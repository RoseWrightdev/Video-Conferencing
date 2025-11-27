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
      console.warn('No local stream available for audio toggle');
      get().handleError('Microphone not available. Please check permissions.');
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
      console.warn('No local stream available for video toggle');
      get().handleError('Camera not available. Please check permissions.');
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
      console.error('Failed to start screen share:', error);
      get().handleError(`Failed to start screen share: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
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