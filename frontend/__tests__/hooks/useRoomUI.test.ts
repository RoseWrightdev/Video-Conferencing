import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoomUI } from '../../hooks/useRoomUI';
import { useRoomStore } from '../../store/useRoomStore';

// Mock dependencies
vi.mock('../../store/useRoomStore', () => ({
    useRoomStore: vi.fn()
}));

describe('useRoomUI', () => {
    let mockStore: any;

    beforeEach(() => {
        mockStore = {
            gridLayout: 'grid',
            isChatPanelOpen: false,
            isParticipantsPanelOpen: false,
            pinnedParticipantId: null,
            selectedParticipantId: null,
            setGridLayout: vi.fn(),
            toggleChatPanel: vi.fn(),
            toggleParticipantsPanel: vi.fn(),
            pinParticipant: vi.fn(),
            selectParticipant: vi.fn(),
        };
        (useRoomStore as any).mockReturnValue(mockStore);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return current store state', () => {
        const { result } = renderHook(() => useRoomUI());

        expect(result.current.gridLayout).toBe('grid');
        expect(result.current.isChatPanelOpen).toBe(false);
    });

    it('should handle local device menu state', () => {
        const { result } = renderHook(() => useRoomUI());

        expect(result.current.isDeviceMenuOpen).toBe(false);

        act(() => {
            result.current.setIsDeviceMenuOpen(true);
        });

        expect(result.current.isDeviceMenuOpen).toBe(true);
    });

    it('should unpin participant', () => {
        const { result } = renderHook(() => useRoomUI());

        act(() => {
            result.current.unpinParticipant();
        });

        expect(mockStore.pinParticipant).toHaveBeenCalledWith(null);
    });
});
