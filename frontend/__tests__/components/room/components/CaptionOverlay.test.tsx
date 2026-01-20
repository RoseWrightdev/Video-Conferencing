import { render, screen, act } from '@testing-library/react';
import { CaptionOverlay } from '@/components/room/components/CaptionOverlay';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRoomStore } from '@/store/useRoomStore';

// Mock useRoomStore
vi.mock('@/store/useRoomStore', () => ({
    useRoomStore: vi.fn(),
}));

describe('CaptionOverlay', () => {
    const mockUseRoomStore = useRoomStore as unknown as ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when captions are disabled', () => {
        mockUseRoomStore.mockReturnValue({
            captions: [{ text: 'Hello', isFinal: true, timestamp: 123 }],
            isCaptionsEnabled: false,
        });

        const { container } = render(<CaptionOverlay />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when there are no captions', () => {
        mockUseRoomStore.mockReturnValue({
            captions: [],
            isCaptionsEnabled: true,
        });

        const { container } = render(<CaptionOverlay />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders captions when enabled and populated', () => {
        mockUseRoomStore.mockReturnValue({
            captions: [
                { text: 'Hello World', isFinal: true, timestamp: 100, sessionId: 'room:user1' },
                { text: 'This is a test', isFinal: false, timestamp: 200, sessionId: 'room:user1' },
            ],
            isCaptionsEnabled: true,
            participants: new Map(),
        });

        render(<CaptionOverlay />);

        expect(screen.getByText('Hello World')).toBeDefined();
        expect(screen.getByText('This is a test')).toBeDefined();
    });

    it('renders only the last 2 captions', () => {
        mockUseRoomStore.mockReturnValue({
            captions: [
                { text: 'One', isFinal: true, timestamp: 100, sessionId: 'room:user1' },
                { text: 'Two', isFinal: true, timestamp: 200, sessionId: 'room:user1' },
                { text: 'Three', isFinal: true, timestamp: 300, sessionId: 'room:user1' },
            ],
            isCaptionsEnabled: true,
            participants: new Map(),
        });

        render(<CaptionOverlay />);

        expect(screen.queryByText('One')).toBeNull();
        expect(screen.getByText('Two')).toBeDefined();
        expect(screen.getByText('Three')).toBeDefined();
    });

    it('fades out caption after 1 second', () => {
        vi.useFakeTimers();
        mockUseRoomStore.mockReturnValue({
            captions: [
                { text: 'Fading Caption', isFinal: true, timestamp: 100, sessionId: 'room:user1' },
            ],
            isCaptionsEnabled: true,
            participants: new Map(),
        });

        render(<CaptionOverlay />);

        // Initially visible
        expect(screen.getByText('Fading Caption')).toBeDefined();

        // Advance time by 1s (plus a bit to be safe, e.g. 1100ms)
        act(() => {
            vi.advanceTimersByTime(1100);
        });

        // Should be removed from DOM (component returns null when !isVisible)
        expect(screen.queryByText('Fading Caption')).toBeNull();

        vi.useRealTimers();
    });
});
