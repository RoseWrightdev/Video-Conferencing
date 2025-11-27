
import type { WebSocketClient, ClientInfo } from '@/lib/websockets';
import type { WebRTCManager } from '@/lib/webrtc';

// ===================
// Basic Types
// ===================
export type GridLayout = 'gallery' | 'speaker' | 'sidebar';

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
  webrtcConnected: boolean;
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

export interface RoomSlice {
  roomId: string | null;
  roomName: string | null;
  roomSettings: RoomSettings | null;
  isJoined: boolean;
  isWaitingRoom: boolean;
  currentUserId: string | null;
  currentUsername: string | null;
  clientInfo: ClientInfo | null;
  updateRoomSettings: (settings: Partial<RoomSettings>) => void;
}

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

export type RoomStoreState = ChatSlice &
  ConnectionSlice &
  DeviceSlice &
  MediaSlice &
  ParticipantSlice &
  RoomSlice &
  UiSlice;
