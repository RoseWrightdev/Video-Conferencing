import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConnectionSlice } from '../../store/slices/connectionSlice';

describe('connectionSlice', () => {
    let slice: ReturnType<typeof createConnectionSlice>;
    let mockSet: any;
    let mockGet: any;
    let state: any;

    beforeEach(() => {
        state = {
            connectionState: {
                wsConnected: false,
                wsReconnecting: false,
                webrtcConnected: false,
                isInitializing: false,
            }
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

        slice = createConnectionSlice(mockSet, mockGet, {} as any);
    });

    it('should update connection state', () => {
        slice.updateConnectionState({ wsConnected: true });

        expect(mockSet).toHaveBeenCalled();
        expect(state.connectionState.wsConnected).toBe(true);
        expect(state.connectionState.isInitializing).toBe(false);

        slice.updateConnectionState({ webrtcConnected: true });
        expect(state.connectionState.webrtcConnected).toBe(true);
        expect(state.connectionState.wsConnected).toBe(true); // Should preserve other state
    });

    it('should handle error', () => {
        const error = new Error('Test Error');
        slice.handleError(error.message);
        expect(state.connectionState.lastError).toBe(error.message);
    });

    it('should clear error', () => {
        const error = 'Test Error';
        state.connectionState.lastError = error;

        slice.clearError();
        expect(state.connectionState.lastError).toBeUndefined();
    });
});
