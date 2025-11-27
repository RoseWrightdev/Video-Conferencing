import { StateCreator } from 'zustand';
import { type ConnectionSlice, type RoomStoreState } from '../types';

/**
 * Connection slice for tracking WebSocket and WebRTC connection states.
 * 
 * State:
 * - connectionState.wsConnected: WebSocket connection established
 * - connectionState.wsReconnecting: WebSocket attempting reconnect
 * - connectionState.webrtcConnected: WebRTC peer connections active
 * - connectionState.lastError: Most recent error message for display
 * 
 * Actions:
 * - updateConnectionState: Merge partial connection state updates
 * - handleError: Set error message for user notification
 * - clearError: Dismiss error message/toast
 * 
 * Connection Lifecycle:
 * 1. wsConnected: false, wsReconnecting: false (initial)
 * 2. wsConnected: true (WebSocket.onopen)
 * 3. wsReconnecting: true (abnormal close, retry attempts)
 * 4. webrtcConnected: true (first peer connection established)
 * 
 * Error Handling:
 * - Errors stored in lastError for toast/banner display
 * - Error messages from WebSocket, WebRTC, and getUserMedia failures
 * - clearError called on dismiss or after timeout
 * 
 * UI Integration:
 * - Connection indicator badges (green/yellow/red)
 * - Reconnecting spinner overlays
 * - Error toast notifications
 * - Debug panel for connection diagnostics
 * 
 * @see WebSocketClient.onConnectionChange For WebSocket state updates
 * @see RoomService.setupEventHandlers For error sources
 */
export const createConnectionSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  ConnectionSlice
> = (set) => ({
  connectionState: {
    wsConnected: false,
    wsReconnecting: false,
    webrtcConnected: false,
  },
  
  updateConnectionState: (updates) => {
    set((state) => ({
      connectionState: { ...state.connectionState, ...updates }
    }));
  },

  handleError: (error) => {
    set((state) => ({
      connectionState: { ...state.connectionState, lastError: error }
    }));
  },

  clearError: () => {
    set((state) => ({
      connectionState: { ...state.connectionState, lastError: undefined }
    }));
  },
});