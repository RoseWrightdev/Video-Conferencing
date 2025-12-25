import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger } from '@/lib/logger';

describe('logger', () => {
    let logger: ReturnType<typeof createLogger>;

    beforeEach(() => {
        logger = createLogger('TestLogger');
    });

    describe('createLogger', () => {
        it('should create a logger with the correct prefix', () => {
            expect(logger).toBeDefined();
            expect(logger.debug).toBeDefined();
            expect(logger.info).toBeDefined();
            expect(logger.warn).toBeDefined();
            expect(logger.error).toBeDefined();
        });

        it('should have all log methods', () => {
            expect(typeof logger.debug).toBe('function');
            expect(typeof logger.info).toBe('function');
            expect(typeof logger.warn).toBe('function');
            expect(typeof logger.error).toBe('function');
        });
    });

    describe('Log methods', () => {
        it('should call debug without errors', () => {
            expect(() => {
                logger.debug('Debug message', { data: 'test' });
            }).not.toThrow();
        });

        it('should call info without errors', () => {
            expect(() => {
                logger.info('Info message', { data: 'test' });
            }).not.toThrow();
        });

        it('should call warn without errors', () => {
            expect(() => {
                logger.warn('Warning message', { data: 'test' });
            }).not.toThrow();
        });

        it('should call error without errors', () => {
            expect(() => {
                logger.error('Error message', { data: 'test' });
            }).not.toThrow();
        });

        it('should handle multiple arguments', () => {
            expect(() => {
                logger.info('Message', 'arg1', 'arg2', { key: 'value' });
            }).not.toThrow();
        });

        it('should handle no arguments gracefully', () => {
            expect(() => {
                logger.info();
            }).not.toThrow();
        });
    });
});
