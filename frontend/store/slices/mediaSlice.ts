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

        // Create new stream with both audio and video tracks
        const tracks: MediaStreamTrack[] = [];
        if (localStream) {
          const audioTracks = localStream.getAudioTracks();
          tracks.push(...audioTracks);
        }
        tracks.push(videoTrack);

        const newStream = new MediaStream(tracks);

        // Add video track to SFU
        if (sfuClient) {
          sfuClient.addTrack(videoTrack, newStream);
          loggers.media.debug('Added video track to SFU', { trackId: videoTrack.id });
        }

        set({ localStream: newStream, isVideoEnabled: true });

        // Update UI state
        if (currentUserId) {
          get().setParticipantStream(currentUserId, newStream);
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
          });
        } else {
          videoTracks.forEach(track => track.stop());
        }

        // Create new stream with only audio tracks
        const audioTracks = localStream.getAudioTracks();
        const newStream = audioTracks.length > 0 ? new MediaStream(audioTracks) : null;

        set({ localStream: newStream, isVideoEnabled: false });

        // Update UI state
        if (currentUserId) {
          get().setParticipantStream(currentUserId, newStream);
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

        // Create new stream with both audio and video tracks
        const tracks: MediaStreamTrack[] = [];
        if (localStream) {
          const videoTracks = localStream.getVideoTracks();
          tracks.push(...videoTracks);
        }
        tracks.push(audioTrack);

        const newStream = new MediaStream(tracks);

        // Add audio track to SFU
        if (sfuClient) {
          sfuClient.addTrack(audioTrack, newStream);
          loggers.media.debug('Added audio track to SFU', { trackId: audioTrack.id });
        }

        set({ localStream: newStream, isAudioEnabled: true });

        // Update UI state
        if (currentUserId) {
          get().setParticipantStream(currentUserId, newStream);
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
          });
        } else {
          audioTracks.forEach(track => track.stop());
        }

        // Create new stream with only video tracks
        const videoTracks = localStream.getVideoTracks();
        const newStream = videoTracks.length > 0 ? new MediaStream(videoTracks) : null;

        set({ localStream: newStream, isAudioEnabled: false });

        // Update UI state
        if (currentUserId) {
          get().setParticipantStream(currentUserId, newStream);
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