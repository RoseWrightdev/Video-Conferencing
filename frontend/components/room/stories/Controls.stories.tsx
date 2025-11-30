import ControlBar from "@/components/room/components/Controls";
import { createMockControlDependencies } from "../factories/createControlsDependencies";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

const meta: Meta<typeof ControlBar> = {
  title: "Room/ControlBar",
  component: ControlBar,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="bg-gray-900 min-h-[200px] flex items-end p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: "Control bar component with dependency injection for managing media controls, room settings, and participant actions. Features frosted glass styling, animated toggle switches, hand raise button, and tooltips for permissions.",
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
    }),
  },
};

export const NoDevices: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: false,
      isVideoEnabled: false,
      isScreenSharing: false,
      canScreenShare: false,
      participantCount: 1,
      participants: [],
    }),
  },
};

/**
 * Example showing hand raise feature.
 * Users can raise/lower their hand to signal they want to speak.
 */
export const HandRaised: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: false,
      isVideoEnabled: true,
      isScreenSharing: false,
      isMuted: true,
      isHandRaised: true,
      participantCount: 8,
    }),
  },
};

/**
 * Example showing screen share permission tooltip.
 * When canScreenShare is false, a tooltip explains why.
 */
export const NoScreenSharePermission: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      canScreenShare: false,
      isHost: false,
      participantCount: 5,
    }),
  },
};

/**
 * Example showing unread chat messages badge.
 * Badge appears on chat button when there are unread messages.
 */
export const UnreadMessages: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      unreadCount: 5,
      participantCount: 3,
    }),
  },
};

/**
 * Example showing many unread messages.
 * Tests badge with larger numbers.
 */
export const ManyUnreadMessages: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: true,
      isVideoEnabled: true,
      isScreenSharing: false,
      unreadCount: 99,
      participantCount: 10,
    }),
  },
};

/**
 * Example showing all frosted glass effects in action.
 * Includes active toggles and various button states.
 */
export const FrostedGlassShowcase: Story = {
  args: {
    dependencies: createMockControlDependencies({
      isAudioEnabled: true,
      isVideoEnabled: false,
      isScreenSharing: true,
      isHost: true,
      participantCount: 12,
    }),
  },
};

/**
 * Interactive playground to test all control bar features.
 * Toggle media controls, raise hand, and see real-time state updates.
 * Features tooltips, frosted glass styling, and permission handling.
 */
export const Interactive: Story = {
  render: () => {
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [canScreenShare, setCanScreenShare] = useState(true);
    const [unreadCount, setUnreadCount] = useState(3);
    const participantCount = 3;

    const dependencies = createMockControlDependencies({
      isAudioEnabled,
      isVideoEnabled,
      isScreenSharing,
      isHost: true,
      canScreenShare,
      isHandRaised,
      unreadCount,
      participantCount,
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

    dependencies.mediaService.requestScreenShare = async () => {
      return canScreenShare;
    };

    dependencies.roomControlService.toggleChatPanel = () => {
      setIsChatOpen(!isChatOpen);
    };

    dependencies.roomControlService.toggleParticipantsPanel = () => {
      setIsParticipantsOpen(!isParticipantsOpen);
    };

    dependencies.roomControlService.toggleHand = () => {
      setIsHandRaised(!isHandRaised);
    };

    dependencies.roomControlService.leaveRoom = () => {
      alert("Leave room clicked!");
    };

    dependencies.chatService.markMessagesRead = () => {
      setUnreadCount(0);
    };

    return (
      <div className="space-y-6">
        <div className="bg-gray-900 p-8 rounded-lg">
          <ControlBar dependencies={dependencies} />
        </div>

        <div className="p-6 bg-white/80 frosted-3 rounded-lg border space-y-4">
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
              <p className="font-medium">Hand Raised</p>
              <p className={isHandRaised ? "text-yellow-600" : "text-gray-500"}>
                {isHandRaised ? "✓ Hand Up" : "✗ Hand Down"}
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

            <div>
              <p className="font-medium">Unread Messages</p>
              <p className={unreadCount > 0 ? "text-red-600" : "text-gray-500"}>
                {unreadCount > 0 ? `${unreadCount} unread` : "No unread messages"}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t space-y-2">
            <p className="text-xs text-gray-600">
              💡 Click the controls above to toggle states and see real-time updates
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCanScreenShare(!canScreenShare)}
                className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                {canScreenShare ? "Disable" : "Enable"} Screen Share Permission
              </button>
              <button
                onClick={() => setUnreadCount(unreadCount + 1)}
                className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Add Unread Message
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  },
};
