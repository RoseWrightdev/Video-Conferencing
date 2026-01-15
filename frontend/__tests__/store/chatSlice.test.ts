import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createChatSlice } from '../../store/slices/chatSlice';
import { createStore } from 'zustand/vanilla';
import { RoomStoreState } from '../../store/types';

// Mock DOMPurify
vi.mock('dompurify', () => ({
    default: {
        sanitize: vi.fn((content) => {
            if (content.includes('script')) return 'hello';
            return content;
        }),
    },
}));

// Mock the store creation to isolate chatSlice
const createMockStore = () => {
    return createStore<RoomStoreState>((set, get, api) => {
        const chatSlice = createChatSlice(
            set as any,
            get as any,
            api as any
        );
        return {
            ...chatSlice,
            wsClient: {
                send: vi.fn(),
                connect: vi.fn(),
                disconnect: vi.fn(),
                onMessage: vi.fn(),
            },
        } as unknown as RoomStoreState;
    });
};

describe('chatSlice', () => {
    let useStore: ReturnType<typeof createMockStore>;

    beforeEach(() => {
        useStore = createMockStore();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Initial state', () => {
        it('should have correct initial state', () => {
            const state = useStore.getState();
            expect(state.messages).toEqual([]);
            expect(state.unreadCount).toBe(0);
            expect(state.isChatPanelOpen).toBe(false);
        });
    });

    describe('sendMessage', () => {
        it('should sanitize HTML from messages', () => {
            const { sendMessage, wsClient } = useStore.getState();
            sendMessage("<script>alert('xss')</script>hello", 'text');
            expect(wsClient?.send).toHaveBeenCalledWith(expect.objectContaining({
                chat: expect.objectContaining({
                    content: 'hello'
                })
            }));
        });

        it('should throttle message sending', async () => {
            const { sendMessage, wsClient } = useStore.getState();
            for (let i = 0; i < 5; i++) {
                sendMessage(`message ${i}`, 'text');
            }
            expect(wsClient?.send).toHaveBeenCalledTimes(1);
            // Wait for throttle window
            await new Promise(resolve => setTimeout(resolve, 600));
        });

        it('should send a text message through WebSocket', () => {
            const { sendMessage, wsClient } = useStore.getState();
            sendMessage('Hello World', 'text');
            expect(wsClient?.send).toHaveBeenCalledWith(expect.objectContaining({
                chat: expect.objectContaining({
                    content: 'Hello World',
                    targetId: '',
                })
            }));
        });

        it('should send a private message with targetId', () => {
            const { sendMessage, wsClient } = useStore.getState();

            // Note: targetId is 3rd arg in the slice implementation?
            // Checking restored file: slice.sendMessage('Private message', 'private', 'user-123');
            // Checking chatSlice.ts: sendMessage: (content, type = 'text', targetId) => ...
            sendMessage('Private message', 'private', 'user-123');

            expect(wsClient?.send).toHaveBeenCalledWith(expect.objectContaining({
                chat: expect.objectContaining({
                    content: 'Private message',
                    targetId: 'user-123',
                })
            }));
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

            useStore.getState().addMessage(newMessage);

            const state = useStore.getState();
            expect(state.messages).toHaveLength(1);
            expect(state.messages[0]).toEqual(newMessage);
        });

        it('should increment unread count when chat panel is closed', () => {
            // panel is closed by default
            const newMessage = {
                id: '1',
                participantId: 'user-1',
                username: 'Alice',
                content: 'Hello',
                timestamp: new Date(),
                type: 'text' as const,
            };

            useStore.getState().addMessage(newMessage);

            expect(useStore.getState().unreadCount).toBe(1);
        });

        it('should not increment unread count when chat panel is open', () => {
            useStore.setState({ isChatPanelOpen: true });

            const newMessage = {
                id: '1',
                participantId: 'user-1',
                username: 'Alice',
                content: 'Hello',
                timestamp: new Date(),
                type: 'text' as const,
            };

            useStore.getState().addMessage(newMessage);

            expect(useStore.getState().unreadCount).toBe(0);
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

            useStore.getState().addMessage(message1);
            useStore.getState().addMessage(message2);

            const state = useStore.getState();
            expect(state.messages).toHaveLength(2);
            expect(state.messages[0].content).toBe('First');
            expect(state.messages[1].content).toBe('Second');
        });
    });

    describe('markMessagesRead', () => {
        it('should reset unread count to zero', () => {
            useStore.setState({ unreadCount: 5 });
            useStore.getState().markMessagesRead();
            expect(useStore.getState().unreadCount).toBe(0);
        });
    });

    describe('toggleChatPanel', () => {
        it('should toggle chat panel from closed to open', () => {
            useStore.setState({ isChatPanelOpen: false });
            useStore.getState().toggleChatPanel();
            expect(useStore.getState().isChatPanelOpen).toBe(true);
        });

        it('should toggle chat panel from open to closed', () => {
            useStore.setState({ isChatPanelOpen: true });
            useStore.getState().toggleChatPanel();
            expect(useStore.getState().isChatPanelOpen).toBe(false);
        });

        it('should reset unread count when opening panel', () => {
            useStore.setState({ isChatPanelOpen: false, unreadCount: 3 });
            useStore.getState().toggleChatPanel();
            expect(useStore.getState().isChatPanelOpen).toBe(true);
            expect(useStore.getState().unreadCount).toBe(0);
        });

        it('should maintain unread count when closing panel', () => {
            useStore.setState({ isChatPanelOpen: true, unreadCount: 3 });
            useStore.getState().toggleChatPanel();
            expect(useStore.getState().isChatPanelOpen).toBe(false);
            expect(useStore.getState().unreadCount).toBe(3);
        });
    });

    describe('fetchHistory', () => {
        it('should send getRecentChats request through WebSocket', () => {
            useStore.getState().fetchHistory();
            const { wsClient } = useStore.getState();
            expect(wsClient?.send).toHaveBeenCalledWith({
                getRecentChats: {}
            });
        });

        it('should not fetch history if wsClient is not available', () => {
            const { wsClient } = useStore.getState();
            const spy = wsClient!.send;

            useStore.setState({ wsClient: null } as any);

            useStore.getState().fetchHistory();

            expect(spy).not.toHaveBeenCalled();
        });
    });
});
