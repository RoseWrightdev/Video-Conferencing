import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocketClient } from '@/lib/websockets';
import { WebSocketMessage } from '@/types/proto/signaling';

describe('WebSocketClient', () => {
    let client: WebSocketClient;
    const mockUrl = 'ws://localhost:8080/test';
    const mockToken = 'test-token-123';

    beforeEach(() => {
        vi.clearAllMocks();
        // Ensure constants are available on the global mock
        (globalThis.WebSocket as any).OPEN = 1;
        (globalThis.WebSocket as any).CONNECTING = 0;
        client = new WebSocketClient(mockUrl, mockToken);
    });

    describe('Constructor', () => {
        it('should create a WebSocketClient instance', () => {
            expect(client).toBeInstanceOf(WebSocketClient);
        });

        it('should not connect automatically', () => {
            expect(globalThis.WebSocket).not.toHaveBeenCalled();
        });
    });

    describe('connect', () => {
        it('should create WebSocket with token in URL', async () => {
            const connectPromise = client.connect();

            // Verify WebSocket was created with correct URL
            // Verify WebSocket was created with correct URL and protocols
            expect(globalThis.WebSocket).toHaveBeenCalledWith(
                mockUrl,
                ['access_token', mockToken]
            );

            // Simulate WebSocket open event
            const wsInstance = (globalThis.WebSocket as any).mock.results[0].value;
            wsInstance.onopen();

            await connectPromise;
        });

        it('should set binaryType to arraybuffer', async () => {
            const connectPromise = client.connect();

            const wsInstance = (globalThis.WebSocket as any).mock.results[0].value;
            wsInstance.onopen();

            await connectPromise;

            expect(wsInstance.binaryType).toBe('arraybuffer');
        });

        it('should resolve on successful connection', async () => {
            const connectPromise = client.connect();

            const wsInstance = (globalThis.WebSocket as any).mock.results[0].value;
            wsInstance.onopen();

            await expect(connectPromise).resolves.toBeUndefined();
        });

        it('should reject on connection error', async () => {
            const connectPromise = client.connect();

            const wsInstance = (globalThis.WebSocket as any).mock.results[0].value;
            const error = new Error('Connection failed');
            wsInstance.onerror(error);

            await expect(connectPromise).rejects.toEqual(error);
        });
    });

    describe('onMessage', () => {
        it('should register message handlers', async () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            client.onMessage(handler1);
            client.onMessage(handler2);

            const connectPromise = client.connect();
            const wsInstance = (globalThis.WebSocket as any).mock.results[0].value;
            wsInstance.onopen();
            await connectPromise;

            // Simulate receiving a message
            const mockMessage = WebSocketMessage.encode({
                join: { token: 'test', roomId: 'room-1', displayName: 'Test User' }
            }).finish();

            wsInstance.onmessage({ data: mockMessage.buffer });

            expect(handler1).toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
        });

        it('should handle message decoding errors gracefully', async () => {
            const handler = vi.fn();
            client.onMessage(handler);

            const connectPromise = client.connect();
            const wsInstance = (globalThis.WebSocket as any).mock.results[0].value;
            wsInstance.onopen();
            await connectPromise;

            // Send invalid data (garbage bytes that should fail protobuf decoding)
            // Note: Empty buffer is valid empty message, so we send garbage key/tag
            wsInstance.onmessage({ data: new Uint8Array([255, 255, 255]).buffer });

            // Handler should not be called if decoding fails
            // The error should be logged but not thrown
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('send', () => {
        it('should send encoded protobuf messages when connected', async () => {
            const connectPromise = client.connect();
            const wsInstance = (globalThis.WebSocket as any).mock.results[0].value;

            // Mock readyState as OPEN
            Object.defineProperty(wsInstance, 'readyState', {
                value: WebSocket.OPEN,
                writable: true,
            });

            wsInstance.onopen();
            await connectPromise;

            const message: WebSocketMessage = {
                chatEvent: {
                    id: '1',
                    senderId: 'user-1',
                    senderName: 'Test',
                    content: 'Hello',
                    timestamp: Number(Date.now()),
                    isPrivate: false,
                }
            };

            client.send(message);

            expect(wsInstance.send).toHaveBeenCalled();

            // Verify the sent data is a Uint8Array (encoded protobuf)
            const sentData = wsInstance.send.mock.calls[0][0];
            expect(sentData).toBeInstanceOf(Uint8Array);
        });

        it('should not send messages when socket is not open', async () => {
            const connectPromise = client.connect();
            const wsInstance = (globalThis.WebSocket as any).mock.results[0].value;

            // Mock readyState as CONNECTING
            Object.defineProperty(wsInstance, 'readyState', {
                value: WebSocket.CONNECTING,
                writable: true,
            });

            wsInstance.onopen();
            await connectPromise;

            const message: WebSocketMessage = {
                chatEvent: {
                    id: '1',
                    senderId: 'user-1',
                    senderName: 'Test',
                    content: 'Hello',
                    timestamp: Number(Date.now()),
                    isPrivate: false,
                }
            };

            // Change readyState to CONNECTING to simulate not ready
            // The mock in vitest.setup.ts returns a plain object, so we can just assign property
            wsInstance.readyState = WebSocket.CONNECTING;

            client.send(message);

            expect(wsInstance.send).not.toHaveBeenCalled();
        });
    });

    describe('disconnect', () => {
        it('should close the WebSocket connection', async () => {
            const connectPromise = client.connect();
            const wsInstance = (globalThis.WebSocket as any).mock.results[0].value;
            wsInstance.onopen();
            await connectPromise;

            client.disconnect();

            expect(wsInstance.close).toHaveBeenCalled();
        });

        it('should handle disconnect when not connected', () => {
            // Should not throw error
            expect(() => client.disconnect()).not.toThrow();
        });
    });
});
