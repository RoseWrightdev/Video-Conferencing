import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

const ThrowError = () => {
    throw new Error('Test error');
};

describe('ErrorBoundary', () => {
    it('catches error and displays fallback UI', () => {
        // Prevent console.error from cluttering the test output
        const spy = vi.spyOn(console, 'error');
        spy.mockImplementation(() => { });

        render(
            <ErrorBoundary>
                <ThrowError />
            </ErrorBoundary>
        );

        expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

        spy.mockRestore();
    });
});
