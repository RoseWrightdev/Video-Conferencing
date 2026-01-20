import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomClient } from '../../lib/RoomClient';
import { WebSocketClient } from '../../lib/websockets';
import { SFUClient } from '../../lib/webrtc';

// Mocks
vi.mock('../../lib/websockets');
vi.mock('../../lib/webrtc');
vi.mock('../../lib/logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })
}));

// Global mocks
global.MediaStream = class {
    private tracks: any[] = [];
    public id: string;

    constructor(tracks?: any[]) {
        this.id = 'mock-stream-' + Math.random();
        if (tracks) this.tracks = tracks;
    }

    getTracks() { return this.tracks; }
    addTrack(track: any) { this.tracks.push(track); }
    // Add other methods if needed
} as any;

describe('RoomClient', () => {
    let client: RoomClient;
    let onStateChange: any;
    let onMediaTrackAdded: any;
    let wsMock: any;
    let sfuMock: any;

    beforeEach(() => {
        vi.clearAllMocks();
        onStateChange = vi.fn();
        onMediaTrackAdded = vi.fn();

        // Reset mocks
        wsMock = {
            onMessage: vi.fn(),
            connect: vi.fn().mockResolvedValue(undefined),
            send: vi.fn(),
            disconnect: vi.fn(),
        };
        (WebSocketClient as any).mockImplementation(() => wsMock);

        sfuMock = {
            close: vi.fn(),
        };
        (SFUClient as any).mockImplementation(() => sfuMock);

        client = new RoomClient(onStateChange, onMediaTrackAdded);
    });

    it('should connect and send join request', async () => {
        await client.connect('room1', 'user1', 'token1');

        expect(WebSocketClient).toHaveBeenCalledWith(expect.stringContaining('room1'), 'token1');
        expect(wsMock.connect).toHaveBeenCalled();
        expect(wsMock.send).toHaveBeenCalledWith(expect.objectContaining({
            join: {
                roomId: 'room1',
                displayName: 'user1',
                // targetLanguage: 'en', // Added by default? No, only if passed? Connect doesn't take it?
                // Wait, connect takes (roomId, username, token, targetLanguage?)
                // Looking at RoomClient.ts: connect(roomId: string, username: string, token: string, targetLanguage: string = 'en')
                targetLanguage: 'en',
                token: 'token1'
            }
        }));
    });

    it('should handle trackAdded before roomState (Race Condition)', async () => {
        await client.connect('room1', 'user1', 'token1');

        // simulate message callback
        const messageHandler = wsMock.onMessage.mock.calls[0][0];

        // 1. Receive Track Added FIRST
        const streamId = 'stream-123';
        const userId = 'user-2';
        messageHandler({
            trackAdded: {
                userId,
                streamId,
                trackKind: 'video'
            }
        });

        // 2. Receive Real Track from SFU (simulated)
        // Access the SFU callback passed to constructor
        const sfuCallback = (SFUClient as any).mock.calls[0][1];
        const mockStream = {
            id: streamId,
            active: true,
            getTracks: () => [{ id: 'track-1', kind: 'video' }]
        };
        const mockTrack = { id: 'track-1', kind: 'video' };

        sfuCallback(mockStream, mockTrack);

        // Expect onMedia to be called because we have the mapping
        expect(onMediaTrackAdded).toHaveBeenCalledWith(userId, expect.anything());

        // 3. Receive Room State SECOND
        messageHandler({
            roomState: {
                participants: [{
                    id: userId,
                    displayName: 'User 2',
                    isHost: false
                }],
                waitingUsers: []
            }
        });

        // Verify state update contains the stream
        expect(onStateChange).toHaveBeenCalled();
        const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0];
        const p = lastCall.participants.get(userId);
        expect(p.stream).toBeDefined();
        // The participant object in the state update should have the stream attached, and tracks added
        expect(p.stream.getTracks().length).toBeGreaterThan(0);
        expect(p.stream.getTracks()[0].id).toBe('track-1');
    });

    it('should handle roomState then trackAdded', async () => {
        await client.connect('room1', 'user1', 'token1');
        const messageHandler = wsMock.onMessage.mock.calls[0][0];

        const userId = 'user-2';
        const streamId = 'stream-123';

        // 1. Room State
        messageHandler({
            roomState: {
                participants: [{
                    id: userId,
                    displayName: 'User 2',
                    isHost: false
                }],
                waitingUsers: []
            }
        });

        // 2. Track Added
        messageHandler({
            trackAdded: {
                userId,
                streamId,
                trackKind: 'video'
            }
        });

        // 3. Real SFU Track
        const sfuCallback = (SFUClient as any).mock.calls[0][1];
        const mockStream = {
            id: streamId,
            getTracks: () => [{ id: 'track-1', kind: 'video' }],
            getVideoTracks: () => [{ id: 'track-1', kind: 'video' }]
        };
        const mockTrack = { id: 'track-1', kind: 'video' };

        // Should trigger pending resolution logic (if we implemented "pending" for unknown streams)
        // In our implementation, handleRemoteTrack handles 'unknown user' by putting in pendingStreams
        // handleTrackAdded checks pendingStreams.

        // Let's say SFU track arrives BEFORE trackAdded mapping
        sfuCallback(mockStream, mockTrack); // Unknown user at this point

        // Now trackAdded arrives (done above, let's reverse order for this test logic to match "pending" flow)
        // But here we did trackAdded first? 
        // Logic: 
        // If trackAdded comes first -> map is set. SFU track comes -> found in map -> assigned.
        // If SFU track comes first -> map empty -> pending. TrackAdded comes -> found in pending -> assigned.

        // This test case: RoomState -> TrackAdded -> SFU Track
        // RoomState adds participant (no stream).
        // TrackAdded updates map.
        // SFU Track sees map -> assigns.

        expect(onMediaTrackAdded).toHaveBeenCalledWith(userId, expect.anything());
    });
    it('should handle chat events', async () => {
        await client.connect('room1', 'user1', 'token1');
        const messageHandler = wsMock.onMessage.mock.calls[0][0];

        const chatEvent = {
            id: 'msg-1',
            senderId: 'user-2',
            senderName: 'User 2',
            content: 'Hello World',
            timestamp: Date.now(),
            isPrivate: false
        };

        messageHandler({
            chatEvent
        });

        expect(onStateChange).toHaveBeenCalled();
        const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0];
        expect(lastCall.messages).toHaveLength(1);
        expect(lastCall.messages[0].content).toBe('Hello World');
        expect(lastCall.messages[0].type).toBe('text');
    });

    it('should handle admin events: room_closed', async () => {
        await client.connect('room1', 'user1', 'token1');
        const messageHandler = wsMock.onMessage.mock.calls[0][0];

        messageHandler({
            adminEvent: {
                action: 'room_closed',
                reason: 'Host left'
            }
        });

        expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({
            error: 'The room has been closed by the host.'
        }));
        expect(wsMock.disconnect).toHaveBeenCalled();
    });

    it('should handle admin events: ownership_transferred', async () => {
        await client.connect('room1', 'user1', 'token1');
        const messageHandler = wsMock.onMessage.mock.calls[0][0];

        // This event doesn't trigger onStateChange directly with data (it waits for roomState)
        // but we can check if it logs or doesn't crash.
        // Actually, we added a log in RoomClient.ts
        messageHandler({
            adminEvent: {
                action: 'ownership_transferred',
                reason: 'user-2'
            }
        });

        // No direct state change expected from our current implementation of ownership_transferred handler
        // beyond the logger info.
        expect(onStateChange).not.toHaveBeenCalled();
    });
});
