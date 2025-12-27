import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createChatSlice } from '@/store/slices/chatSlice';
import { type RoomStoreState } from '@/store/types';

describe('chatSlice', () => {
    let mockGet: () => Partial<RoomStoreState>;
    let mockSet: (fn: (state: Partial<RoomStoreState>) => Partial<RoomStoreState>) => void;
    let slice: ReturnType<typeof createChatSlice>;
    let currentState: Partial<RoomStoreState>;

    const mockWsClient = {
        send: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        onMessage: vi.fn(),
    };

    beforeEach(() => {
        currentState = {
            messages: [],
            unreadCount: 0,
            isChatPanelOpen: false,
            wsClient: mockWsClient as any,
        };

        mockGet = () => currentState;
        mockSet = (param) => {
            const updates = typeof param === 'function' ? param(currentState) : param;
            currentState = { ...currentState, ...updates };
        };

        slice = createChatSlice(mockSet as any, mockGet as any, {} as any);
        mockWsClient.send.mockClear();
    });

    describe('Initial state', () => {
        it('should have correct initial state', () => {
            expect(slice.messages).toEqual([]);
            expect(slice.unreadCount).toBe(0);
            expect(slice.isChatPanelOpen).toBe(false);
        });
    });

    describe('sendMessage', () => {
        it('should send a text message through WebSocket', () => {
            slice.sendMessage('Hello World', 'text');

            expect(mockWsClient.send).toHaveBeenCalledWith({
                chat: {
                    content: 'Hello World',
                    targetId: '',
                }
            });
        });

        it('should send a private message with targetId', () => {
            slice.sendMessage('Private message', 'private', 'user-123');

            expect(mockWsClient.send).toHaveBeenCalledWith({
                chat: {
                    content: 'Private message',
                    targetId: 'user-123',
                }
            });
        });

        it('should not send message if wsClient is not available', () => {
            currentState.wsClient = null;

            slice.sendMessage('Hello World', 'text');

            expect(mockWsClient.send).not.toHaveBeenCalled();
        });
    });

    describe('addMessage', () => {
        it('should add a message to the messages array', () => {
            const newMessage = {
                id: '1',
                participantId: 'user-1',
                username: 'Alice',
                content: 'Hello',
                timestamp: new Date(),
                type: 'text' as const,
            };

            slice.addMessage(newMessage);

            expect(currentState.messages).toHaveLength(1);
            expect(currentState.messages?.[0]).toEqual(newMessage);
        });

        it('should increment unread count when chat panel is closed', () => {
            currentState.isChatPanelOpen = false;

            const newMessage = {
                id: '1',
                participantId: 'user-1',
                username: 'Alice',
                content: 'Hello',
                timestamp: new Date(),
                type: 'text' as const,
            };

            slice.addMessage(newMessage);

            expect(currentState.unreadCount).toBe(1);
        });

        it('should not increment unread count when chat panel is open', () => {
            currentState.isChatPanelOpen = true;

            const newMessage = {
                id: '1',
                participantId: 'user-1',
                username: 'Alice',
                content: 'Hello',
                timestamp: new Date(),
                type: 'text' as const,
            };

            slice.addMessage(newMessage);

            expect(currentState.unreadCount).toBe(0);
        });

        it('should add multiple messages in order', () => {
            const message1 = {
                id: '1',
                participantId: 'user-1',
                username: 'Alice',
                content: 'First',
                timestamp: new Date(),
                type: 'text' as const,
            };

            const message2 = {
                id: '2',
                participantId: 'user-2',
                username: 'Bob',
                content: 'Second',
                timestamp: new Date(),
                type: 'text' as const,
            };

            slice.addMessage(message1);
            slice.addMessage(message2);

            expect(currentState.messages).toHaveLength(2);
            expect(currentState.messages?.[0].content).toBe('First');
            expect(currentState.messages?.[1].content).toBe('Second');
        });
    });

    describe('markMessagesRead', () => {
        it('should reset unread count to zero', () => {
            currentState.unreadCount = 5;

            slice.markMessagesRead();

            expect(currentState.unreadCount).toBe(0);
        });
    });

    describe('toggleChatPanel', () => {
        it('should toggle chat panel from closed to open', () => {
            currentState.isChatPanelOpen = false;

            slice.toggleChatPanel();

            expect(currentState.isChatPanelOpen).toBe(true);
        });

        it('should toggle chat panel from open to closed', () => {
            currentState.isChatPanelOpen = true;

            slice.toggleChatPanel();

            expect(currentState.isChatPanelOpen).toBe(false);
        });

        it('should reset unread count when opening panel', () => {
            currentState.isChatPanelOpen = false;
            currentState.unreadCount = 3;

            slice.toggleChatPanel();

            expect(currentState.isChatPanelOpen).toBe(true);
            expect(currentState.unreadCount).toBe(0);
        });

        it('should maintain unread count when closing panel', () => {
            currentState.isChatPanelOpen = true;
            currentState.unreadCount = 3;

            slice.toggleChatPanel();

            expect(currentState.isChatPanelOpen).toBe(false);
            expect(currentState.unreadCount).toBe(3);
        });
    });

    describe('fetchHistory', () => {
        it('should send getRecentChats request through WebSocket', () => {
            slice.fetchHistory();

            expect(mockWsClient.send).toHaveBeenCalledWith({
                getRecentChats: {}
            });
        });

        it('should not fetch history if wsClient is not available', () => {
            currentState.wsClient = null;

            slice.fetchHistory();

            expect(mockWsClient.send).not.toHaveBeenCalled();
        });
    });
});
