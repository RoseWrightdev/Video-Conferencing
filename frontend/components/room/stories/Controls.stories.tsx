import ControlBar from "@/components/room/components/Controls";
import { createMockControlDependencies } from "../factories/createControlsDependencies";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";

const meta: Meta<typeof ControlBar> = {
  title: "Room/ControlBar",
  component: ControlBar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Control bar component with dependency injection for managing media controls, room settings, and participant actions.",
      },
    },
  },
  argTypes: {
    dependencies: {
      control: false,
      description: "Control dependencies for media, device, and room management",
    },
  },
};

export default meta;

type Story = StoryObj<typeof ControlBar>;

// Mock participants for stories
const mockParticipants = [
  {
    id: "user-1",
    username: "Alice",
    role: "host" as const,
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: false,
    isSpeaking: false,
    lastActivity: new Date(),
  },
  {
    id: "user-2", 
    username: "Bob",
    role: "participant" as const,
    isAudioEnabled: false,
    isVideoEnabled: true,
    isScreenSharing: false,
    isSpeaking: true,
    lastActivity: new Date(),
  },
  {
    id: "user-3",
    username: "Charlie",
    role: "moderator" as const,
    isAudioEnabled: true,
    isVideoEnabled: false,
    isScreenSharing: false,
    isSpeaking: false,
    lastActivity: new Date(),
  },
];

export const Default: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      isHost: false,
      participantCount: 3,
      participants: mockParticipants,
    }),
  },
};

export const Host: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      isHost: true,
      participantCount: 5,
      participants: mockParticipants,
    }),
  },
};

export const Muted: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: false,
      isVideoEnabled: true,
      isScreenSharing: false,
      isMuted: true,
      participantCount: 3,
      participants: mockParticipants,
    }),
  },
};

export const VideoOff: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: true,
      isVideoEnabled: false,
      isScreenSharing: false,
      participantCount: 3,
      participants: mockParticipants,
    }),
  },
};

export const ScreenSharing: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: true,
      participantCount: 3,
      participants: mockParticipants,
    }),
  },
};

export const AllDisabled: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: false,
      isVideoEnabled: false,
      isScreenSharing: false,
      isMuted: true,
      canScreenShare: false,
      participantCount: 3,
      participants: mockParticipants,
    }),
  },
};

export const LargeRoom: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      isHost: true,
      participantCount: 25,
      participants: mockParticipants,
    }),
  },
};

export const NoDevices: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: false,
      isVideoEnabled: false,
      isScreenSharing: false,
      availableCameras: [],
      availableMicrophones: [],
      canScreenShare: false,
      participantCount: 1,
      participants: [],
    }),
  },
};
