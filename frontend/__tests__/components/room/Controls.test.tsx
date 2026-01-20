import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ControlBar from '@/components/room/components/Controls';
import { useRoomStore } from '@/store/useRoomStore';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Crown: () => <span data-testid="icon-crown" />,
    Mic: () => <span data-testid="icon-mic" />,
    MicOff: () => <span data-testid="icon-mic-off" />,
    Video: () => <span data-testid="icon-video" />,
    VideoOff: () => <span data-testid="icon-video-off" />,
    ScreenShare: () => <span data-testid="icon-screenshare" />,
    ScreenShareOff: () => <span data-testid="icon-screenshare-off" />,
    PhoneOff: () => <span data-testid="icon-phone-off" />,
    MessageSquare: () => <span data-testid="icon-message-square" />,
    Users: () => <span data-testid="icon-users" />,
    Hand: () => <span data-testid="icon-hand" />,
    Settings: () => <span data-testid="icon-settings" />,
    Sparkles: () => <span data-testid="icon-sparkles" />,
    Captions: () => <span data-testid="icon-captions" />,
    CaptionsOff: () => <span data-testid="icon-captions-off" />,
    Globe: () => <span data-testid="icon-globe" />,
    AlertCircle: () => <span data-testid="icon-alert-circle" />,
    X: () => <span data-testid="icon-x" />,
    XIcon: () => <span data-testid="icon-x" />,
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
}));

// Mock store
const mockToggleAudio = vi.fn();
const mockToggleVideo = vi.fn();
const mockStartScreenShare = vi.fn();
const mockStopScreenShare = vi.fn();
const mockLeaveRoom = vi.fn();
const mockToggleHand = vi.fn();

vi.mock('@/store/useRoomStore', () => ({
    useRoomStore: vi.fn(() => ({
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        toggleAudio: mockToggleAudio,
        toggleVideo: mockToggleVideo,
        startScreenShare: mockStartScreenShare,
        stopScreenShare: mockStopScreenShare,
        isHost: false,
        setLeaveDialogOpen: vi.fn(),
        toggleParticipantsPanel: vi.fn(),
        toggleSettingsPanel: vi.fn(),
        toggleChatPanel: vi.fn(),
        unreadParticipantsCount: 0,
        unreadCount: 0,
        markMessagesRead: vi.fn(),
        leaveRoom: mockLeaveRoom,
        currentUserId: 'user-1',
        raisingHandParticipants: new Set(),
        toggleHand: mockToggleHand,
        generateSummary: vi.fn(),
        toggleSummaryModal: vi.fn(),
        isCaptionsEnabled: false,
        toggleCaptions: vi.fn(),
    })),
}));

// Mock subcomponents
vi.mock('./LanguageSelector', () => ({
    LanguageSelector: () => <div data-testid="language-selector" />
}));
vi.mock('./SummaryModal', () => ({
    SummaryModal: () => <div data-testid="summary-modal" />
}));

describe('ControlBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default store mock
        (useRoomStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            isAudioEnabled: true,
            isVideoEnabled: true,
            isScreenSharing: false,
            toggleAudio: mockToggleAudio,
            toggleVideo: mockToggleVideo,
            startScreenShare: mockStartScreenShare,
            stopScreenShare: mockStopScreenShare,
            isHost: false,
            setLeaveDialogOpen: vi.fn(),
            toggleParticipantsPanel: vi.fn(),
            toggleSettingsPanel: vi.fn(),
            toggleChatPanel: vi.fn(),
            unreadParticipantsCount: 0,
            unreadCount: 0,
            markMessagesRead: vi.fn(),
            leaveRoom: mockLeaveRoom,
            currentUserId: 'user-1',
            raisingHandParticipants: new Set(),
            toggleHand: mockToggleHand,
            generateSummary: vi.fn(),
            toggleSummaryModal: vi.fn(),
            isCaptionsEnabled: false,
            toggleCaptions: vi.fn(),
        });
    });

    it('renders all control buttons', () => {
        render(<ControlBar />);
        expect(screen.getByLabelText('Toggle microphone')).toBeInTheDocument();
        expect(screen.getByLabelText('Toggle camera')).toBeInTheDocument();
        expect(screen.getByLabelText('Toggle settings')).toBeInTheDocument();
        expect(screen.getByLabelText('Toggle participants')).toBeInTheDocument();
        expect(screen.getByLabelText('Toggle chat')).toBeInTheDocument();
        expect(screen.getByLabelText('Leave room')).toBeInTheDocument();
    });

    it('toggles audio on click', () => {
        render(<ControlBar />);
        const audioBtn = screen.getByLabelText('Toggle microphone');
        fireEvent.click(audioBtn);
        expect(mockToggleAudio).toHaveBeenCalled();
    });

    it('toggles video on click', () => {
        render(<ControlBar />);
        const videoBtn = screen.getByLabelText('Toggle camera');
        fireEvent.click(videoBtn);
        expect(mockToggleVideo).toHaveBeenCalled();
    });

    it('toggles hand raise', () => {
        render(<ControlBar />);
        const handBtn = screen.getByLabelText('Raise hand');
        fireEvent.click(handBtn);
        expect(mockToggleHand).toHaveBeenCalled();
    });
});
