import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('utils', () => {
    describe('cn (className utility)', () => {
        it('should merge class names correctly', () => {
            const result = cn('foo', 'bar');
            expect(result).toContain('foo');
            expect(result).toContain('bar');
        });

        it('should handle conditional class names', () => {
            const condition = false;
            const result = cn('foo', condition && 'bar', 'baz');
            expect(result).toContain('foo');
            expect(result).toContain('baz');
            expect(result).not.toContain('bar');
        });

        it('should handle undefined and null values', () => {
            const result = cn('foo', undefined, null, 'bar');
            expect(result).toContain('foo');
            expect(result).toContain('bar');
        });

        it('should merge tailwind classes correctly (no duplicates)', () => {
            const result = cn('px-2 py-1', 'px-4');
            // twMerge should keep only px-4 (the latter one)
            expect(result).toContain('px-4');
            expect(result).toContain('py-1');
            expect(result).not.toContain('px-2');
        });

        it('should handle empty input', () => {
            const result = cn();
            expect(result).toBe('');
        });

        it('should handle array of classes', () => {
            const result = cn(['foo', 'bar']);
            expect(result).toContain('foo');
            expect(result).toContain('bar');
        });

        it('should handle object with boolean values', () => {
            const result = cn({
                foo: true,
                bar: false,
                baz: true,
            });
            expect(result).toContain('foo');
            expect(result).toContain('baz');
            expect(result).not.toContain('bar');
        });
    });
});
