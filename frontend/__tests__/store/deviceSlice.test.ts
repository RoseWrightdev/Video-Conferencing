import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeviceSlice } from '../../store/slices/deviceSlice';
import { RoomStoreState } from '../../store/types';

// Mock navigator.mediaDevices
const mockEnumerateDevices = vi.fn();
Object.defineProperty(global.navigator, 'mediaDevices', {
    value: {
        enumerateDevices: mockEnumerateDevices,
    },
    writable: true,
});

describe('deviceSlice', () => {
    let mockGet: () => Partial<RoomStoreState>;
    let mockSet: (fn: (state: Partial<RoomStoreState>) => Partial<RoomStoreState>) => void;
    let slice: ReturnType<typeof createDeviceSlice>;
    let currentState: Partial<RoomStoreState>;

    beforeEach(() => {
        vi.clearAllMocks();

        currentState = {
            availableDevices: { cameras: [], microphones: [], speakers: [] },
            selectedDevices: {},
            sfuClient: {}, // Mock presence
            handleError: vi.fn(),
        } as any;

        mockGet = () => currentState;
        mockSet = (param: any) => {
            const updates = typeof param === 'function' ? param(currentState) : param;
            currentState = { ...currentState, ...updates };
        };

        slice = createDeviceSlice(mockSet as any, mockGet as any, {} as any);
        currentState = { ...currentState, ...slice };
    });

    it('refreshDevices should update available devices', async () => {
        const mockDevices = [
            { kind: 'videoinput', deviceId: 'cam1', label: 'Camera 1' },
            { kind: 'audioinput', deviceId: 'mic1', label: 'Mic 1' },
            { kind: 'audiooutput', deviceId: 'spk1', label: 'Speaker 1' },
            { kind: 'videoinput', deviceId: 'cam2', label: 'Camera 2' },
        ];

        mockEnumerateDevices.mockResolvedValue(mockDevices);

        await slice.refreshDevices();

        expect(currentState.availableDevices?.cameras).toHaveLength(2);
        expect(currentState.availableDevices?.microphones).toHaveLength(1);
        expect(currentState.availableDevices?.speakers).toHaveLength(1);

        expect(currentState.availableDevices?.cameras[0].deviceId).toBe('cam1');
        expect(currentState.availableDevices?.cameras[1].deviceId).toBe('cam2');
        expect(currentState.availableDevices?.microphones[0].deviceId).toBe('mic1');
    });

    it('refreshDevices should handle errors', async () => {
        mockEnumerateDevices.mockRejectedValue(new Error('Permission denied'));

        await expect(slice.refreshDevices()).rejects.toThrow('Permission denied');
        expect(currentState.handleError).toHaveBeenCalled();
    });

    it('switchCamera should update selected camera', async () => {
        // Ensure sfuClient exists (mocked in beforeEach)
        await slice.switchCamera('cam2');
        expect(currentState.selectedDevices?.camera).toBe('cam2');
    });

    it('switchMicrophone should update selected microphone', async () => {
        await slice.switchMicrophone('mic2');
        expect(currentState.selectedDevices?.microphone).toBe('mic2');
    });
});
