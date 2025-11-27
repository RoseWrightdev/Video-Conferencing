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
  participantCount = 3,
  participants = [],
}: {
  isAudioEnabled?: boolean;
  isVideoEnabled?: boolean;
  isScreenSharing?: boolean;
  isHost?: boolean;
  isMuted?: boolean;
  canScreenShare?: boolean;
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
    },
    roomControlService: {
      isHost,
      isMuted,
      canScreenShare,
      leaveRoom: () => console.log("Mock leaveRoom"),
      toggleParticipantsPanel: () => console.log("Mock toggleParticipantsPanel"),
      toggleChatPanel: () => console.log("Mock toggleChatPanel"),
    },
    participantControlService: {
      participants,
      participantCount,
      getParticipant: (id: string) => participants.find(p => p.id === id),
      kickParticipant: isHost ? (id: string) => console.log("Mock kickParticipant:", id) : undefined,
      toggleParticipantAudio: isHost ? (id: string) => console.log("Mock toggleParticipantAudio:", id) : undefined,
      toggleParticipantVideo: isHost ? (id: string) => console.log("Mock toggleParticipantVideo:", id) : undefined,
    },
  };
}
