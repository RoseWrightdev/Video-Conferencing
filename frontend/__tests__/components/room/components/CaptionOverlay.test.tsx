import { render, screen } from '@testing-library/react';
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
                { text: 'Hello World', isFinal: true, timestamp: 100 },
                { text: 'This is a test', isFinal: false, timestamp: 200 },
            ],
            isCaptionsEnabled: true,
        });

        render(<CaptionOverlay />);

        expect(screen.getByText('Hello World')).toBeDefined();
        expect(screen.getByText('This is a test')).toBeDefined();
    });
});
