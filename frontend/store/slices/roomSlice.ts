import { StateCreator } from 'zustand';
import { RoomClient } from '@/lib/RoomClient';
import { type RoomSlice, type RoomStoreState } from '../types';

// Basic Singleton for HMR handling
let activeRoomClient: RoomClient | null = null;

export const createRoomSlice: StateCreator<
  RoomStoreState,
  [],
  [],
  RoomSlice
> = (set, get) => {

  // Create callback to sync state from RoomClient to Zustand
  const onRoomStateChange = (stateUpdate: any) => {
    // Current state access
    const currentState = get();

    // INTERCEPT: Calculate unread count for new messages
    if (stateUpdate.messages) {
      const oldLength = currentState.messages.length;
      const newLength = stateUpdate.messages.length;
      const addedCount = newLength - oldLength;

      if (addedCount > 0 && !currentState.isChatPanelOpen) {
        // We have new messages and panel is closed -> increment unread count
        // We accumulate on top of existing unreadCount (or stateUpdate.unreadCount if it exists, theoretically)
        stateUpdate.unreadCount = currentState.unreadCount + addedCount;
      } else if (currentState.isChatPanelOpen) {
        // If panel is open, ensure unread count stays 0
        stateUpdate.unreadCount = 0;
      }
    }

    // INTERCEPT: Calculate unread count for waiting and regular participants
    // AND Sync derived Sets (raisingHand, unmuted, etc.)
    // We must exclude the current user from triggers to avoid self-notification.
    if (stateUpdate.isInitialState) {
      // If this is the initial state load, we don't want to trigger notifications for existing users
      stateUpdate.unreadParticipantsCount = 0;
    } else {
      const myId = stateUpdate.currentUserId || currentState.currentUserId;
      let addedCount = 0;

      // 1. Check Waiting Participants (if updated)
      if (stateUpdate.waitingParticipants) {
        const currentWaiting = currentState.waitingParticipants;
        const newWaiting = stateUpdate.waitingParticipants as Map<string, any>;

        newWaiting.forEach((_, id) => {
          if (!currentWaiting.has(id) && id !== myId) {
            addedCount++;
          }
        });
      }

      // 2. Check Regular Participants (if updated)
      if (stateUpdate.participants) {
        const currentParticipants = currentState.participants;
        const newParticipants = stateUpdate.participants as Map<string, any>;

        // Calculate added count for notifications
        newParticipants.forEach((_, id) => {
          if (!currentParticipants.has(id) && id !== myId) {
            addedCount++;
          }
        });
      }

      if (addedCount > 0 && !currentState.isParticipantsPanelOpen) {
        const currentUnread = stateUpdate.unreadParticipantsCount ?? currentState.unreadParticipantsCount ?? 0;
        stateUpdate.unreadParticipantsCount = currentUnread + addedCount;
      }
    }

    // Direct merge for now
    set(stateUpdate);

    // Also update connection state if join was successful or placed in waiting room
    if (stateUpdate.isJoined) {
      get().updateConnectionState({ isInitializing: false, webrtcConnected: true });
    }
    if (stateUpdate.isWaitingRoom) {
      get().updateConnectionState({ isInitializing: false });
    }
    if (stateUpdate.error) {
      get().handleError(stateUpdate.error);
      get().updateConnectionState({ isInitializing: false });
    }
  };

  const onMediaTrackAdded = (userId: string, stream: MediaStream) => {
    // Redundant: RoomClient's onStateChange will propagate the participant with the stream attached.
    // Keeping this callback as it's required by RoomClient constructor, but no store action needed.
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

  // FIX: Track the active client instance at module level to prevent HMR leaks.
  if (activeRoomClient) {
    console.warn('[RoomSlice] Disconnecting previous RoomClient instance due to store recreation/HMR');
    activeRoomClient.disconnect();
  }

  const roomClient = new RoomClient(onRoomStateChange, onMediaTrackAdded);
  activeRoomClient = roomClient;

  // Ensure cleanup on HMR disposal
  if ((import.meta as any).hot) {
    (import.meta as any).hot.dispose(() => {
      if (activeRoomClient) {
        console.warn('[RoomSlice] HMR Dispose: Disconnecting RoomClient');
        activeRoomClient.disconnect();
        activeRoomClient = null;
      }
    });
  }

  return {
    roomId: null,
    roomName: null,
    roomSettings: null,
    isJoined: false,
    isWaitingRoom: false,
    isKicked: false,
    currentUserId: null,
    currentUsername: null,
    clientInfo: null,
    wsClient: null, // Legacy, will be null
    sfuClient: null, // Legacy, will be null
    roomClient: roomClient, // Exposed for other slices

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
        messages: [],
        isKicked: false,
      });
      // Ensure connection state is reset
      get().updateConnectionState({
        wsConnected: false,
        wsReconnecting: false,
        webrtcConnected: false,
        isInitializing: false,
        lastError: undefined
      });
    },

    updateRoomSettings: () => { },

    // Expose client for other slices (hacky but works for now without changing all types immediately)
    // We might need to add `roomClient` to the Store type to access `toggleAudio` etc properly.
    // For now, let's attach the actions that delegate to roomClient.
  };
};