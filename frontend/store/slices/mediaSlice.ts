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
      
      // Update local participant state so UI reflects correct status
      const { clientInfo, setAudioEnabled, setVideoEnabled, updateParticipant, webrtcManager } = get();
      if (clientInfo) {
        setAudioEnabled(clientInfo.clientId, audioEnabled);
        setVideoEnabled(clientInfo.clientId, videoEnabled);
        
        // Attach stream to local participant so video displays
        const attachStream = () => {
          const currentParticipants = get().participants;
          if (currentParticipants.has(clientInfo.clientId)) {
            updateParticipant(clientInfo.clientId, { stream });
          } else {
            // Participant not in map yet, retry
            setTimeout(attachStream, 100);
          }
        };
        attachStream();
      }
      
      // CRITICAL: Add stream to all existing peers and update WebRTCManager
      if (webrtcManager) {
        // Store stream in WebRTCManager so it's added to future peers automatically
        webrtcManager.setLocalMediaStream(stream);
        
        // Add stream to all existing peers
        const allPeers = webrtcManager.getAllPeers();
        for (const [peerId, peer] of allPeers) {
          const localStreams = peer.getLocalStreams();
          if (!localStreams.has('camera')) {
            peer.addLocalStream(stream, 'camera').catch(() => {
              // Failed to add stream, will retry on renegotiation
            });
          }
        }
      }
    }
  },

  toggleAudio: async () => {
    const { localStream, isAudioEnabled, isVideoEnabled, wsClient, clientInfo, setAudioEnabled, webrtcManager } = get();
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      
      // If no audio tracks exist, need to add audio to the stream
      if (audioTracks.length === 0 && !isAudioEnabled) {
        try {
          // Request only audio (preserve existing video state)
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const audioTrack = audioStream.getAudioTracks()[0];
          
          // Add audio track to existing stream
          localStream.addTrack(audioTrack);
          
          // Enable it since we just requested it
          audioTrack.enabled = true;
          set({ isAudioEnabled: true });
          
          // Update peers with new audio track
          if (webrtcManager) {
            const peers = webrtcManager.getAllPeers();
            for (const peer of peers.values()) {
              await peer.addLocalStream(localStream, 'camera');
            }
          }
          
          // Notify backend
          if (wsClient && clientInfo) {
            wsClient.toggleAudio(clientInfo, true);
            setAudioEnabled(clientInfo.clientId, true);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Microphone permission denied';
          get().handleError(errorMessage);
        }
      } else {
        // Audio tracks exist, just toggle enabled state
        const newState = !isAudioEnabled;
        audioTracks.forEach(track => {
          track.enabled = newState;
        });
        
        set({ isAudioEnabled: newState });
        
        // Notify backend and other participants of the state change
        if (wsClient && clientInfo) {
          wsClient.toggleAudio(clientInfo, newState);
          setAudioEnabled(clientInfo.clientId, newState);
        }
      }
    } else {
      // No stream at all - request both audio and video but only enable audio
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        
        // Enable audio track but disable video
        stream.getAudioTracks().forEach(track => track.enabled = true);
        stream.getVideoTracks().forEach(track => track.enabled = false);
        
        get().setLocalStream(stream);
        set({ isAudioEnabled: true, isVideoEnabled: false });
        
        // Notify backend
        const { wsClient: client, clientInfo: info, setAudioEnabled, setVideoEnabled } = get();
        if (client && info) {
          client.toggleAudio(info, true);
          client.toggleVideo(info, false);
          setAudioEnabled(info.clientId, true);
          setVideoEnabled(info.clientId, false);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Microphone permission denied';
        get().handleError(errorMessage);
      }
    }
  },

  toggleVideo: async () => {
    const { localStream, isVideoEnabled, isAudioEnabled, wsClient, clientInfo, setVideoEnabled, webrtcManager } = get();
    
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      const audioTracks = localStream.getAudioTracks();
      
      // If no video tracks exist, need to add video to the stream
      if (videoTracks.length === 0 && !isVideoEnabled) {
        try {
          // Request only video (preserve existing audio state)
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const videoTrack = videoStream.getVideoTracks()[0];
          
          // Add video track to existing stream
          localStream.addTrack(videoTrack);
          
          // Enable it since we just requested it
          videoTrack.enabled = true;
          set({ isVideoEnabled: true });
          
          // CRITICAL: Ensure audio tracks remain disabled if they were disabled
          if (!isAudioEnabled && audioTracks.length > 0) {
            audioTracks.forEach(track => {
              track.enabled = false;
            });
          }
          
          // Update peers with new video track
          if (webrtcManager) {
            const peers = webrtcManager.getAllPeers();
            for (const peer of peers.values()) {
              await peer.addLocalStream(localStream, 'camera');
            }
          }
          
          // Notify backend
          if (wsClient && clientInfo) {
            wsClient.toggleVideo(clientInfo, true);
            setVideoEnabled(clientInfo.clientId, true);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Camera permission denied';
          get().handleError(errorMessage);
        }
      } else {
        // Video tracks exist, just toggle enabled state
        const newState = !isVideoEnabled;
        videoTracks.forEach(track => {
          track.enabled = newState;
        });
        set({ isVideoEnabled: newState });
        
        // CRITICAL: Ensure audio tracks remain in their current state
        if (!isAudioEnabled && audioTracks.length > 0) {
          audioTracks.forEach(track => {
            track.enabled = false;
          });
        }
        
        // Notify backend and other participants of the state change
        if (wsClient && clientInfo) {
          wsClient.toggleVideo(clientInfo, newState);
          setVideoEnabled(clientInfo.clientId, newState);
        }
      }
    } else {
      // No stream at all - request both audio and video but only enable video
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        // Disable audio track but enable video
        stream.getAudioTracks().forEach(track => track.enabled = false);
        stream.getVideoTracks().forEach(track => track.enabled = true);
        
        get().setLocalStream(stream);
        set({ isVideoEnabled: true, isAudioEnabled: false });
        
        // Notify backend
        const { wsClient: client, clientInfo: info, setVideoEnabled, setAudioEnabled } = get();
        if (client && info) {
          client.toggleVideo(info, true);
          client.toggleAudio(info, false);
          setVideoEnabled(info.clientId, true);
          setAudioEnabled(info.clientId, false);
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