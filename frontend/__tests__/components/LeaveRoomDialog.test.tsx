import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LeaveRoomDialog from '@/components/room/components/LeaveRoomDialog';
import { useRoomStore } from '@/store/useRoomStore';

// Mock dependencies
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

// Mock Zustand Store
const mockSetLeaveDialogOpen = vi.fn();
const mockLeaveRoom = vi.fn();
const mockTransferOwnership = vi.fn();

const defaultStore = {
    isLeaveDialogOpen: true,
    setLeaveDialogOpen: mockSetLeaveDialogOpen,
    isHost: false,
    leaveRoom: mockLeaveRoom,
    participants: new Map(),
    currentUserId: 'me',
    transferOwnership: mockTransferOwnership,
};

// Helper to mock store state
const mockStore = (overrides = {}) => {
    (useRoomStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: any) => {
        return selector({
            ...defaultStore,
            ...overrides,
        });
    });
};

vi.mock('@/store/useRoomStore', () => ({
    useRoomStore: vi.fn(),
}));

// Mock Select UI components because they are complex (Radix UI)
// Simplified mock to verify logic
/*
vi.mock('@/components/ui/select', () => ({
    Select: ({ children, onValueChange }: any) => <div data-testid="select-root"><select onChange={e => onValueChange(e.target.value)}>{children}</select></div>,
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: () => <div>Select Value</div>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));
*/
// Actually, rendering Radix might work with jsdom if configured, but let's try shallow or full render first.
// If problems arise, we mock. For now, let's assume standard testing-library can handle it or we use pointer events.
// Radix often needs pointer events polyfill or complex interaction. Let's mock for simplicity.
vi.mock('@/components/ui/select', () => ({
    Select: ({ onValueChange, children }: any) => (
        <div data-testid="mock-select" onClick={() => onValueChange('p2')}>
            Mock Select
            {children}
        </div>
    ),
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: () => <div>Select Value</div>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => <div data-value={value}>{children}</div>,
}));


describe('LeaveRoomDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockStore();
    });

    it('should render nothing if not open', () => {
        mockStore({ isLeaveDialogOpen: false });
        render(<LeaveRoomDialog />);
        expect(screen.queryByText('Leave Room?')).toBeNull();
    });

    it('should render participant view correctly', () => {
        mockStore({ isHost: false });
        render(<LeaveRoomDialog />);
        expect(screen.getByText('Leave Room?')).toBeDefined();
        expect(screen.getByText('Are you sure you want to leave the room?')).toBeDefined();
        expect(screen.getByText('Leave Room')).toBeDefined();
        expect(screen.queryByText('End Meeting for All')).toBeNull();
    });

    it('should call leaveRoom on leave click', () => {
        mockStore({ isHost: false });
        render(<LeaveRoomDialog />);
        fireEvent.click(screen.getByText('Leave Room'));
        expect(mockLeaveRoom).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/');
        expect(mockSetLeaveDialogOpen).toHaveBeenCalledWith(false);
    });

    it('should render host view without participants correctly', () => {
        mockStore({ isHost: true, participants: new Map([['me', { id: 'me' }]]) });
        render(<LeaveRoomDialog />);
        expect(screen.getByText('Do you want to leave the room, or end the meeting for everyone?')).toBeDefined();
        expect(screen.getByText('Leave (Ends meeting)')).toBeDefined();
        expect(screen.queryByText('End Meeting for All')).toBeNull();
        expect(screen.queryByText('Transfer Ownership (Optional)')).toBeNull();
    });

    it('should render host view with participants correctly', () => {
        const participants = new Map([
            ['me', { id: 'me', username: 'Host' }],
            ['p2', { id: 'p2', username: 'Participant 2' }],
        ]);
        mockStore({ isHost: true, participants });
        render(<LeaveRoomDialog />);

        expect(screen.getByText('You can transfer ownership to another participant before leaving, or end the meeting for everyone.')).toBeDefined();
        expect(screen.getByText('Transfer Ownership (Optional)')).toBeDefined();
    });

    it('should handle ownership transfer', () => {
        const participants = new Map([
            ['me', { id: 'me', username: 'Host' }],
            ['p2', { id: 'p2', username: 'Participant 2' }],
        ]);
        mockStore({ isHost: true, participants });
        render(<LeaveRoomDialog />);

        // Simulate selecting a user (using our mock click handler)
        fireEvent.click(screen.getByTestId('mock-select'));

        // Button should change text
        expect(screen.getByText('Transfer & Leave')).toBeDefined();

        // "End Meeting" should be disabled (checking via attribute or existence if we can't easily check disabled on mock button)
        // Radix/Shadcn button forwards props, so disabled should work.
        const endButton = screen.getByText('End Meeting for All').closest('button');
        expect(endButton).toBeDisabled();

        // Click Transfer & Leave
        fireEvent.click(screen.getByText('Transfer & Leave'));

        expect(mockTransferOwnership).toHaveBeenCalledWith('p2');
        expect(mockLeaveRoom).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/');
    });
});
