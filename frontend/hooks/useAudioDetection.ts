import { useEffect, useState, useRef } from 'react';
import { Participant } from '@/store/types';
import { createLogger } from '@/lib/logger';

const logger = createLogger('AudioDetection');

/**
 * Hook to detect speaking activity for multiple participants using a single AudioContext.
 * Returns a Set of participant IDs who are currently speaking.
 * 
 * @param participants - Map or Array of participants to monitor
 * @param threshold - Volume threshold (0-1) to consider as "speaking"
 * @param enabled - Whether audio detection is active
 */
export function useAudioDetection(
  participants: Map<string, Participant> | Participant[],
  threshold: number = 0.02,
  enabled: boolean = true
): Set<string> {
  const [speakingParticipants, setSpeakingParticipants] = useState<Set<string>>(new Set());

  // Refs to persist AudioContext resources across renders without re-creating them
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode, source: MediaStreamAudioSourceNode }>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Cleanup if disabled
      cleanup();
      setSpeakingParticipants(new Set());
      return;
    }

    // Initialize AudioContext if needed
    if (!audioContextRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
        }
      } catch (e) {
        logger.error('Failed to create AudioContext', e);
        return;
      }
    }

    const ctx = audioContextRef.current;
    if (!ctx) return;

    // Convert input to array for easier processing
    const participantsList = Array.isArray(participants)
      ? participants
      : Array.from(participants.values());

    // 1. Sync Analysers: Add new ones, remove old ones
    const currentIds = new Set(participantsList.map(p => p.id));

    // Remove stale analysers
    for (const [id, nodes] of analysersRef.current.entries()) {
      if (!currentIds.has(id)) {
        nodes.source.disconnect();
        nodes.analyser.disconnect();
        analysersRef.current.delete(id);
      }
    }

    // Add new analysers for participants with audio tracks
    participantsList.forEach(p => {
      // Skip if we already have an analyser for this user
      // Note: If the stream *reference* changes, we might want to re-create. 
      // But usually stream ID check is enough? 
      // Let's rely on cleaning up if the stream is gone or changed.
      // For simplicity, if we have an entry for the ID, we assume it's good unless stream is missing.

      const existing = analysersRef.current.get(p.id);

      if (!p.stream || p.stream.getAudioTracks().length === 0) {
        if (existing) {
          existing.source.disconnect();
          existing.analyser.disconnect();
          analysersRef.current.delete(p.id);
        }
        return;
      }

      // If we don't have one, or the stream ID changed (optional enhancement), create it
      // For now simple check: if not exists, create.
      if (!existing) {
        try {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.8;

          const source = ctx.createMediaStreamSource(p.stream);
          source.connect(analyser);

          analysersRef.current.set(p.id, { analyser, source });
        } catch (err) {
          logger.error(`Failed to create analyser for ${p.id}`, err);
        }
      }
    });

    // 2. Start Polling Loop if not running
    if (!intervalRef.current) {
      const dataArray = new Uint8Array(256); // Re-use buffer? Analyser size is 512, bin count 256

      intervalRef.current = setInterval(() => {
        const speaking = new Set<string>();
        const nowSpeakingNodes = analysersRef.current; // access current ref

        if (nowSpeakingNodes.size === 0) {
          setSpeakingParticipants(prev => prev.size === 0 ? prev : new Set());
          return;
        }

        nowSpeakingNodes.forEach(({ analyser }, id) => {
          analyser.getByteFrequencyData(dataArray);

          const sum = dataArray.reduce((acc, val) => acc + val, 0);
          const avgVolume = sum / dataArray.length / 255;

          if (avgVolume > threshold) {
            speaking.add(id);
          }
        });

        // Only trigger update if sets are different
        setSpeakingParticipants(prev => {
          if (prev.size !== speaking.size) return speaking;
          for (const id of speaking) {
            if (!prev.has(id)) return speaking;
          }
          return prev;
        });

      }, 100);
    }

    // Resume context if suspended (browser requirements)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(err => logger.error('Failed to resume AudioContext', err));
    }

  }, [participants, enabled, threshold]); // Re-run when list changes

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, []);

  function cleanup() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    analysersRef.current.forEach(({ source, analyser }) => {
      source.disconnect();
      analyser.disconnect();
    });
    analysersRef.current.clear();

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
  }

  return speakingParticipants;
}
