import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActiveRoom } from '@/components/room/ActiveRoom';

// Mock dependencies
const mockSetGridLayout = vi.fn();
const mockToggleSettingsPanel = vi.fn();
const mockPinParticipant = vi.fn();
const mockRefreshDevices = vi.fn();

// Factory mock for useRoomStore
vi.mock('@/store/useRoomStore', () => ({
    useRoomStore: vi.fn(() => ({
        screenShareStream: null,
        raisingHandParticipants: new Set(),
        participants: new Map([['user-1', { id: 'user-1', name: 'User 1' }]]),
        unmutedParticipants: new Set(),
        cameraOnParticipants: new Set(),
        sharingScreenParticipants: new Set(),
        isParticipantsPanelOpen: false,
        isSettingsPanelOpen: false,
        pinnedParticipantId: null,
        gridLayout: 'grid',
        toggleSettingsPanel: mockToggleSettingsPanel,
        setGridLayout: mockSetGridLayout,
        pinParticipant: mockPinParticipant,
        currentUserId: 'user-1',
    })),
}));

vi.mock('@/hooks', () => ({
    useChat: vi.fn(),
}));
vi.mock('@/hooks/useAudioDetection', () => ({
    useAudioDetection: vi.fn(),
}));

// Mock components
vi.mock('@/components/room/components/Controls', () => ({
    default: () => <div data-testid="controls">Controls</div>,
}));
vi.mock('@/components/participants/components/ParticipantGrid', () => ({
    default: () => <div data-testid="participant-grid">Participant Grid</div>,
}));
vi.mock('@/components/participants/components/ParticipantsPanel', () => ({
    default: () => <div data-testid="participants-panel">Participants Panel</div>,
}));
vi.mock('@/components/chat-panel/components/ChatPanel', () => ({
    default: () => <div data-testid="chat-panel">Chat Panel</div>,
}));
vi.mock('@/components/settings/components/SettingsPanel', () => ({
    default: () => <div data-testid="settings-panel">Settings Panel</div>,
}));
vi.mock('@/components/room/components/LeaveRoomDialog', () => ({
    default: () => <div data-testid="leave-room-dialog">Leave Room Dialog</div>,
}));
vi.mock('@/components/room/components/CaptionOverlay', () => ({
    CaptionOverlay: () => <div data-testid="caption-overlay">Caption Overlay</div>,
}));

// Import after mocks
import { useRoomStore } from '@/store/useRoomStore';
import { useChat } from '@/hooks';
import { useAudioDetection } from '@/hooks/useAudioDetection';

describe('RoomFlow Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default hooks mocks
        (useChat as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ isChatPanelOpen: false });
        (useAudioDetection as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    });

    it('renders critical room components', () => {
        render(<ActiveRoom permissionsGranted={true} refreshDevices={mockRefreshDevices} />);

        expect(screen.getByTestId('participant-grid')).toBeInTheDocument();
        expect(screen.getByTestId('controls')).toBeInTheDocument();
        expect(screen.getByTestId('caption-overlay')).toBeInTheDocument();
        expect(screen.getByTestId('leave-room-dialog')).toBeInTheDocument();
    });

    it('shows participants panel when state is open', () => {
        (useRoomStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            screenShareStream: null,
            raisingHandParticipants: new Set(),
            participants: new Map([['user-1', { id: 'user-1', name: 'User 1' }]]),
            unmutedParticipants: new Set(),
            cameraOnParticipants: new Set(),
            sharingScreenParticipants: new Set(),
            isParticipantsPanelOpen: true, // Target
            isSettingsPanelOpen: false,
            pinnedParticipantId: null,
            gridLayout: 'grid',
            toggleSettingsPanel: mockToggleSettingsPanel,
            setGridLayout: mockSetGridLayout,
            pinParticipant: mockPinParticipant,
            currentUserId: 'user-1',
        });

        render(<ActiveRoom permissionsGranted={true} refreshDevices={mockRefreshDevices} />);
        expect(screen.getByTestId('participants-panel')).toBeInTheDocument();
    });

    it('shows chat panel when state is open', () => {
        (useChat as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ isChatPanelOpen: true });

        render(<ActiveRoom permissionsGranted={true} refreshDevices={mockRefreshDevices} />);
        expect(screen.getByTestId('chat-panel')).toBeInTheDocument();
    });

    it('shows settings panel when state is open', () => {
        (useRoomStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            screenShareStream: null,
            raisingHandParticipants: new Set(),
            participants: new Map(),
            unmutedParticipants: new Set(),
            cameraOnParticipants: new Set(),
            sharingScreenParticipants: new Set(),
            isParticipantsPanelOpen: false,
            isSettingsPanelOpen: true, // Target
            pinnedParticipantId: null,
            gridLayout: 'grid',
            toggleSettingsPanel: mockToggleSettingsPanel,
            setGridLayout: mockSetGridLayout,
            pinParticipant: mockPinParticipant,
            currentUserId: 'user-1',
        });

        render(<ActiveRoom permissionsGranted={true} refreshDevices={mockRefreshDevices} />);
        expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
    });
});
