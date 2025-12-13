import { type Participant } from "@/store/types";
import { type ControlDependencies } from "@/components/room/types/ControlsDependcies";

/**
 * Creates mock control dependencies for testing and Storybook
 */
export function createMockControlDependencies({
  isAudioEnabled = true,
  isVideoEnabled = true,
  isScreenSharing = false,
  isHost = false,
  isMuted = false,
  canScreenShare = true,
  isHandRaised = false,
  unreadCount = 0,
}: {
  isAudioEnabled?: boolean;
  isVideoEnabled?: boolean;
  isScreenSharing?: boolean;
  isHost?: boolean;
  isMuted?: boolean;
  canScreenShare?: boolean;
  isHandRaised?: boolean;
  unreadCount?: number;
  participantCount?: number;
  participants?: Participant[];
  availableCameras?: MediaDeviceInfo[];
  availableMicrophones?: MediaDeviceInfo[];
  selectedCamera?: string;
  selectedMicrophone?: string;
} = {}): ControlDependencies {
  // Default mock devices
  const defaultCameras: MediaDeviceInfo[] = [
    {
      deviceId: "camera-1",
      label: "Built-in Camera",
      kind: "videoinput",
      groupId: "group-1",
      toJSON: () => ({})
    },
    {
      deviceId: "camera-2", 
      label: "External Webcam",
      kind: "videoinput",
      groupId: "group-2",
      toJSON: () => ({})
    }
  ];

  const defaultMicrophones: MediaDeviceInfo[] = [
    {
      deviceId: "mic-1",
      label: "Built-in Microphone",
      kind: "audioinput", 
      groupId: "group-1",
      toJSON: () => ({})
    },
    {
      deviceId: "mic-2",
      label: "External Microphone",
      kind: "audioinput",
      groupId: "group-2", 
      toJSON: () => ({})
    }
  ];

  return {
    mediaService: {
      isAudioEnabled,
      isVideoEnabled,
      isScreenSharing,
      toggleAudio: async () => console.log("Mock toggleAudio"),
      toggleVideo: async () => console.log("Mock toggleVideo"),
      startScreenShare: async () => console.log("Mock startScreenShare"),
      stopScreenShare: async () => console.log("Mock stopScreenShare"),
      requestScreenShare: async () => {
        console.log("Mock requestScreenShare");
        return canScreenShare;
      },
    },
    roomControlService: {
      isHost,
      isMuted,
      canScreenShare,
      isHandRaised,
      leaveRoom: () => console.log("Mock leaveRoom"),
      toggleParticipantsPanel: () => console.log("Mock toggleParticipantsPanel"),
      toggleSettingsPanel: () => console.log("Mock toggleSettingsPanel"),
      toggleChatPanel: () => console.log("Mock toggleChatPanel"),
      toggleHand: () => console.log("Mock toggleHand"),
    },
    chatService: {
      unreadCount,
      markMessagesRead: () => console.log("Mock markMessagesRead"),
    },
  };
}
