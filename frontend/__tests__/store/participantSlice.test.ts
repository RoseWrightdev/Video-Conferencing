import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createParticipantSlice } from '@/store/slices/participantSlice';
import { type RoomStoreState, type Participant } from '@/store/types';

describe('participantSlice', () => {
    let mockGet: () => Partial<RoomStoreState>;
    let mockSet: (fn: (state: Partial<RoomStoreState>) => Partial<RoomStoreState>) => void;
    let slice: ReturnType<typeof createParticipantSlice>;
    let currentState: Partial<RoomStoreState>;

    const mockWsClient = {
        send: vi.fn(),
    };

    const mockRoomClient = {
        toggleHand: vi.fn(),
        transferOwnership: vi.fn(),
    };

    beforeEach(() => {
        currentState = {
            participants: new Map(),
            hosts: new Map(),
            waitingParticipants: new Map(),
            unmutedParticipants: new Set(),
            cameraOnParticipants: new Set(),
            sharingScreenParticipants: new Set(),
            raisingHandParticipants: new Set(),
            selectedParticipantId: null,
            isHost: false,
            wsClient: mockWsClient as any,
            roomClient: mockRoomClient as any,
            currentUserId: 'me',
        };

        mockGet = () => currentState;
        mockSet = (param) => {
            const updates = typeof param === 'function' ? param(currentState) : param;
            currentState = { ...currentState, ...updates };
        };

        slice = createParticipantSlice(mockSet as any, mockGet as any, {} as any);
        // Merge slice methods into currentState so get() calls work
        Object.assign(currentState, slice);
        mockWsClient.send.mockClear();
        mockRoomClient.toggleHand.mockClear();
    });

    describe('Initial state', () => {
        it('should initialize with empty maps and sets', () => {
            expect(slice.participants.size).toBe(0);
            expect(slice.raisingHandParticipants.size).toBe(0);
        });
    });

    describe('Participant Management', () => {
        const participant: Participant = {
            id: 'p1',
            username: 'User 1',
            role: 'participant',
            isAudioEnabled: false,
            isVideoEnabled: false,
            isScreenSharing: false,

        };

        it('should add participant', () => {
            slice.addParticipant(participant);
            expect(currentState.participants?.has('p1')).toBe(true);
            expect(currentState.participants?.get('p1')).toEqual(participant);
        });

        it('should update participant', () => {
            slice.addParticipant(participant);
            slice.updateParticipant('p1', { isAudioEnabled: true });
            expect(currentState.participants?.get('p1')?.isAudioEnabled).toBe(true);
        });

        it('should remove participant and cleanup state', () => {
            slice.addParticipant(participant);
            slice.setAudioEnabled('p1', true);
            slice.setHandRaised('p1', true);

            expect(currentState.participants?.has('p1')).toBe(true);
            expect(currentState.unmutedParticipants?.has('p1')).toBe(true);
            expect(currentState.raisingHandParticipants?.has('p1')).toBe(true);

            slice.removeParticipant('p1');

            expect(currentState.participants?.has('p1')).toBe(false);
            expect(currentState.unmutedParticipants?.has('p1')).toBe(false);
            expect(currentState.raisingHandParticipants?.has('p1')).toBe(false);
        });
    });

    describe('State Flags', () => {
        it('should toggle hand raised locally', () => {
            slice.setHandRaised('p1', true);
            expect(currentState.raisingHandParticipants?.has('p1')).toBe(true);
            slice.setHandRaised('p1', false);
            expect(currentState.raisingHandParticipants?.has('p1')).toBe(false);
        });

        it('should toggle audio flag', () => {
            slice.setAudioEnabled('p1', true);
            expect(currentState.unmutedParticipants?.has('p1')).toBe(true);
            slice.setAudioEnabled('p1', false);
            expect(currentState.unmutedParticipants?.has('p1')).toBe(false);
        });
    });

    describe('Actions (toggleHand)', () => {
        it('should call roomClient.toggleHand with correct value', async () => {
            // Initially not raised
            await slice.toggleHand();
            expect(mockRoomClient.toggleHand).toHaveBeenCalledWith(true);

            // Now set it as raised in state
            currentState.raisingHandParticipants?.add('me');
            await slice.toggleHand();
            expect(mockRoomClient.toggleHand).toHaveBeenCalledWith(false);
        });

        it('should not call toggleHand if roomClient is missing', async () => {
            currentState.roomClient = null;
            await slice.toggleHand();
            expect(mockRoomClient.toggleHand).not.toHaveBeenCalled();
        });
    });

    describe('Admin Actions', () => {
        it('should send approve action via wsClient', () => {
            const p1 = { id: 'p1', username: 'Waiting User' } as Participant;
            currentState.waitingParticipants?.set('p1', p1);

            slice.approveParticipant('p1');

            expect(mockWsClient.send).toHaveBeenCalledWith({
                adminAction: {
                    targetUserId: 'p1',
                    action: 'approve'
                }
            });
            // Should optimistically remove from waiting
            expect(currentState.waitingParticipants?.has('p1')).toBe(false);
        });

        it('should send kick action via wsClient', () => {
            slice.kickParticipant('p1');
            expect(mockWsClient.send).toHaveBeenCalledWith({
                adminAction: {
                    targetUserId: 'p1',
                    action: 'kick'
                }
            });
        });

        it('should send mute/unmute action', () => {
            // Currently muted (not in set) -> should unmute
            slice.toggleParticipantAudio('p1');
            expect(mockWsClient.send).toHaveBeenCalledWith({
                adminAction: {
                    targetUserId: 'p1',
                    action: 'unmute'
                }
            });

            mockWsClient.send.mockClear();

            // Currently unmuted (in set) -> should mute
            currentState.unmutedParticipants?.add('p1');
            slice.toggleParticipantAudio('p1');
            expect(mockWsClient.send).toHaveBeenCalledWith({
                adminAction: {
                    targetUserId: 'p1',
                    action: 'mute'
                }
            });
        });

        it('should call roomClient.transferOwnership', () => {
            slice.transferOwnership('p2');
            expect(mockRoomClient.transferOwnership).toHaveBeenCalledWith('p2');
        });
    });
});
