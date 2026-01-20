import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('zustand') // to make it work like Jest (auto-mocking)

// Mock WebRTC APIs
Object.defineProperty(window, 'RTCPeerConnection', {
  writable: true,
  value: vi.fn(() => ({
    createOffer: vi.fn(() => Promise.resolve({})),
    createAnswer: vi.fn(() => Promise.resolve({})),
    setLocalDescription: vi.fn(() => Promise.resolve()),
    setRemoteDescription: vi.fn(() => Promise.resolve()),
    addIceCandidate: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onicecandidate: null,
    onconnectionstatechange: null,
  })),
})

Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: vi.fn(() => Promise.resolve({
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    })),
    getDisplayMedia: vi.fn(() => Promise.resolve({
      getTracks: () => [],
      getAudioTracks: () => [],
      getVideoTracks: () => [],
    })),
    enumerateDevices: vi.fn(() => Promise.resolve([])),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
})

// Mock WebSocket
globalThis.WebSocket = vi.fn(() => ({
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: 1, // OPEN
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
})) as any
