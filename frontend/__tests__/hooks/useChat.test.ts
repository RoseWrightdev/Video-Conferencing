import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from '@/hooks/useChat';
import { useRoomStore } from '@/store/useRoomStore';

// Mock the store
vi.mock('@/store/useRoomStore');

// Mock the store
vi.mock('@/store/useRoomStore', () => ({
    useRoomStore: vi.fn()
}));

describe('useChat', () => {
    const mockSendMessage = vi.fn();
    const mockMarkMessagesRead = vi.fn();
    const mockToggleChatPanel = vi.fn();

    const mockMessages = [
        {
            id: '1',
            participantId: 'user-1',
            username: 'Alice',
            content: 'Hello',
            timestamp: new Date(),
            type: 'text' as const,
        },
        {
            id: '2',
            participantId: 'user-2',
            username: 'Bob',
            content: 'Hi there',
            timestamp: new Date(),
            type: 'text' as const,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();

        (useRoomStore as any).mockReturnValue({
            messages: mockMessages,
            unreadCount: 2,
            isChatPanelOpen: false,
            sendMessage: mockSendMessage,
            markMessagesRead: mockMarkMessagesRead,
            toggleChatPanel: mockToggleChatPanel,
        });
    });

    describe('Basic functionality', () => {
        it('should return messages from store', () => {
            const { result } = renderHook(() => useChat());

            expect(result.current.messages).toEqual(mockMessages);
            expect(result.current.messages).toHaveLength(2);
        });

        it('should return unread count', () => {
            const { result } = renderHook(() => useChat());

            expect(result.current.unreadCount).toBe(2);
            expect(result.current.hasUnreadMessages).toBe(true);
        });

        it('should return chat panel state', () => {
            const { result } = renderHook(() => useChat());

            expect(result.current.isChatPanelOpen).toBe(false);
        });

        it('should detect unread messages correctly', () => {
            const { result } = renderHook(() => useChat());

            expect(result.current.hasUnreadMessages).toBe(true);
        });

        it('should detect no unread messages when count is 0', () => {
            (useRoomStore as any).mockReturnValue({
                messages: mockMessages,
                unreadCount: 0,
                isChatPanelOpen: false,
                sendMessage: mockSendMessage,
                markMessagesRead: mockMarkMessagesRead,
                toggleChatPanel: mockToggleChatPanel,
            });

            const { result } = renderHook(() => useChat());

            expect(result.current.hasUnreadMessages).toBe(false);
        });
    });

    describe('sendTextMessage', () => {
        it('should send a text message', () => {
            const { result } = renderHook(() => useChat());

            act(() => {
                result.current.sendTextMessage('Hello World');
            });

            expect(mockSendMessage).toHaveBeenCalledWith('Hello World', 'text');
            expect(mockSendMessage).toHaveBeenCalledTimes(1);
        });
    });

    describe('sendPrivateMessage', () => {
        it('should send a private message with target ID', () => {
            const { result } = renderHook(() => useChat());

            act(() => {
                result.current.sendPrivateMessage('Private hello', 'user-123');
            });

            expect(mockSendMessage).toHaveBeenCalledWith('Private hello', 'private', 'user-123');
            expect(mockSendMessage).toHaveBeenCalledTimes(1);
        });
    });

    describe('openChat', () => {
        it('should toggle chat panel if closed and mark messages as read', () => {
            const { result } = renderHook(() => useChat());

            act(() => {
                result.current.openChat();
            });

            expect(mockToggleChatPanel).toHaveBeenCalledTimes(1);
            expect(mockMarkMessagesRead).toHaveBeenCalledTimes(1);
        });

        it('should only mark messages as read if panel is already open', () => {
            (useRoomStore as any).mockReturnValue({
                messages: mockMessages,
                unreadCount: 2,
                isChatPanelOpen: true,
                sendMessage: mockSendMessage,
                markMessagesRead: mockMarkMessagesRead,
                toggleChatPanel: mockToggleChatPanel,
            });

            const { result } = renderHook(() => useChat());

            act(() => {
                result.current.openChat();
            });

            expect(mockToggleChatPanel).not.toHaveBeenCalled();
            expect(mockMarkMessagesRead).toHaveBeenCalledTimes(1);
        });
    });

    describe('closeChat', () => {
        it('should toggle chat panel if open', () => {
            (useRoomStore as any).mockReturnValue({
                messages: mockMessages,
                unreadCount: 2,
                isChatPanelOpen: true,
                sendMessage: mockSendMessage,
                markMessagesRead: mockMarkMessagesRead,
                toggleChatPanel: mockToggleChatPanel,
            });

            const { result } = renderHook(() => useChat());

            act(() => {
                result.current.closeChat();
            });

            expect(mockToggleChatPanel).toHaveBeenCalledTimes(1);
        });

        it('should not toggle if panel is already closed', () => {
            const { result } = renderHook(() => useChat());

            act(() => {
                result.current.closeChat();
            });

            expect(mockToggleChatPanel).not.toHaveBeenCalled();
        });
    });

    describe('toggleChatPanel', () => {
        it('should expose toggleChatPanel function', () => {
            const { result } = renderHook(() => useChat());

            act(() => {
                result.current.toggleChatPanel();
            });

            expect(mockToggleChatPanel).toHaveBeenCalledTimes(1);
        });
    });

    describe('markMessagesRead', () => {
        it('should expose markMessagesRead function', () => {
            const { result } = renderHook(() => useChat());

            act(() => {
                result.current.markMessagesRead();
            });

            expect(mockMarkMessagesRead).toHaveBeenCalledTimes(1);
        });
    });
});
