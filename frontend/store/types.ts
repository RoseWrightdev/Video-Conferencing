import type { WebSocketClient } from '@/lib/websockets';
import type { SFUClient } from '@/lib/webrtc';
import type { RoomClient } from '@/lib/RoomClient';

export type GridLayout = 'gallery' | 'speaker' | 'sidebar';

/**
 * Local representation of a participant.
 * We map the Protobuf `ParticipantInfo` to this structure for the UI.
 */
export interface Participant {
  id: string;
  username: string;
  role: 'host' | 'participant' | 'screenshare' | 'waiting';
  stream?: MediaStream; // The MediaStream object from the SFU

  // Media State Flags
  isAudioEnabled?: boolean;
  isVideoEnabled?: boolean;
  isScreenSharing?: boolean;
  isHandRaised?: boolean;
}

/**
 * Basic info about the local user, used for connection setup.
 */
export interface LocalClientInfo {
  clientId: string;
  displayName: string;
}

export interface ChatMessage {
  id: string;
  participantId: string;
  username: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'system' | 'private';
  targetId?: string;
}

export interface RoomSettings {
  allowScreenShare: boolean;
  allowChat: boolean;
  allowParticipantAudio: boolean;
  allowParticipantVideo: boolean;
  maxParticipants: number;
  requireApproval: boolean;
}

export interface ConnectionState {
  wsConnected: boolean;
  wsReconnecting: boolean;
  webrtcConnected: boolean; // True if SFU connection is stable
  isInitializing: boolean;
  lastError?: string;
}

// ===================
// Slice Definitions
// ===================

export interface ChatSlice {
  messages: ChatMessage[];
  unreadCount: number;
  isChatPanelOpen: boolean;
  sendMessage: (content: string, type?: 'text' | 'private', targetId?: string) => void;
  addMessage: (message: ChatMessage) => void;
  markMessagesRead: () => void;
  toggleChatPanel: () => void;
  fetchHistory: () => void;
}

export interface ConnectionSlice {
  connectionState: ConnectionState;
  updateConnectionState: (updates: Partial<ConnectionState>) => void;
  handleError: (error: string) => void;
  clearError: () => void;
}

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

export interface ParticipantSlice {
  // Data
  participants: Map<string, Participant>;
  hosts: Map<string, Participant>;
  waitingParticipants: Map<string, Participant>;
  localParticipant: Participant | null;

  // State Flags (Mirrors the Proto 'ParticipantInfo' booleans)
  unmutedParticipants: Set<string>;
  cameraOnParticipants: Set<string>;
  sharingScreenParticipants: Set<string>;
  raisingHandParticipants: Set<string>;

  // UI State
  selectedParticipantId: string | null;
  isHost: boolean;

  // Actions
  addParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipant: (participantId: string, updates: Partial<Participant>) => void;
  setParticipantStream: (participantId: string, stream: MediaStream | null) => void;

  setAudioEnabled: (participantId: string, enabled: boolean) => void;
  setVideoEnabled: (participantId: string, enabled: boolean) => void;
  setScreenSharing: (participantId: string, sharing: boolean) => void;
  setHandRaised: (participantId: string, raised: boolean) => void;

  approveParticipant: (participantId: string) => void;
  kickParticipant: (participantId: string) => void;
  toggleParticipantAudio: (participantId: string) => void;
  toggleParticipantVideo: (participantId: string) => void;
  selectParticipant: (participantId: string | null) => void;
  toggleHand: () => Promise<void>;
  toggleParticipantsPanel: () => void; // Moved from UiSlice
  unreadParticipantsCount: number;
  isParticipantsPanelOpen: boolean; // Moved from UiSlice
}

export interface RoomSlice {
  roomId: string | null;
  roomName: string | null;
  roomSettings: RoomSettings | null;
  isJoined: boolean;
  isWaitingRoom: boolean;
  currentUserId: string | null;
  currentUsername: string | null;

  clientInfo: LocalClientInfo | null;
  wsClient: WebSocketClient | null;
  sfuClient: SFUClient | null;
  roomClient: RoomClient | null; // Added

  initializeRoom: (roomId: string, username: string, token: string) => Promise<void>;
  joinRoom: (approvalToken?: string) => Promise<void>;
  leaveRoom: () => void;
  updateRoomSettings: (settings: Partial<RoomSettings>) => void;
}

export interface UiSlice {
  isSettingsPanelOpen: boolean;
  gridLayout: GridLayout;
  isPinned: boolean;
  pinnedParticipantId: string | null;
  toggleSettingsPanel: () => void;

  setGridLayout: (layout: GridLayout) => void;
  pinParticipant: (participantId: string | null) => void;
}

export type RoomStoreState = ChatSlice &
  ConnectionSlice &
  DeviceSlice &
  MediaSlice &
  ParticipantSlice &
  RoomSlice &
  UiSlice;