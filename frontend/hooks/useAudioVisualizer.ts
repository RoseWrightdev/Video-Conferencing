import { useEffect, useRef } from 'react';
import { createLogger } from '@/lib/logger';
import { Participant } from '@/store/types';

const logger = createLogger('AudioVisualizer');

interface UseAudioVisualizerProps {
    currentUserId: string | null;
    localStream: MediaStream | null;
    isAudioEnabled: boolean;
    participants: Map<string, Participant>;
    unmutedParticipants: Set<string>;
    setSpeakingParticipants: (updater: (prev: Set<string>) => Set<string>) => void;
}

export const useAudioVisualizer = ({
    currentUserId,
    localStream,
    isAudioEnabled,
    participants,
    unmutedParticipants,
    setSpeakingParticipants,
}: UseAudioVisualizerProps) => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
    const sourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());

    const streamIdsRef = useRef<Map<string, string>>(new Map());

    useEffect(() => {
        if (!currentUserId) return;

        // Initialize AudioContext once
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const audioContext = audioContextRef.current;

        // Cleanup helper
        const cleanupDetection = (id: string) => {
            const source = sourcesRef.current.get(id);
            const analyser = analysersRef.current.get(id);

            if (source) {
                source.disconnect();
                sourcesRef.current.delete(id);
            }
            if (analyser) {
                analyser.disconnect();
                analysersRef.current.delete(id);
            }
            streamIdsRef.current.delete(id);
        };

        // Helper to setup detection
        const setupAudioDetection = (id: string, stream: MediaStream) => {
            const currentStreamId = streamIdsRef.current.get(id);

            // If we already have a setup for this exact stream, skip
            if (analysersRef.current.has(id) && currentStreamId === stream.id) {
                return;
            }

            // If we have a setup but the stream changed, cleanup first
            if (analysersRef.current.has(id)) {
                cleanupDetection(id);
            }

            // We only care about audio tracks
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) return;

            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }

            try {
                // Use original track directly to ensure we get data
                // Cloning remote tracks often fails to carry rtp data in some browsers/scenarios
                const track = audioTracks[0];

                // Create a generic MediaStream for the analyzer (wrapping the track)
                const sourceStream = new MediaStream([track]);
                const source = audioContext.createMediaStreamSource(sourceStream);
                const analyser = audioContext.createAnalyser();

                analyser.fftSize = 512;
                analyser.smoothingTimeConstant = 0.5;
                source.connect(analyser);

                sourcesRef.current.set(id, source);
                analysersRef.current.set(id, analyser);
                streamIdsRef.current.set(id, stream.id);
            } catch (err) {
                logger.error('Failed to setup audio detection', { participantId: id, error: err });
            }
        };

        // 1. Handle Local Stream
        if (localStream && isAudioEnabled) {
            setupAudioDetection(currentUserId, localStream);
        } else {
            cleanupDetection(currentUserId);
        }

        // 2. Handle Remote Streams
        // Check which users we need to track
        const usersToTrack = new Set<string>();

        participants.forEach((p) => {
            // Only track if they have a stream and are unmuted
            // Fix: Use p.isAudioEnabled property directly as unmutedParticipants Set might be stale for remote users
            if (p.id !== currentUserId && p.stream && p.isAudioEnabled) {
                usersToTrack.add(p.id);
                setupAudioDetection(p.id, p.stream);
            }
        });

        // Cleanup stale entries
        const currentTrackedIds = Array.from(analysersRef.current.keys());
        currentTrackedIds.forEach(id => {
            if (id === currentUserId) {
                // Handled by local stream check above
                if (!localStream || !isAudioEnabled) cleanupDetection(id);
            } else {
                // If remote user is no longer in valid list, cleanup
                if (!usersToTrack.has(id)) {
                    cleanupDetection(id);
                }
            }
        });


        // Detection Loop
        const dataArray = new Uint8Array(256);
        const threshold = 0.02;
        let animationFrameId: number;

        const checkAudioLevels = () => {
            const speakingNow = new Set<string>();

            analysersRef.current.forEach((analyser, id) => {
                analyser.getByteFrequencyData(dataArray);
                const sum = dataArray.reduce((a, b) => a + b, 0);
                const average = sum / dataArray.length / 255;

                if (average > threshold) {
                    speakingNow.add(id);
                }
            });

            setSpeakingParticipants(prev => {
                let changed = false;
                if (prev.size !== speakingNow.size) changed = true;
                else {
                    for (const id of speakingNow) {
                        if (!prev.has(id)) {
                            changed = true;
                            break;
                        }
                    }
                }
                return changed ? speakingNow : prev;
            });

            animationFrameId = requestAnimationFrame(checkAudioLevels);
        };

        checkAudioLevels();

        return () => {
            cancelAnimationFrame(animationFrameId);
            // NOTE: We do NOT close the AudioContext here to persist it across re-renders
            // But we could clean it up if component unmounts for good. 
            // For now, we rely on the ref to keep it alive.
        };

        // Dependencies: 
        // We break the dependency on 'participants' map by only depending on IDs/Streams if possible
        // But since we iterate participants, we need it. 
        // The key optimization is that setupAudioDetection has an early return exists checks.
    }, [
        currentUserId,
        localStream,
        isAudioEnabled,
        unmutedParticipants,
        // Optimization: We rely on the fact that participants map reference changes, but we check internal map state efficiently
        participants
    ]);

    // Clean up context on unmount ONLY if really needed
    useEffect(() => {
        return () => {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
        }
    }, []);
};
