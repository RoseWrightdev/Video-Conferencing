import ParticipantTile from "@/components/participants/components/ParticipantTile";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import type { Participant } from "@/store/types";

const meta: Meta<typeof ParticipantTile> = {
  title: "Room/ParticipantTile",
  component: ParticipantTile,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="bg-gray-900 p-8 min-h-screen flex items-center justify-center">
        <div className="w-full max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Participant video tile component displaying video stream, avatar placeholder, status indicators (host, screen sharing, hand raised), audio/video states, and speaking detection. Supports pinning and local video mirroring.",
      },
    },
  },
  argTypes: {
    participant: {
      control: false,
      description: "Participant data including id, username, role, and optional stream",
    },
    isAudioEnabled: {
      control: "boolean",
      description: "Whether participant's microphone is enabled",
    },
    isVideoEnabled: {
      control: "boolean",
      description: "Whether participant's camera is enabled",
    },
    isScreenSharing: {
      control: "boolean",
      description: "Whether participant is sharing their screen",
    },
    isHandRaised: {
      control: "boolean",
      description: "Whether participant has their hand raised",
    },
    isSpeaking: {
      control: "boolean",
      description: "Whether participant is currently speaking (shows green border)",
    },
    isLocal: {
      control: "boolean",
      description: "Whether this is the local user (adds 'You' label and mirrors video)",
    },
    isPinned: {
      control: "boolean",
      description: "Whether this participant is pinned",
    },
    onPin: {
      action: "pinned",
      description: "Callback when pin button is clicked",
    },
  },
};

export default meta;

type Story = StoryObj<typeof ParticipantTile>;

const mockParticipant: Participant = {
  id: "user-1",
  username: "Alice Johnson",
  role: "participant",
};

const mockHost: Participant = {
  id: "host-1",
  username: "Bob Smith",
  role: "host",
};

const mockLocalUser: Participant = {
  id: "local-1",
  username: "You",
  role: "participant",
};

/**
 * Default participant tile with video and audio enabled
 */
export const Default: Story = {
  args: {
    participant: mockParticipant,
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Host participant with crown badge
 */
export const Host: Story = {
  args: {
    participant: mockHost,
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Local user (self-view) with mirrored video
 */
export const LocalUser: Story = {
  args: {
    participant: mockLocalUser,
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: true,
    isPinned: false,
  },
};

/**
 * Participant with video disabled (shows avatar)
 */
export const VideoOff: Story = {
  args: {
    participant: mockParticipant,
    isAudioEnabled: true,
    isVideoEnabled: false,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Participant with audio muted
 */
export const AudioMuted: Story = {
  args: {
    participant: mockParticipant,
    isAudioEnabled: false,
    isVideoEnabled: true,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Participant with both audio and video disabled
 */
export const AudioAndVideoOff: Story = {
  args: {
    participant: mockParticipant,
    isAudioEnabled: false,
    isVideoEnabled: false,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Participant actively speaking (green border with glow)
 */
export const Speaking: Story = {
  args: {
    participant: mockParticipant,
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: true,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Participant sharing their screen
 */
export const ScreenSharing: Story = {
  args: {
    participant: mockParticipant,
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: true,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Participant with hand raised (pulsing orange indicator)
 */
export const HandRaised: Story = {
  args: {
    participant: mockParticipant,
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: false,
    isHandRaised: true,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Pinned participant (blue border with glow)
 */
export const Pinned: Story = {
  args: {
    participant: mockParticipant,
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: false,
    isPinned: true,
  },
};

/**
 * Host sharing screen with hand raised
 */
export const HostSharingWithHandRaised: Story = {
  args: {
    participant: mockHost,
    isAudioEnabled: true,
    isVideoEnabled: true,
    isScreenSharing: true,
    isHandRaised: true,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Interactive example with pin/unpin functionality
 */
export const Interactive: Story = {
  render: (args) => {
    const [isPinned, setIsPinned] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    
    return (
      <div className="space-y-4">
        <ParticipantTile
          {...args}
          isPinned={isPinned}
          isSpeaking={isSpeaking}
          onPin={(id) => {
            console.log(`Pin toggled for ${id}`);
            setIsPinned(!isPinned);
          }}
        />
        
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setIsSpeaking(!isSpeaking)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            Toggle Speaking
          </button>
          <button
            onClick={() => setIsPinned(!isPinned)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Toggle Pin
          </button>
        </div>
      </div>
    );
  },
  args: {
    participant: mockParticipant,
    isAudioEnabled: true,
    isVideoEnabled: false,
    isScreenSharing: false,
    isHandRaised: false,
    isLocal: false,
  },
};

/**
 * Long username that gets truncated
 */
export const LongUsername: Story = {
  args: {
    participant: {
      id: "user-long",
      username: "Christopher Alexander Montgomery III",
      role: "participant",
    },
    isAudioEnabled: true,
    isVideoEnabled: false,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};

/**
 * Single letter username (shows 1 initial)
 */
export const SingleLetterUsername: Story = {
  args: {
    participant: {
      id: "user-x",
      username: "X",
      role: "participant",
    },
    isAudioEnabled: true,
    isVideoEnabled: false,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    isLocal: false,
    isPinned: false,
  },
};
