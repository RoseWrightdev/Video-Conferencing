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
  isAudioEnabled: false,
  isVideoEnabled: false,
  isScreenSharing: false,

  setLocalStream: (stream) => {
    set({ localStream: stream });
    // Update SFU immediately if connected
    const sfu = get().sfuClient;

    if (stream && sfu) {
      stream.getTracks().forEach(track => {
        sfu.addTrack(track, stream);
      });
    }
  },

  toggleVideo: async () => {
    const { localStream, isVideoEnabled, wsClient } = get();

    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        // Toggle Logic
        const newEnabled = !isVideoEnabled;
        videoTrack.enabled = newEnabled;
        set({ isVideoEnabled: newEnabled });

        // Notify Backend (State Update via Protobuf)
        wsClient?.send({
          toggleMedia: { kind: 'video', isEnabled: newEnabled }
        });
      }
    }
  },

  toggleAudio: async () => {
    const { localStream, isAudioEnabled, wsClient } = get();

    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const newEnabled = !isAudioEnabled;
        audioTrack.enabled = newEnabled;
        set({ isAudioEnabled: newEnabled });

        wsClient?.send({
          toggleMedia: { kind: 'audio', isEnabled: newEnabled }
        });
      }
    }
  },

  startScreenShare: async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      set({ screenShareStream: stream, isScreenSharing: true });

      const sfu = get().sfuClient;
      if (sfu && stream) {
        // Add screen track to SFU connection
        sfu.addTrack(stream.getVideoTracks()[0], stream);

        // Notify Backend
        get().wsClient?.send({
          screenShare: { isSharing: true }
        });
      }
    } catch (e) {
      console.error(e);
    }
  },

  stopScreenShare: async () => {
    const { screenShareStream } = get();
    screenShareStream?.getTracks().forEach(t => t.stop());
    set({ screenShareStream: null, isScreenSharing: false });

    // Notify Backend
    get().wsClient?.send({
      screenShare: { isSharing: false }
    });
  }
});