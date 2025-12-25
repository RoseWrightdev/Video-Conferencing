import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from '@/events';

describe('EventEmitter', () => {
    let emitter: EventEmitter;

    beforeEach(() => {
        emitter = new EventEmitter();
    });

    describe('on', () => {
        it('should register event listeners', () => {
            const handler = vi.fn();

            emitter.on('test-event', handler);
            emitter.emit('test-event', 'data');

            expect(handler).toHaveBeenCalledWith('data');
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('should support multiple listeners for the same event', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            emitter.on('test-event', handler1);
            emitter.on('test-event', handler2);
            emitter.emit('test-event', 'data');

            expect(handler1).toHaveBeenCalledWith('data');
            expect(handler2).toHaveBeenCalledWith('data');
        });

        it('should handle different event types', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            emitter.on('event-1', handler1);
            emitter.on('event-2', handler2);

            emitter.emit('event-1', 'data1');
            emitter.emit('event-2', 'data2');

            expect(handler1).toHaveBeenCalledWith('data1');
            expect(handler2).toHaveBeenCalledWith('data2');
            expect(handler1).not.toHaveBeenCalledWith('data2');
        });
    });

    describe('off', () => {
        it('should remove a specific event listener', () => {
            const handler = vi.fn();

            emitter.on('test-event', handler);
            emitter.off('test-event', handler);
            emitter.emit('test-event', 'data');

            expect(handler).not.toHaveBeenCalled();
        });

        it('should only remove the specified handler', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            emitter.on('test-event', handler1);
            emitter.on('test-event', handler2);
            emitter.off('test-event', handler1);
            emitter.emit('test-event', 'data');

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).toHaveBeenCalledWith('data');
        });

        it('should handle removing non-existent handler gracefully', () => {
            const handler = vi.fn();

            expect(() => {
                emitter.off('test-event', handler);
            }).not.toThrow();
        });
    });

    describe('emit', () => {
        it('should emit events with data', () => {
            const handler = vi.fn();

            emitter.on('test-event', handler);
            emitter.emit('test-event', { key: 'value' });

            expect(handler).toHaveBeenCalledWith({ key: 'value' });
        });

        it('should emit events without data', () => {
            const handler = vi.fn();

            emitter.on('test-event', handler);
            emitter.emit('test-event');

            expect(handler).toHaveBeenCalledWith(undefined);
        });

        it('should not throw if no listeners are registered', () => {
            expect(() => {
                emitter.emit('non-existent-event', 'data');
            }).not.toThrow();
        });

        it('should call listeners in order of registration', () => {
            const callOrder: number[] = [];
            const handler1 = vi.fn(() => callOrder.push(1));
            const handler2 = vi.fn(() => callOrder.push(2));
            const handler3 = vi.fn(() => callOrder.push(3));

            emitter.on('test-event', handler1);
            emitter.on('test-event', handler2);
            emitter.on('test-event', handler3);
            emitter.emit('test-event');

            expect(callOrder).toEqual([1, 2, 3]);
        });
    });

    describe('once', () => {
        it('should register a one-time event listener', () => {
            const handler = vi.fn();

            emitter.once('test-event', handler);
            emitter.emit('test-event', 'first');
            emitter.emit('test-event', 'second');

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith('first');
        });

        it('should remove the listener after first call', () => {
            const handler = vi.fn();

            emitter.once('test-event', handler);
            emitter.emit('test-event', 'data');

            // Verify it was removed
            emitter.emit('test-event', 'data2');

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('removeAllListeners', () => {
        it('should remove all listeners for a specific event', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            emitter.on('test-event', handler1);
            emitter.on('test-event', handler2);
            emitter.removeAllListeners('test-event');
            emitter.emit('test-event', 'data');

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });

        it('should remove all listeners for all events if no event specified', () => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            emitter.on('event-1', handler1);
            emitter.on('event-2', handler2);
            emitter.removeAllListeners();

            emitter.emit('event-1', 'data1');
            emitter.emit('event-2', 'data2');

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });
    });

    describe('Error handling', () => {
        it('should handle errors in listeners gracefully', () => {
            const errorHandler = vi.fn(() => {
                throw new Error('Handler error');
            });
            const normalHandler = vi.fn();

            emitter.on('test-event', errorHandler);
            emitter.on('test-event', normalHandler);

            // Should not throw, but behavior depends on implementation
            // If the EventEmitter catches errors, normalHandler should still be called
            expect(() => {
                emitter.emit('test-event', 'data');
            }).not.toThrow();
        });
    });
});
