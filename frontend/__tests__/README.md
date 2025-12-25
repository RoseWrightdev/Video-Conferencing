# Frontend Unit Tests

This directory contains comprehensive unit tests for the Video-Conferencing frontend application.

## Test Structure

```
__tests__/
├── hooks/              # Tests for custom React hooks
│   ├── useRoom.test.ts
│   ├── useChat.test.ts
│   ├── useMediaStream.test.ts
│   ├── useMediaControls.test.ts
│   └── useParticipants.test.ts
├── lib/                # Tests for utility libraries
│   ├── utils.test.ts
│   ├── websockets.test.ts
│   └── logger.test.ts
├── store/              # Tests for Zustand store slices
│   └── chatSlice.test.ts
└── events.test.ts      # Tests for event emitter
```

## Running Tests

### Run all unit tests
```bash
npm run test
```

### Run tests in watch mode
```bash
npm run test
```

### Run tests once (CI mode)
```bash
npm run test:run
```

### Run only unit tests (excluding Storybook tests)
```bash
npm run test:unit
```

### Run unit tests once
```bash
npm run test:unit:run
```

### Run with coverage
```bash
npx vitest run --coverage
```

## Test Coverage

The test suite covers:

### Hooks (5 test files)
- **useRoom** - Room initialization, auto-join, connection state
- **useChat** - Message sending, unread counts, panel toggling
- **useMediaStream** - Media initialization, device permissions, cleanup
- **useMediaControls** - Audio/video toggles, screen sharing, device switching
- **useParticipants** - Participant management, host actions, selection

### Libraries (3 test files)
- **utils** - Tailwind className merging utility
- **websockets** - WebSocket connection, message encoding/decoding
- **logger** - Logging utility functions

### Store (1 test file)
- **chatSlice** - Chat state management, message handling

### Events (1 test file)
- **EventEmitter** - Event subscription, emission, cleanup

## Test Framework

- **Test Runner**: [Vitest](https://vitest.dev/)
- **Testing Library**: [@testing-library/react](https://testing-library.com/react)
- **Environment**: jsdom (browser-like environment)
- **Coverage**: v8

## Mocking

The tests use Vitest's mocking capabilities to:
- Mock Zustand store (`useRoomStore`)
- Mock WebRTC APIs (RTCPeerConnection, getUserMedia)
- Mock WebSocket connections
- Mock protobuf message encoding/decoding

## Writing New Tests

When adding new tests:

1. Create test files adjacent to the code they test or in `__tests__/`
2. Use descriptive test names that explain the behavior
3. Follow the AAA pattern (Arrange, Act, Assert)
4. Mock external dependencies
5. Test both success and error cases
6. Aim for high coverage but prioritize meaningful tests

### Example Test Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { yourHook } from '@/hooks/yourHook';

describe('yourHook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Feature group', () => {
    it('should do something specific', () => {
      // Arrange
      const { result } = renderHook(() => yourHook());

      // Act
      act(() => {
        result.current.someFunction();
      });

      // Assert
      expect(result.current.someValue).toBe(expectedValue);
    });
  });
});
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (optimized for CI)
- No external dependencies
- Deterministic results
- Clear error messages

## Troubleshooting

### Tests not running
- Ensure dependencies are installed: `npm install`
- Check Node.js version (>=18)

### Import errors
- Verify path aliases in `tsconfig.json` and `vitest.config.mts`
- Check that `vite-tsconfig-paths` plugin is enabled

### Mock issues
- Clear mock state between tests with `vi.clearAllMocks()`
- Ensure mocks are defined before the test runs

## Future Improvements

- [ ] Add integration tests
- [ ] Add E2E tests with Playwright
- [ ] Increase coverage to >90%
- [ ] Add performance benchmarks
- [ ] Add visual regression tests with Storybook
