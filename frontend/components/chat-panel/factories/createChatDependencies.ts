import { type ChatMessage } from "@/store/types";
import { type ChatDependencies } from "@/components/chat-panel/types/ChatDependencies";
/**
 * Creates mock chat dependencies for testing and Storybook
 */
export function createMockChatDependencies({
  messages = [],
  currentUserId = "user-1",
  participants = {},
}: {
  messages?: ChatMessage[];
  currentUserId?: string;
  participants?: Record<string, { role: "host" | "participant" | "waiting"; username?: string }>;
} = {}): ChatDependencies {
  return {
    chatService: {
      messages,
      sendChat: (message: string) => console.log("Mock sendChat:", message),
      closeChat: () => console.log("Mock closeChat"),
    },
    participantService: {
      getParticipant: (id: string) => {
        const participant = participants[id];
        return participant ? {
          id,
          role: participant.role,
          username: participant.username || `User ${id}`,
          isAudioEnabled: false,
          isVideoEnabled: false,
          isScreenSharing: false,
          isSpeaking: false,
          lastActivity: new Date(),
        } : undefined;
      },
    },
    roomService: {
      currentUserId,
    },
  };
}
