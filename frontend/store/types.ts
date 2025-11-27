import type { WebSocketClient } from '@/lib/websockets';
import type { ClientInfo } from '../../shared/types/events';
import type { WebRTCManager } from '@/lib/webrtc';

// ===================
// Basic Types
// ===================

/**
 * Video grid layout mode for participant display.
 * 
 * - gallery: Equal-sized grid, responsive columns
 * - speaker: Active speaker large, others thumbnails
 * - sidebar: Main content + collapsible participant list
 */
export type GridLayout = 'gallery' | 'speaker' | 'sidebar';

/**
 * Participant in a video conference room.
 * 
 * Represents both local and remote participants with their
 * current media states and role permissions.
 * 
 * @property id - Unique identifier (matches clientId from server)
 * @property username - Display name shown in UI
 * @property role - Permission level (host has full control)
 * @property isAudioEnabled - Microphone track enabled state
 * @property isVideoEnabled - Camera track enabled state
 * @property isScreenSharing - Currently sharing screen
 * @property isSpeaking - Raised hand or active speaker detection
 * @property lastActivity - Timestamp for idle detection
 * @property stream - MediaStream for rendering video element
 */
export interface Participant {
  id: string;
  username: string;
  role: 'host' | 'moderator' | 'participant';
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  lastActivity: Date;
  stream?: MediaStream;
}

/**
 * Chat message in a video conference room.
 * 
 * Supports text messages, system notifications, and private messages.
 * 
 * Message Types:
 * - text: Regular chat message visible to all
 * - system: Server-generated notification (join/leave)
 * - private: Direct message to specific participant
 * 
 * @property id - Unique message identifier (chatId from server)
 * @property participantId - Sender's participant ID
 * @property username - Sender's display name
 * @property content - Message text content
 * @property timestamp - When message was sent
 * @property type - Message category for styling
 * @property targetId - Recipient ID for private messages
 */
export interface ChatMessage {
  id: string;
  participantId: string;
  username: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'system' | 'private';
  targetId?: string;
}

/**
 * Room configuration and permission settings.
 * 
 * Controls participant capabilities and room behavior.
 * Settings can only be modified by hosts.
 * 
 * @property allowScreenShare - Participants can share screens
 * @property allowChat - Chat panel available
 * @property allowParticipantAudio - Participants can unmute
 * @property allowParticipantVideo - Participants can enable camera
 * @property maxParticipants - Room capacity limit
 * @property requireApproval - Enable waiting room for new joins
 */
export interface RoomSettings {
  allowScreenShare: boolean;
  allowChat: boolean;
  allowParticipantAudio: boolean;
  allowParticipantVideo: boolean;
  maxParticipants: number;
  requireApproval: boolean;
}

/**
 * Real-time connection status for WebSocket and WebRTC.
 * 
 * Tracks connection health for UI indicators and reconnection logic.
 * 
 * States:
 * - wsConnected: WebSocket ready for signaling
 * - wsReconnecting: Attempting to restore WebSocket after disconnect
 * - webrtcConnected: At least one peer connection established
 * - lastError: Most recent error for user notification
 * 
 * @see ConnectionSlice For state update methods
 */
export interface ConnectionState {
  wsConnected: boolean;
  wsReconnecting: boolean;
  webrtcConnected: boolean;
  lastError?: string;
}

// ===================
// Slice Definitions
// ===================

/**
 * Chat slice interface for message state and actions.
 * 
 * @see createChatSlice For implementation
 */
export interface ChatSlice {
  messages: ChatMessage[];
  unreadCount: number;
  isChatPanelOpen: boolean;
  sendMessage: (content: string, type?: 'text' | 'private', targetId?: string) => void;
  addMessage: (message: ChatMessage) => void;
  markMessagesRead: () => void;
  toggleChatPanel: () => void;
}

/**
 * Connection slice interface for tracking connection states.
 * 
 * @see createConnectionSlice For implementation
 */
export interface ConnectionSlice {
  connectionState: ConnectionState;
  updateConnectionState: (updates: Partial<ConnectionState>) => void;
  handleError: (error: string) => void;
  clearError: () => void;
}

/**
 * Device slice interface for media device management.
 * 
 * @see createDeviceSlice For implementation
 */
export interface DeviceSlice {
  availableDevices: {
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
    speakers: MediaDeviceInfo[];
  };
  selectedDevices: {
    camera?: string;
    microphone?: string;
    speaker?: string;
  };
  refreshDevices: () => Promise<void>;
  switchCamera: (deviceId: string) => Promise<void>;
  switchMicrophone: (deviceId: string) => Promise<void>;
}

/**
 * Media slice interface for local stream management.
 * 
 * @see createMediaSlice For implementation
 */
export interface MediaSlice {
  localStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  setLocalStream: (stream: MediaStream | null) => void;
  toggleAudio: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
}

/**
 * Participant slice interface for room member management.
 * 
 * @see createParticipantSlice For implementation
 */
export interface ParticipantSlice {
  participants: Map<string, Participant>;
  localParticipant: Participant | null;
  speakingParticipants: Set<string>;
  pendingParticipants: Participant[];
  selectedParticipantId: string | null;
  isHost: boolean;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void;
  approveParticipant: (participantId: string) => void;
  kickParticipant: (participantId: string) => void;
  toggleParticipantAudio: (participantId: string) => void;
  toggleParticipantVideo: (participantId: string) => void;
  selectParticipant: (participantId: string | null) => void;
}

/**
 * Room slice interface for room lifecycle and core infrastructure.
 * 
 * @see createRoomSlice For implementation
 */
export interface RoomSlice {
  roomId: string | null;
  roomName: string | null;
  roomSettings: RoomSettings | null;
  isJoined: boolean;
  isWaitingRoom: boolean;
  currentUserId: string | null;
  currentUsername: string | null;
  clientInfo: ClientInfo | null;
  wsClient: WebSocketClient | null;
  webrtcManager: WebRTCManager | null;
  initializeRoom: (roomId: string, username: string, token?: string) => Promise<void>;
  joinRoom: (approvalToken?: string) => Promise<void>;
  leaveRoom: () => void;
  updateRoomSettings: (settings: Partial<RoomSettings>) => void;
}

/**
 * UI slice interface for layout and panel management.
 * 
 * @see createUISlice For implementation
 */
export interface UiSlice {
  isParticipantsPanelOpen: boolean;
  gridLayout: GridLayout;
  isPinned: boolean;
  pinnedParticipantId: string | null;
  toggleParticipantsPanel: () => void;
  setGridLayout: (layout: GridLayout) => void;
  pinParticipant: (participantId: string | null) => void;
}

// ===================
// Main Store State
// ===================

/**
 * Combined Zustand store state for video conferencing.
 * 
 * Merges all slice types into a single state tree.
 * Accessible via useRoomStore hook throughout the application.
 * 
 * Architecture:
 * - Modular slice pattern for separation of concerns
 * - Each slice manages related state and actions
 * - Slices can access other slices via get() in actions
 * - DevTools integration for debugging state changes
 * 
 * @see useRoomStore For hook interface
 * @see createChatSlice For chat state implementation
 * @see createMediaSlice For media state implementation
 * @see createParticipantSlice For participant state implementation
 */
export type RoomStoreState = ChatSlice &
  ConnectionSlice &
  DeviceSlice &
  MediaSlice &
  ParticipantSlice &
  RoomSlice &
  UiSlice;
