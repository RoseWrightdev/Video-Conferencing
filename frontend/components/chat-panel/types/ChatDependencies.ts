import { type ChatMessage, type Participant } from "@/store/types";

// Dependency interfaces for chat functionality
export interface ChatService {
  messages: ChatMessage[];
  sendChat: (message: string) => void;
  closeChat: () => void;
}

export interface ParticipantService {
  getParticipant: (id: string) => Participant | undefined;
}

export interface RoomService {
  currentUserId: string | null;
}

// Combined dependencies for chat components
export interface ChatDependencies {
  chatService: ChatService;
  participantService: ParticipantService;
  roomService: RoomService;
}
