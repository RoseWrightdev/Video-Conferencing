import { useEffect, useState } from 'react';

export function useAudioDetection(
  stream: MediaStream | null | undefined,
  threshold: number = 0.02,
  enabled: boolean = true
): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !enabled) {
      setIsSpeaking(false);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setIsSpeaking(false);
      return;
    }

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let intervalId: NodeJS.Timeout | null = null;

    try {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;

      source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Check audio levels every 100ms
      intervalId = setInterval(() => {
        if (!analyser) return;

        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const avgVolume = sum / dataArray.length / 255; // Normalize to 0-1

        setIsSpeaking(avgVolume > threshold);
      }, 100);
    } catch (error) {
      console.error('Failed to initialize audio detection:', error);
      setIsSpeaking(false);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (source) source.disconnect();
      if (audioContext) audioContext.close();
    };
  }, [stream, threshold, enabled]);

  return isSpeaking;
}
