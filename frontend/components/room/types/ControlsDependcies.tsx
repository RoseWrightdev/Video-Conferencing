import { type Participant } from "@/hooks/useRoomStore";

export interface MediaService {
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  toggleAudio: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
}

export interface RoomControlService {
  isHost: boolean;
  isMuted: boolean;
  canScreenShare: boolean;
  leaveRoom: () => void;
  toggleParticipantsPanel: () => void;
  toggleChatPanel: () => void;
}

export interface ParticipantControlService {
  participants: Participant[];
  participantCount: number;
  getParticipant: (id: string) => Participant | undefined;
  kickParticipant?: (id: string) => void;
  toggleParticipantAudio?: (id: string) => void;
  toggleParticipantVideo?: (id: string) => void;
}

// Combined dependencies for control components
export interface ControlDependencies {
  mediaService: MediaService;
  roomControlService: RoomControlService;
  participantControlService: ParticipantControlService;
}