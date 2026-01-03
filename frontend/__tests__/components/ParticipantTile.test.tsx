
import { render, screen, act } from '@testing-library/react';
import ParticipantTile from '@/components/participants/components/ParticipantTile';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Participant } from '@/store/types';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
    loggers: {
        media: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    },
}));

// Helper to Create Mock Stream
const createMockStream = (id: string, hasVideo = true) => {
    const tracks: any[] = [];
    if (hasVideo) {
        tracks.push({
            id: `${id}-video`,
            kind: 'video',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
    }
    return {
        id,
        getTracks: () => tracks,
        getVideoTracks: () => hasVideo ? tracks : [],
        getAudioTracks: () => [],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    } as unknown as MediaStream;
};

// Mock Lifecycle Hook
vi.mock('@/hooks/useMediaStreamLifecycle', () => ({
    useMediaStreamLifecycle: vi.fn((stream) => ({
        stream,
        videoTracks: stream ? stream.getVideoTracks() : [],
        audioTracks: [],
        activeVideoTrack: stream ? stream.getVideoTracks()[0] : undefined,
        version: 0,
    })),
}));

describe('ParticipantTile - Screen Share Stuck', () => {
    const mockParticipant: Participant = {
        id: 'user-1',
        username: 'User 1',
        role: 'participant',
        isAudioEnabled: false,
        isVideoEnabled: false, // Start without camera
        isScreenSharing: false,
        isHandRaised: false,
        stream: undefined,
    };

    it('should clear video source when screenShareStream becomes null while isScreenSharing is still true', () => {
        // Scenario: User is sharing screen
        // 1. Initial State: Screen Sharing Active
        const screenStream = createMockStream('screen-stream');
        const { rerender, container } = render(
            <ParticipantTile
                participant={{ ...mockParticipant, isScreenSharing: true }}
                isLocal={true}
                isScreenSharing={true}
                screenShareStream={screenStream}
            />
        );

        const videoEl = container.querySelector('video') as HTMLVideoElement;

        // START: Manually set srcObject because JSDOM video element doesn't do it automatically via props?
        // Wait, the component has a useEffect that sets .srcObject.
        // In JSDOM, does useEffect run? Yes.
        // Does assigning .srcObject work? Yes, it's a property.

        expect(videoEl.srcObject).toBe(screenStream);

        // 2. Scenario: Stop Sharing
        // mediaSlice updates screenShareStream to null immediately.
        // But participant.isScreenSharing might still be true due to async server roundtrip.

        rerender(
            <ParticipantTile
                participant={{ ...mockParticipant, isScreenSharing: true }} // Still true from server
                isLocal={true}
                isScreenSharing={true} // Still true from prop
                screenShareStream={null} // Becomes null immediately
            />
        );

        // FAILURE EXPECTATION: If the bug exists, this might be stuck or not cleared?
        // Based on my code analysis:
        // rawStream = (true && true && null) -> null.
        // useMediaStreamLifecycle(null) -> streamToDisplay = null.
        // useEffect -> if (!streamToDisplay) -> videoEl.srcObject = null.

        expect(videoEl.srcObject).toBeNull();
    });

    it('should switch back to camera if camera is on when screen share stops', () => {
        const screenStream = createMockStream('screen-stream');
        const cameraStream = createMockStream('camera-stream');

        // User has camera ON
        const participantWithCamera = { ...mockParticipant, stream: cameraStream, isVideoEnabled: true };

        const { rerender, container } = render(
            <ParticipantTile
                participant={{ ...participantWithCamera, isScreenSharing: true }}
                isLocal={true}
                isScreenSharing={true}
                screenShareStream={screenStream}
                isVideoEnabled={true}
            />
        );

        const videoEl = container.querySelector('video') as HTMLVideoElement;
        expect(videoEl.srcObject).toBe(screenStream); // Screen share takes priority

        // Stop Sharing
        rerender(
            <ParticipantTile
                participant={{ ...participantWithCamera, isScreenSharing: true }} // Still true
                isLocal={true}
                isScreenSharing={true}
                screenShareStream={null} // Null
                isVideoEnabled={true}
            />
        );

        // Should fallback to camera
        expect(videoEl.srcObject).toBe(cameraStream);
    });
});
