import { StateCreator } from 'zustand';
import { type MediaSlice, type RoomStoreState } from '../types';
import { loggers } from '@/lib/logger';

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
    const sfu = get().sfuClient;
    const oldStream = get().localStream;

    // Remove old tracks from SFU if they exist
    if (oldStream && sfu) {
      oldStream.getTracks().forEach(track => {
        const sender = sfu.pc.getSenders().find((s: RTCRtpSender) => s.track?.id === track.id);
        if (sender) {
          sfu.pc.removeTrack(sender);
        }
        track.stop();
      });
    }

    set({ localStream: stream });

    // Add new tracks to SFU if connected, but ONLY if they are enabled
    // This prevents disabled tracks (from initialization) from being added
    if (stream && sfu) {
      stream.getTracks().forEach(track => {
        if (track.enabled) {
          sfu.addTrack(track, stream);
          loggers.media.debug('Added enabled track to SFU via setLocalStream', {
            kind: track.kind,
            trackId: track.id,
            enabled: track.enabled
          });
        } else {
          loggers.media.debug('Skipped disabled track in setLocalStream', {
            kind: track.kind,
            trackId: track.id,
            enabled: track.enabled
          });
        }
      });
    }

    // Update local participant's stream in the participants map
    const currentUserId = get().currentUserId;
    if (currentUserId) {
      get().setParticipantStream(currentUserId, stream);
      get().roomClient?.setLocalStream(currentUserId, stream); // Sync to Engine
    }
  },

  toggleVideo: async () => {
    const { localStream, isVideoEnabled, isAudioEnabled, sfuClient, wsClient, currentUserId, setVideoEnabled } = get();
    loggers.media.debug('toggleVideo called', { hasLocalStream: !!localStream, isVideoEnabled, isAudioEnabled, currentUserId, hasSfu: !!sfuClient });

    const newEnabled = !isVideoEnabled;

    if (newEnabled) {
      try {
        // Get new video track
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];

        let stream = localStream;

        if (stream) {
          // Reuse existing stream to keep StreamId constant
          stream.addTrack(videoTrack);
        } else {
          // Create new stream if none exists
          stream = new MediaStream([videoTrack]);
        }

        // Add video track to SFU
        if (sfuClient) {
          // IMPORTANT: Pass the stream that now contains the track
          sfuClient.addTrack(videoTrack, stream);
          loggers.media.debug('Added video track to SFU', { trackId: videoTrack.id, streamId: stream.id });
        }

        set({ localStream: stream, isVideoEnabled: true });

        // Update UI state
        if (currentUserId) {
          get().setParticipantStream(currentUserId, stream);
          get().roomClient?.setLocalStream(currentUserId, stream);
          setVideoEnabled(currentUserId, true);
        }

        // Notify server
        wsClient?.send({ toggleMedia: { kind: 'video', isEnabled: true } });
        loggers.media.debug('Video enabled successfully');
      } catch (e) {
        loggers.media.error('Failed to enable video', e);
        console.error('Failed to enable video:', e);
      }
    } else {
      // Disable video
      if (localStream) {
        const videoTracks = localStream.getVideoTracks();

        // Remove video tracks from SFU
        if (sfuClient) {
          videoTracks.forEach(track => {
            const sender = sfuClient.pc.getSenders().find((s: RTCRtpSender) => s.track?.id === track.id);
            if (sender) {
              sfuClient.pc.removeTrack(sender);
              loggers.media.debug('Removed video track from SFU', { trackId: track.id });
            }
            track.stop();
            // Also remove from local stream object
            localStream.removeTrack(track);
          });
        } else {
          videoTracks.forEach(track => {
            track.stop();
            localStream.removeTrack(track);
          });
        }

        // Check if stream is empty. If so, maybe keep it or null using strict logic?
        // Usually better to keep the object if audio remains. 
        // If Audio is also empty, we can set to null.
        const hasTracks = localStream.getTracks().length > 0;
        const newStream = hasTracks ? localStream : null;

        set({ localStream: newStream, isVideoEnabled: false });

        // Update UI state
        if (currentUserId) {
          get().setParticipantStream(currentUserId, newStream);
          get().roomClient?.setLocalStream(currentUserId, newStream);
          setVideoEnabled(currentUserId, false);
        }

        // Notify server
        wsClient?.send({ toggleMedia: { kind: 'video', isEnabled: false } });
        loggers.media.debug('Video disabled successfully');
      }
    }
  },

  toggleAudio: async () => {
    const { localStream, isAudioEnabled, isVideoEnabled, sfuClient, wsClient, currentUserId, setAudioEnabled } = get();
    loggers.media.debug('toggleAudio called', { hasLocalStream: !!localStream, isAudioEnabled, isVideoEnabled, currentUserId, hasSfu: !!sfuClient });

    const newEnabled = !isAudioEnabled;

    if (newEnabled) {
      try {
        // Get new audio track
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTrack = audioStream.getAudioTracks()[0];

        let stream = localStream;

        if (stream) {
          // Reuse existing stream to keep StreamId constant
          stream.addTrack(audioTrack);
        } else {
          // Create new stream if none exists
          stream = new MediaStream([audioTrack]);
        }

        // Add audio track to SFU
        if (sfuClient) {
          sfuClient.addTrack(audioTrack, stream);
          loggers.media.debug('Added audio track to SFU', { trackId: audioTrack.id, streamId: stream.id });
        }

        set({ localStream: stream, isAudioEnabled: true });

        // Update UI state
        if (currentUserId) {
          get().setParticipantStream(currentUserId, stream);
          get().roomClient?.setLocalStream(currentUserId, stream);
          setAudioEnabled(currentUserId, true);
        }

        // Notify server
        wsClient?.send({ toggleMedia: { kind: 'audio', isEnabled: true } });
        loggers.media.debug('Audio enabled successfully');
      } catch (e) {
        loggers.media.error('Failed to enable audio', e);
        console.error('Failed to enable audio:', e);
      }
    } else {
      // Disable audio
      if (localStream) {
        const audioTracks = localStream.getAudioTracks();

        // Remove audio tracks from SFU
        if (sfuClient) {
          audioTracks.forEach(track => {
            const sender = sfuClient.pc.getSenders().find((s: RTCRtpSender) => s.track?.id === track.id);
            if (sender) {
              sfuClient.pc.removeTrack(sender);
              loggers.media.debug('Removed audio track from SFU', { trackId: track.id });
            }
            track.stop();
            localStream.removeTrack(track);
          });
        } else {
          audioTracks.forEach(track => {
            track.stop();
            localStream.removeTrack(track);
          });
        }

        const hasTracks = localStream.getTracks().length > 0;
        const newStream = hasTracks ? localStream : null;

        set({ localStream: newStream, isAudioEnabled: false });

        // Update UI state
        if (currentUserId) {
          get().setParticipantStream(currentUserId, newStream);
          get().roomClient?.setLocalStream(currentUserId, newStream);
          setAudioEnabled(currentUserId, false);
        }

        // Notify server
        wsClient?.send({ toggleMedia: { kind: 'audio', isEnabled: false } });
        loggers.media.debug('Audio disabled successfully');
      }
    }
  },

  startScreenShare: async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      set({ screenShareStream: stream, isScreenSharing: true });

      const sfu = get().sfuClient;
      if (sfu && stream) {
        const track = stream.getVideoTracks()[0];
        // Add screen track to SFU connection
        sfu.addTrack(track, stream);

        // Listen for browser UI "Stop sharing" event
        track.onended = () => {
          loggers.media.info('Screen share ended by browser UI');
          get().stopScreenShare();
        };

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
    const { screenShareStream, sfuClient } = get();

    if (screenShareStream) {
      screenShareStream.getTracks().forEach(t => {
        t.stop();
        // Remove from SFU to prevent ghost tracks
        if (sfuClient) {
          const sender = sfuClient.pc.getSenders().find((s: RTCRtpSender) => s.track && s.track.id === t.id);
          if (sender) {
            sfuClient.pc.removeTrack(sender);
            loggers.media.debug('Removed screen share track from SFU', { trackId: t.id });
          }
        }
      });
    }

    set({ screenShareStream: null, isScreenSharing: false });

    // Notify Backend
    get().wsClient?.send({
      screenShare: { isSharing: false }
    });
  }
});