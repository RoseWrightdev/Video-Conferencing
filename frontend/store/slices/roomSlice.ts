import { StateCreator } from 'zustand';
import { RoomClient } from '@/lib/RoomClient';
import { type RoomSlice, type RoomStoreState } from '../types';

export const createRoomSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  RoomSlice
> = (set, get) => {

  // Create callback to sync state from RoomClient to Zustand
  const onRoomStateChange = (stateUpdate: any) => {
    // Direct merge for now
    set(stateUpdate);

    // Also update connection state if join was successful
    if (stateUpdate.isJoined) {
      get().updateConnectionState({ isInitializing: false, webrtcConnected: true });
    }
    if (stateUpdate.error) {
      get().handleError(stateUpdate.error);
      get().updateConnectionState({ isInitializing: false });
    }
  };

  const onMediaTrackAdded = (userId: string, stream: MediaStream) => {
    get().setParticipantStream(userId, stream);
    // Also update local tracks if it's us (redundant but safe)
    if (userId === get().currentUserId) {
      // Logic for local stream usually handled by mediaSlice, but this ensures consistency
    }
  };

  // Lazy initialization of RoomClient to avoid side effects during module load
  // But we need a persistent instance. We can store it in the closure or on the store.
  // Storing on the store (state.roomClient) is better for access.
  // However, types say `wsClient` and `sfuClient`. We need to update types or just use internal.
  // For this refactor, let's keep it simple and instantiate on first need or use a singleton pattern if appropriate.
  // Actually, standard pattern is to store the client instance in a ref or outside, but here we can put it in the store if we add it to the type.
  // The Type `RoomSlice` expects `wsClient` etc. We will break that contract if we aren't careful.
  // Plan: Modify `RoomSlice` type in next step. For now, we will store `roomClient` as `any` in the store or just closure.
  // Let's use a closure variable for the slice.

  const roomClient = new RoomClient(onRoomStateChange, onMediaTrackAdded);

  return {
    roomId: null,
    roomName: null,
    roomSettings: null,
    isJoined: false,
    isWaitingRoom: false,
    currentUserId: null,
    currentUsername: null,
    clientInfo: null,
    wsClient: null, // Legacy, will be null
    sfuClient: null, // Legacy, will be null
    roomClient: roomClient, // Exposed for other slices
    streamToUserMap: new Map(), // Legacy/Unused by Slice logic but kept for type compat

    initializeRoom: async (roomId, username, token) => {
      get().updateConnectionState({ isInitializing: true });

      // Reset state
      set({
        roomId,
        currentUsername: username,
        connectionState: { ...get().connectionState, isInitializing: true } // Ensure clean state
      });

      await roomClient.connect(roomId, username, token);

      // Patch Legacy Clients into Store
      set({
        wsClient: roomClient.ws,
        sfuClient: roomClient.sfu
      });
    },

    joinRoom: async () => {
      // Legacy
    },

    leaveRoom: () => {
      roomClient.disconnect();
      get().setLocalStream(null); // Cleanup media
      set({
        roomId: null,
        isJoined: false,
        isWaitingRoom: false,
        participants: new Map(),
        waitingParticipants: new Map(),
        messages: []
      });
    },

    updateRoomSettings: () => { },

    // Expose client for other slices (hacky but works for now without changing all types immediately)
    // We might need to add `roomClient` to the Store type to access `toggleAudio` etc properly.
    // For now, let's attach the actions that delegate to roomClient.
  };
};

/* 
   NOTE: Other slices (mediaSlice, etc) call `wsClient.send` directly. 
   We need to fix that or `roomClient` needs to expose `wsClient`.
   RoomClient exposes `ws` internally. We should probably expose it for compatibility 
   OR update MediaSlice to use RoomClient methods. 
   
   UPDATED PLAN: 
   1. `RoomClient` should expose `ws` publically or we wrap the methods.
   2. Current `RoomSlice` type has `wsClient` and `sfuClient`. 
   3. We can just set `state.wsClient = roomClient.ws` in initialization if we make them public.
   
   Let's modify `RoomClient.ts` to make `ws` public or at least accessible.
*/