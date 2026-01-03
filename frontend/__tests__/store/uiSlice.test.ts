import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUISlice } from '../../store/slices/uiSlice';

describe('uiSlice', () => {
    let slice: ReturnType<typeof createUISlice>;
    let mockSet: any;
    let mockGet: any;
    let state: any;

    beforeEach(() => {
        state = {
            isSettingsPanelOpen: false,
            gridLayout: 'gallery',
            isPinned: false,
            pinnedParticipantId: null,
            isLeaveDialogOpen: false,
        };
        mockSet = vi.fn((fn) => {
            if (typeof fn === 'function') {
                const updates = fn(state);
                state = { ...state, ...updates };
            } else {
                state = { ...state, ...fn };
            }
        });
        mockGet = vi.fn(() => state);

        slice = createUISlice(mockSet, mockGet, {} as any);
    });

    it('should toggle settings panel', () => {
        expect(slice.isSettingsPanelOpen).toBe(false);
        slice.toggleSettingsPanel();
        expect(mockSet).toHaveBeenCalled();
        expect(state.isSettingsPanelOpen).toBe(true);

        slice.toggleSettingsPanel();
        expect(state.isSettingsPanelOpen).toBe(false);
    });

    it('should set grid layout', () => {
        slice.setGridLayout('speaker');
        expect(mockSet).toHaveBeenCalledWith({ gridLayout: 'speaker' });
    });

    it('should pin participant', () => {
        slice.pinParticipant('user1');
        expect(mockSet).toHaveBeenCalledWith({
            pinnedParticipantId: 'user1',
            isPinned: true,
        });

        slice.pinParticipant(null);
        expect(mockSet).toHaveBeenCalledWith({
            pinnedParticipantId: null,
            isPinned: false,
        });
    });

    it('should set leave dialog open', () => {
        slice.setLeaveDialogOpen(true);
        expect(mockSet).toHaveBeenCalledWith({ isLeaveDialogOpen: true });
    });
});
