import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SFUClient } from '../../lib/webrtc';
import { WebSocketClient } from '../../lib/websockets';

// Mock dependencies
vi.mock('../../lib/websockets');
vi.mock('../../lib/logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    })
}));

describe('SFUClient', () => {
    let client: SFUClient;
    let wsMock: any;
    let onTrackSpy: any;
    let pcMock: any;

    beforeEach(() => {
        // Setup WebSocket Mock
        wsMock = {
            send: vi.fn(),
            onMessage: vi.fn(),
        };
        (WebSocketClient as any).mockImplementation(() => wsMock);

        // Setup RTCPeerConnection Mock
        pcMock = {
            addTrack: vi.fn(),
            removeTrack: vi.fn(),
            createOffer: vi.fn().mockResolvedValue({ sdp: 'local-offer', type: 'offer' }),
            createAnswer: vi.fn().mockResolvedValue({ sdp: 'local-answer', type: 'answer' }),
            setLocalDescription: vi.fn().mockImplementation(async (desc) => {
                pcMock.localDescription = desc;
            }),
            setRemoteDescription: vi.fn().mockImplementation(async (desc) => {
                pcMock.remoteDescription = desc;
            }),
            addIceCandidate: vi.fn().mockResolvedValue(undefined),
            close: vi.fn(),
            getSenders: vi.fn().mockReturnValue([]),
            signalingState: 'stable',
            connectionState: 'new',
            iceConnectionState: 'new',
            iceGatheringState: 'complete',
            localDescription: null,
            remoteDescription: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        };

        global.RTCPeerConnection = vi.fn().mockImplementation(() => pcMock) as any;
        global.MediaStream = vi.fn().mockImplementation(() => ({
            id: 'stream-id',
            getTracks: () => [],
            active: true // for our other tests
        })) as any;

        onTrackSpy = vi.fn();
        client = new SFUClient(new WebSocketClient('url', 'token'), onTrackSpy);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize RTCPeerConnection', () => {
        expect(global.RTCPeerConnection).toHaveBeenCalledWith(expect.objectContaining({
            iceServers: expect.arrayContaining([{ urls: 'stun:stun.l.google.com:19302' }])
        }));
    });

    it('should handle incoming remote tracks', () => {
        const mockTrack = { kind: 'video', id: 'track-1' };
        const mockStream = { id: 'stream-1' };

        // Simulate ontrack event
        const event = {
            track: mockTrack,
            streams: [mockStream]
        };

        // Tricky: we need to access the callback assigned to pc.ontrack
        expect(pcMock.ontrack).toBeDefined();
        pcMock.ontrack(event);

        expect(onTrackSpy).toHaveBeenCalledWith(mockStream, mockTrack);
    });

    it('should send ice candidates via websocket', () => {
        const candidate = { candidate: 'candidate:123', sdpMid: '0', sdpMLineIndex: 0 };

        // Simulate ice candidate
        expect(pcMock.onicecandidate).toBeDefined();
        pcMock.onicecandidate({ candidate });

        expect(wsMock.send).toHaveBeenCalledWith({
            signal: {
                iceCandidate: JSON.stringify(candidate)
            }
        });
    });

    it('should handle negotiation needed (create offer)', async () => {
        // Trigger negotiation
        expect(pcMock.onnegotiationneeded).toBeDefined();

        await pcMock.onnegotiationneeded();

        expect(pcMock.createOffer).toHaveBeenCalled();
        expect(pcMock.setLocalDescription).toHaveBeenCalledWith({ sdp: 'local-offer', type: 'offer' });
        expect(wsMock.send).toHaveBeenCalledWith({
            signal: {
                sdpOffer: 'local-offer'
            }
        });
    });

    it('should wait for ice gathering if not complete', async () => {
        pcMock.iceGatheringState = 'gathering';
        let stateChangeCallback: any;
        pcMock.addEventListener.mockImplementation((event: string, cb: any) => {
            if (event === 'icegatheringstatechange') stateChangeCallback = cb;
        });

        // Trigger negotiation
        const promise = pcMock.onnegotiationneeded();

        // Should be waiting now...
        expect(pcMock.createOffer).toHaveBeenCalled();
        expect(wsMock.send).not.toHaveBeenCalled(); // Not sent yet

        // Simulate state change
        pcMock.iceGatheringState = 'complete';
        if (stateChangeCallback) stateChangeCallback();

        await promise;

        expect(wsMock.send).toHaveBeenCalled();
    });

    it('should handle incoming offer and send answer', async () => {
        // Simulate receiving offer via WebSocket
        const signalHandler = wsMock.onMessage.mock.calls[0][0];

        const offerSdp = 'remote-offer-sdp';
        await signalHandler({
            signalEvent: {
                sdpOffer: offerSdp
            }
        });

        expect(pcMock.setRemoteDescription).toHaveBeenCalledWith({ type: 'offer', sdp: offerSdp });
        expect(pcMock.createAnswer).toHaveBeenCalled();

        await vi.waitFor(() => {
            expect(pcMock.setLocalDescription).toHaveBeenCalledWith({ sdp: 'local-answer', type: 'answer' });
        });
        expect(wsMock.send).toHaveBeenCalledWith({
            signal: {
                sdpAnswer: 'local-answer'
            }
        });
    });

    it('should handle incoming ice candidates', async () => {
        const signalHandler = wsMock.onMessage.mock.calls[0][0];
        const candidate = { candidate: 'abc' };

        await signalHandler({
            signalEvent: {
                iceCandidate: JSON.stringify(candidate)
            }
        });

        expect(pcMock.addIceCandidate).toHaveBeenCalledWith(candidate);
    });

    it('should handle incoming answer', async () => {
        const signalHandler = wsMock.onMessage.mock.calls[0][0];
        const answerSdp = 'remote-answer-sdp';

        await signalHandler({
            signalEvent: {
                sdpAnswer: answerSdp
            }
        });

        expect(pcMock.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: answerSdp });
    });

    it('should add local track', async () => {
        const track = { kind: 'audio', id: 'local-track' } as any;
        const stream = { id: 'local-stream' } as any;

        await client.addTrack(track, stream);

        expect(pcMock.addTrack).toHaveBeenCalledWith(track, stream);
    });

    it('should replace track', () => {
        const oldTrack = { id: 'old-1' } as any;
        const newTrack = { id: 'new-1' } as any;
        const mockSender = { track: oldTrack, replaceTrack: vi.fn() };
        pcMock.getSenders.mockReturnValue([mockSender]);

        client.replaceTrack(oldTrack, newTrack);

        expect(mockSender.replaceTrack).toHaveBeenCalledWith(newTrack);
    });

    it('should close connection properly', () => {
        const mockSender = { track: { stop: vi.fn() } };
        pcMock.getSenders.mockReturnValue([mockSender]);

        client.close();

        expect(mockSender.track.stop).toHaveBeenCalled();
        expect(pcMock.close).toHaveBeenCalled();
    });
});
