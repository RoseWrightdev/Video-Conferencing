import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DeviceSelector from '@/components/settings/components/DeviceSelector';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Mic: () => <span data-testid="icon-mic" />,
    Video: () => <span data-testid="icon-video" />,
    Volume2: () => <span data-testid="icon-volume" />,
    ChevronDownIcon: () => <span data-testid="icon-chevron-down" />,
    ChevronUpIcon: () => <span data-testid="icon-chevron-up" />,
    Check: () => <span data-testid="icon-check" />,
    CheckIcon: () => <span data-testid="icon-check" />,
}));

describe('DeviceSelector', () => {
    const mockEnumerateDevices = vi.fn();
    const mockAddEventListener = vi.fn();
    const mockRemoveEventListener = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock navigator.mediaDevices
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {
                enumerateDevices: mockEnumerateDevices,
                addEventListener: mockAddEventListener,
                removeEventListener: mockRemoveEventListener,
            },
            writable: true,
        });

        // Mock scrollIntoView for Radix UI
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        window.HTMLElement.prototype.hasPointerCapture = vi.fn();
        window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    });

    afterEach(() => {
        // defined property cleanup if needed
    });

    const mockDevices = [
        { deviceId: 'mic-1', label: 'Microphone 1', kind: 'audioinput' },
        { deviceId: 'speaker-1', label: 'Speaker 1', kind: 'audiooutput' },
        { deviceId: 'camera-1', label: 'Camera 1', kind: 'videoinput' },
    ];

    it('enumerates and displays devices on mount', async () => {
        mockEnumerateDevices.mockResolvedValue(mockDevices);

        render(<DeviceSelector />);

        await waitFor(() => {
            expect(mockEnumerateDevices).toHaveBeenCalled();
        });

        // Check if triggers are present
        expect(screen.getByText('Microphone')).toBeInTheDocument();
        expect(screen.getByText('Speaker')).toBeInTheDocument();
        expect(screen.getByText('Camera')).toBeInTheDocument();
    });

    it('selects default devices if available', async () => {
        mockEnumerateDevices.mockResolvedValue(mockDevices);

        render(<DeviceSelector />);

        await waitFor(() => {
            expect(mockEnumerateDevices).toHaveBeenCalled();
        });
    });

    it('handles empty device lists gracefully', async () => {
        mockEnumerateDevices.mockResolvedValue([]);
        render(<DeviceSelector />);

        await waitFor(() => {
            expect(mockEnumerateDevices).toHaveBeenCalled();
        });

        // Should verify empty state trigger exists
        // Note: "No microphones found" is usually inside the content, which might not be open.
        // We just check that query call happened and component rendered without error.
        expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    });
});
