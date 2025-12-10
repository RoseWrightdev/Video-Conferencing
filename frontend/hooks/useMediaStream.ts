import { useState, useEffect, useRef, useCallback } from 'react';
import { useRoomStore } from '@/store/useRoomStore';

/**
 * Media stream management hook for camera and microphone access.
 * 
 * Responsibilities:
 * - Request and manage getUserMedia permissions
 * - Initialize audio/video streams with constraints
 * - Handle device selection and switching
 * - Auto-restart streams on device changes
 * - Cleanup resources on unmount
 * - Provide stream statistics and diagnostics
 * 
 * State Management:
 * - Local state for initialization lifecycle
 * - Store state for stream references and enabled flags
 * - Ref for stable stream reference across renders
 * 
 * Permissions:
 * - Requests camera/microphone access via getUserMedia
 * - Handles permission denials gracefully
 * - Supports requesting permissions before stream initialization
 * 
 * @param options - Configuration for media stream initialization
 * @param options.autoStart - Start stream automatically on mount (default: false)
 * @param options.video - Video constraints or boolean (default: true)
 * @param options.audio - Audio constraints or boolean (default: true)
 * 
 * @returns Media stream state and control methods
 * 
 * @example
 * ```tsx
 * // Auto-start with custom constraints
 * const { isInitialized, toggleAudio, toggleVideo } = useMediaStream({
 *   autoStart: true,
 *   video: { width: 1280, height: 720, facingMode: 'user' },
 *   audio: { echoCancellation: true, noiseSuppression: true }
 * });
 * 
 * // Manual initialization
 * const { initializeStream, cleanup } = useMediaStream();
 * await initializeStream();
 * 
 * // Get diagnostics
 * const stats = getStreamStats();
 * console.log('Active tracks:', stats.video.count, stats.audio.count);
 * ```
 */

interface MediaStreamState {
  isInitialized: boolean;
  isStarting: boolean;
  error: string | null;
}

interface MediaStreamOptions {
  autoStart?: boolean;
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaTrackConstraints;
}

export const useMediaStream = (options: MediaStreamOptions = {}) => {
  const {
    autoStart = false,
    video = true,
    audio = true,
  } = options;

  const [state, setState] = useState<MediaStreamState>({
    isInitialized: false,
    isStarting: false,
    error: null,
  });

  const streamRef = useRef<MediaStream | null>(null);

  const {
    localStream,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    availableDevices,
    selectedDevices,
    setLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    switchCamera,
    switchMicrophone,
    refreshDevices,
    handleError,
  } = useRoomStore();

  const initializeStream = useCallback(async () => {
    if (state.isStarting || state.isInitialized) {
      return;
    }

    setState(prev => ({ ...prev, isStarting: true, error: null }));

    try {
      await refreshDevices();

      const constraints: MediaStreamConstraints = {};

      if (audio && availableDevices.microphones.length > 0) {
        constraints.audio = typeof audio === 'boolean' ? true : audio;
        if (selectedDevices.microphone) {
          constraints.audio = {
            ...(typeof audio === 'object' ? audio : {}),
            deviceId: { exact: selectedDevices.microphone }
          };
        }
      } else if (audio) {
        throw new Error('Audio requested but no microphones available. Please connect a microphone.');
      }

      if (video && availableDevices.cameras.length > 0) {
        constraints.video = typeof video === 'boolean' ? true : video;
        if (selectedDevices.camera) {
          constraints.video = {
            ...(typeof video === 'object' ? video : {}),
            deviceId: { exact: selectedDevices.camera }
          };
        }
      } else if (video) {
        throw new Error('Video requested but no cameras available. Please connect a camera.');
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      // Disable all tracks by default - users join with media off
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      audioTracks.forEach(track => { track.enabled = false; });
      videoTracks.forEach(track => { track.enabled = false; });
      
      // Store stream in Zustand store
      setLocalStream(stream);

      setState(prev => ({
        ...prev,
        isInitialized: true,
        isStarting: false,
        error: null,
      }));

      return stream;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initialize media stream';
      
      setState(prev => ({
        ...prev,
        isStarting: false,
        error: errorMessage,
      }));

      handleError(errorMessage);
      throw error;
    }
  }, [
    state.isStarting,
    state.isInitialized,
    audio,
    video,
    availableDevices.microphones.length,
    availableDevices.cameras.length,
    selectedDevices.microphone,
    selectedDevices.camera,
    refreshDevices,
    handleError,
  ]);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setState({
      isInitialized: false,
      isStarting: false,
      error: null,
    });
  }, []);

  const restartStream = useCallback(async (newOptions?: MediaStreamOptions) => {
    cleanup();
    if (newOptions) {
      throw new Error('Dynamic constraint updates not fully implemented. Please use fixed options.');
    }
    return initializeStream();
  }, [cleanup, initializeStream]);

  const requestPermissions = useCallback(async () => {
    try {
      if (video) {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoStream.getTracks().forEach(track => track.stop());
      }

      if (audio) {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getTracks().forEach(track => track.stop());
      }

      await refreshDevices();
      return true;

    } catch (error) {
      const errorMessage = 'Media permissions denied. Please allow camera and microphone access.';
      setState(prev => ({ ...prev, error: errorMessage }));
      handleError(errorMessage);
      return false;
    }
  }, [video, audio, refreshDevices, handleError]);

  const isCameraActive = streamRef.current?.getVideoTracks().some(track => track.enabled) ?? false;
  const isMicrophoneActive = streamRef.current?.getAudioTracks().some(track => track.enabled) ?? false;

  const getStreamStats = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      return null;
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    return {
      streamId: stream.id,
      active: stream.active,
      video: {
        count: videoTracks.length,
        enabled: videoTracks.some(track => track.enabled),
        settings: videoTracks[0]?.getSettings(),
        constraints: videoTracks[0]?.getConstraints(),
        label: videoTracks[0]?.label,
      },
      audio: {
        count: audioTracks.length,
        enabled: audioTracks.some(track => track.enabled),
        settings: audioTracks[0]?.getSettings(),
        constraints: audioTracks[0]?.getConstraints(),
        label: audioTracks[0]?.label,
      },
    };
  }, []);

  useEffect(() => {
    if (autoStart && !state.isInitialized && !state.isStarting) {
      initializeStream();
    }
  }, [autoStart, initializeStream, state.isInitialized, state.isStarting]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  useEffect(() => {
    const handleDeviceChange = () => {
      refreshDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  return {
    localStream,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    availableDevices,
    selectedDevices,
    isInitialized: state.isInitialized,
    isStarting: state.isStarting,
    error: state.error,
    isCameraActive,
    isMicrophoneActive,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    switchCamera,
    switchMicrophone,
    refreshDevices,
    initializeStream,
    cleanup,
    restartStream,
    requestPermissions,
    getStreamStats,
  };
};

