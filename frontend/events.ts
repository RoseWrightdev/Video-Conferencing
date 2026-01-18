// ===================================
// SHARED TYPES - events.ts
//
// This file is the single source of truth for the event and payload
// structures used in WebSocket communication between the frontend and backend.
// Both services should derive their types from this file.
// ===================================

// ----------------
// Base Types
// ----------------

export interface ClientInfo {
  clientId: string;
  displayName: string;
}

export type EventType =
  // Chat
  | 'add_chat'
  | 'delete_chat'
  | 'recents_chat'
  // Reactions / Speaking
  | 'raise_hand'
  | 'lower_hand'
  // Media Controls
  | 'toggle_audio'
  | 'toggle_video'
  | 'toggle_screenshare'
  // Waiting Room
  | 'waiting_request'
  | 'accept_waiting'
  | 'deny_waiting'
  // Screenshare Requests
  | 'request_screenshare'
  | 'accept_screenshare'
  | 'deny_screenshare'
  // WebRTC Signaling
  | 'offer'
  | 'answer'
  | 'candidate'
  | 'renegotiate'
  // Core Room State
  | 'room_state'
  // System / Connection
  | 'connect'
  | 'disconnect'
  | 'ping';

// ----------------
// Payloads
// ----------------

// add_chat
export interface AddChatPayload extends ClientInfo {
  chatId: string;
  timestamp: number;
  chatContent: string;
}

// delete_chat
export interface DeleteChatPayload extends ClientInfo {
  chatId: string;
}

// recents_chat
export type GetRecentChatsPayload = ClientInfo;

// raise_hand / lower_hand
export type HandStatePayload = ClientInfo;

// toggle_audio / toggle_video / toggle_screenshare
export interface ToggleAudioPayload extends ClientInfo {
  enabled: boolean;
}

export interface ToggleVideoPayload extends ClientInfo {
  enabled: boolean;
}

export interface ToggleScreensharePayload extends ClientInfo {
  enabled: boolean;
}

// waiting_request
export type RequestWaitingPayload = ClientInfo;

// accept_waiting / deny_waiting
// Contains the target client's info (who is being accepted/denied)
export type AcceptWaitingPayload = ClientInfo;
export type DenyWaitingPayload = ClientInfo;

// request_screenshare
export type RequestScreensharePayload = ClientInfo;

// accept_screenshare / deny_screenshare
export interface ScreenshareDecisionPayload {
  clientId: string; // The client being accepted/denied
  displayName: string; // The client's display name
}

// WebRTC Payloads
export interface WebRTCOfferPayload extends ClientInfo {
  targetClientId: string;
  sdp: string;
}

export interface WebRTCAnswerPayload extends ClientInfo {
  targetClientId: string;
  sdp: string;
}

export interface WebRTCCandidatePayload extends ClientInfo {
  targetClientId: string;
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

export interface WebRTCRenegotiatePayload extends ClientInfo {
  targetClientId: string;
  reason?: string;
}


// room_state
export interface RoomStatePayload {
  roomId: string;
  hosts: ClientInfo[];
  participants: ClientInfo[];
  handsRaised: ClientInfo[];
  waitingUsers: ClientInfo[];
  sharingScreen: ClientInfo[];
  unmuted: ClientInfo[];
  cameraOn: ClientInfo[];
}

// ----------------
// Message Structure
// ----------------

export type AnyPayload =
  | AddChatPayload
  | DeleteChatPayload
  | GetRecentChatsPayload
  | HandStatePayload
  | ToggleAudioPayload
  | ToggleVideoPayload
  | ToggleScreensharePayload
  | RequestWaitingPayload
  | AcceptWaitingPayload
  | DenyWaitingPayload
  | RequestScreensharePayload
  | ScreenshareDecisionPayload
  | WebRTCOfferPayload
  | WebRTCAnswerPayload
  | WebRTCCandidatePayload
  | WebRTCRenegotiatePayload
  | RoomStatePayload;

export interface WebSocketMessage {
  event: EventType;
  payload: AnyPayload;
}

// ----------------
// Event Emitter
// ----------------

type EventHandler<T = any> = (data: T) => void;

import { createLogger } from '@/lib/logger';

const logger = createLogger('EventEmitter');

export class EventEmitter {
  private events: Map<string, EventHandler[]>;

  constructor() {
    this.events = new Map();
  }

  /**
   * Register an event listener
   */
  on(event: string, handler: EventHandler): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(handler);
  }

  /**
   * Register a one-time event listener
   */
  once(event: string, handler: EventHandler): void {
    const onceWrapper: EventHandler = (data) => {
      handler(data);
      this.off(event, onceWrapper);
    };
    this.on(event, onceWrapper);
  }

  /**
   * Remove a specific event listener
   */
  off(event: string, handler: EventHandler): void {
    if (!this.events.has(event)) {
      return;
    }

    const handlers = this.events.get(event)!;
    const index = handlers.indexOf(handler);

    if (index !== -1) {
      handlers.splice(index, 1);
    }

    // Clean up empty event arrays
    if (handlers.length === 0) {
      this.events.delete(event);
    }
  }

  /**
   * Emit an event with optional data
   */
  emit(event: string, data?: any): void {
    if (!this.events.has(event)) {
      return;
    }

    const handlers = this.events.get(event)!.slice(); // Create a copy to avoid issues if handlers are removed during emit

    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        // Catch errors to prevent one handler from breaking others
        logger.error(`Error in event handler for "${event}":`, error);
      }
    }
  }

  /**
   * Remove all listeners for a specific event, or all listeners if no event is specified
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}
