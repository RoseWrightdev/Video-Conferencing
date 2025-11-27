import ControlBar from "@/components/room/components/Controls";
import { createMockControlDependencies } from "../factories/createControlsDependencies";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

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

/**
 * Interactive playground to test all control bar features.
 * Toggle media controls and see real-time state updates.
 */
export const Interactive: Story = {
  render: () => {
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
    const [participantCount, setParticipantCount] = useState(3);

    const dependencies = createMockControlDependencies({
      isAudioEnabled,
      isVideoEnabled,
      isScreenSharing,
      isHost: true,
      participantCount,
      participants: mockParticipants,
    });

    // Override the mock methods to update state
    dependencies.mediaService.toggleAudio = async () => {
      setIsAudioEnabled(!isAudioEnabled);
    };

    dependencies.mediaService.toggleVideo = async () => {
      setIsVideoEnabled(!isVideoEnabled);
    };

    dependencies.mediaService.startScreenShare = async () => {
      setIsScreenSharing(true);
    };

    dependencies.mediaService.stopScreenShare = async () => {
      setIsScreenSharing(false);
    };

    dependencies.roomControlService.toggleChatPanel = () => {
      setIsChatOpen(!isChatOpen);
    };

    dependencies.roomControlService.toggleParticipantsPanel = () => {
      setIsParticipantsOpen(!isParticipantsOpen);
    };

    dependencies.roomControlService.leaveRoom = () => {
      alert("Leave room clicked!");
    };

    return (
      <div className="space-y-6">
        <div className="bg-gray-900 p-8 rounded-lg">
          <ControlBar dependencies={dependencies} />
        </div>

        <div className="p-6 bg-white rounded-lg border space-y-4">
          <h3 className="text-lg font-semibold">Current State</h3>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium">Audio</p>
              <p className={isAudioEnabled ? "text-green-600" : "text-gray-500"}>
                {isAudioEnabled ? "✓ Enabled" : "✗ Muted"}
              </p>
            </div>

            <div>
              <p className="font-medium">Video</p>
              <p className={isVideoEnabled ? "text-blue-600" : "text-red-500"}>
                {isVideoEnabled ? "✓ Enabled" : "✗ Disabled"}
              </p>
            </div>

            <div>
              <p className="font-medium">Screen Share</p>
              <p className={isScreenSharing ? "text-green-600" : "text-gray-500"}>
                {isScreenSharing ? "✓ Sharing" : "✗ Not sharing"}
              </p>
            </div>

            <div>
              <p className="font-medium">Participants</p>
              <p className={isParticipantsOpen ? "text-blue-600" : "text-gray-500"}>
                {isParticipantsOpen ? "✓ Panel Open" : "✗ Panel Closed"} ({participantCount})
              </p>
            </div>

            <div>
              <p className="font-medium">Chat</p>
              <p className={isChatOpen ? "text-blue-600" : "text-gray-500"}>
                {isChatOpen ? "✓ Panel Open" : "✗ Panel Closed"}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-gray-600">
              💡 Click the controls above to toggle states and see real-time updates
            </p>
          </div>
        </div>
      </div>
    );
  },
};
