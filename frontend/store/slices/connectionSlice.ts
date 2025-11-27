import { StateCreator } from 'zustand';
import { type ConnectionSlice, type RoomStoreState } from '../types';

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