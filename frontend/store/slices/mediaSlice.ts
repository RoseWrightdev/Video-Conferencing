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
    // When stream is set, check which tracks are present and their enabled state
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      const audioEnabled = audioTracks.length > 0 && audioTracks[0].enabled;
      const videoEnabled = videoTracks.length > 0 && videoTracks[0].enabled;
      
      set({ 
        isAudioEnabled: audioEnabled,
        isVideoEnabled: videoEnabled
      });
      
      // Notify backend of initial media state AND update local participant state
      const { wsClient, clientInfo, setAudioEnabled, setVideoEnabled, updateParticipant, participants } = get();
      if (wsClient && clientInfo) {
        wsClient.toggleAudio(clientInfo, audioEnabled);
        wsClient.toggleVideo(clientInfo, videoEnabled);
        
        // Immediately update local participant state so UI reflects correct status
        // The broadcast from backend will also trigger this, but doing it now prevents flicker
        setAudioEnabled(clientInfo.clientId, audioEnabled);
        setVideoEnabled(clientInfo.clientId, videoEnabled);
        
        // Attach stream to local participant so video displays
        // Try immediately, and if participant doesn't exist yet, retry after a short delay
        const attachStream = () => {
          const currentParticipants = get().participants;
          if (currentParticipants.has(clientInfo.clientId)) {
            try {
              updateParticipant(clientInfo.clientId, { stream });
            } catch (error) {
              // Participant might not exist yet, retry
              setTimeout(attachStream, 100);
            }
          } else {
            // Participant not in map yet, retry
            setTimeout(attachStream, 100);
          }
        };
        attachStream();
      }
    }
  },

  toggleAudio: async () => {
    const { localStream, isAudioEnabled, wsClient, clientInfo, setAudioEnabled } = get();
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      const newState = !isAudioEnabled;
      audioTracks.forEach(track => {
        track.enabled = newState;
      });
      set({ isAudioEnabled: newState });
      
      // Notify backend and other participants of the state change
      if (wsClient && clientInfo) {
        wsClient.toggleAudio(clientInfo, newState);
        // Immediately update local participant state for instant UI feedback
        setAudioEnabled(clientInfo.clientId, newState);
      }
    } else {
      // No stream - try to request permissions and initialize
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        get().setLocalStream(stream);
        set({ isAudioEnabled: true });
        
        // Notify backend that audio is now enabled
        const { wsClient: client, clientInfo: info, setAudioEnabled } = get();
        if (client && info) {
          client.toggleAudio(info, true);
          setAudioEnabled(info.clientId, true);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Microphone permission denied';
        get().handleError(errorMessage);
      }
    }
  },

  toggleVideo: async () => {
    const { localStream, isVideoEnabled, wsClient, clientInfo, setVideoEnabled } = get();
    
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      const newState = !isVideoEnabled;
      
      videoTracks.forEach(track => {
        track.enabled = newState;
      });
      set({ isVideoEnabled: newState });
      
      // Notify backend and other participants of the state change
      if (wsClient && clientInfo) {
        wsClient.toggleVideo(clientInfo, newState);
        // Immediately update local participant state for instant UI feedback
        setVideoEnabled(clientInfo.clientId, newState);
      }
    } else {
      // No stream - try to request permissions and initialize
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        get().setLocalStream(stream);
        set({ isVideoEnabled: true });
        
        // Notify backend that video is now enabled
        const { wsClient: client, clientInfo: info, setVideoEnabled } = get();
        if (client && info) {
          client.toggleVideo(info, true);
          setVideoEnabled(info.clientId, true);
        }
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