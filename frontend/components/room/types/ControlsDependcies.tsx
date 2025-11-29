export interface MediaService {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  toggleAudio: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  requestScreenShare: () => Promise<boolean>;
}

export interface RoomControlService {
  isHost: boolean;
  isMuted: boolean;
  isHandRaised: boolean;
  canScreenShare: boolean;
  leaveRoom: () => void;
  toggleParticipantsPanel: () => void;
  toggleChatPanel: () => void;
  toggleHand: () => void;
}

export interface ChatService {
  unreadCount: number;
  markMessagesRead: () => void;
}

// Combined dependencies for control components
export interface ControlDependencies {
  mediaService: MediaService;
  roomControlService: RoomControlService;
  chatService: ChatService;
}
