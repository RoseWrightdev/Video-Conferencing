import { StateCreator } from 'zustand';
import { type MediaSlice, type RoomStoreState } from '../types';

/**
 * Media slice for managing local audio/video streams and screen sharing.
 * 
 * State:
 * - localStream: MediaStream from camera/microphone
 * - screenShareStream: MediaStream from display capture
 * - isAudioEnabled: Microphone track enabled state
 * - isVideoEnabled: Camera track enabled state
 * - isScreenSharing: Screen share active flag
 * 
 * Actions:
 * - setLocalStream: Store reference to getUserMedia stream
 * - toggleAudio: Enable/disable microphone track
 * - toggleVideo: Enable/disable camera track
 * - startScreenShare: Capture display and create screen stream
 * - stopScreenShare: Stop screen share tracks and cleanup
 * 
 * MediaStream Management:
 * - Tracks are never destroyed on toggle, only enabled/disabled
 * - This allows instant re-enable without requesting permissions
 * - Actual stream cleanup happens in RoomService.leaveRoom
 * 
 * Screen Sharing:
 * - Delegates to WebRTCManager for track negotiation
 * - Replaces video track in existing peer connections
 * - Stops all screen tracks on stopScreenShare
 * 
 * Error Handling:
 * - Permission denials reported via handleError action
 * - Throws errors for component-level try/catch
 * - Errors displayed in UI toast notifications
 * 
 * @see MediaStream For Web API documentation
 * @see WebRTCManager.startScreenShare For peer connection updates
 */
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
    // When stream is set, check which tracks are present and enable them
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      set({ 
        isAudioEnabled: audioTracks.length > 0 && audioTracks[0].enabled,
        isVideoEnabled: videoTracks.length > 0 && videoTracks[0].enabled
      });
    }
  },

  toggleAudio: async () => {
    const { localStream, isAudioEnabled } = get();
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      set({ isAudioEnabled: !isAudioEnabled });
    } else {
      // No stream - try to request permissions and initialize
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        get().setLocalStream(stream);
        set({ isAudioEnabled: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Microphone permission denied';
        get().handleError(errorMessage);
      }
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
      // No stream - try to request permissions and initialize
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        get().setLocalStream(stream);
        set({ isVideoEnabled: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Camera permission denied';
        get().handleError(errorMessage);
      }
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