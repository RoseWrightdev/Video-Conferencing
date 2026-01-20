import { ParticipantsPanelContent as ParticipantsPanel } from '@/components/participants/components/ParticipantsPanel';
import { type Meta, type StoryObj } from '@storybook/nextjs-vite';
import type { Participant } from '@/store/types';
import * as React from 'react';

const meta: Meta<typeof ParticipantsPanel> = {
  title: 'Room/ParticipantsPanel',
  component: ParticipantsPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Sidebar panel displaying participant list with management controls. Shows participant status, hand raises, screen sharing, and provides host controls for muting and removing participants.',
      },
    },
  },
  argTypes: {
    participants: {
      control: false,
      description: 'Array of participant objects',
    },
    isHost: {
      control: 'boolean',
      description: 'Whether current user is host (enables management controls)',
    },
    currentUserId: {
      control: 'text',
      description: 'ID of the current user',
    },
    onClose: {
      action: 'close',
      description: 'Callback when panel is closed',
    },
  },
};

export default meta;

type Story = StoryObj<typeof ParticipantsPanel>;

// Mock participants
const mockParticipants: Participant[] = [
  { id: '1', username: 'Alice Johnson', role: 'host' },
  { id: '2', username: 'Bob Smith', role: 'participant' },
  { id: '3', username: 'Charlie Davis', role: 'participant' },
  { id: '4', username: 'Diana Prince', role: 'participant' },
  { id: '5', username: 'Eve Thompson', role: 'participant' },
  { id: '6', username: 'Frank Miller', role: 'participant' },
  { id: '7', username: 'Grace Lee', role: 'participant' },
  { id: '8', username: 'Henry Wilson', role: 'participant' },
];

const defaultArgs = {
  participants: [],
  waitingParticipants: [],
  currentUserId: '1',
  isHost: false,

  onClose: () => { },
  onApprove: () => { },
  onKick: () => { },
  onToggleAudio: () => { },
};

/**
 * Empty participants panel
 */
export const Empty: Story = {
  args: {
    ...defaultArgs,
    participants: [],
    currentUserId: '1',
    isHost: false,
  },
};

/**
 * Basic participant list as regular user
 */
export const AsParticipant: Story = {
  args: {
    ...defaultArgs,
    participants: mockParticipants.slice(0, 4),
    currentUserId: '2',
    isHost: false,
  },
};

/**
 * Participant list as host (shows controls on hover)
 */
export const AsHost: Story = {
  args: {
    ...defaultArgs,
    participants: mockParticipants.slice(0, 4),
    currentUserId: '1',
    isHost: true,
  },
};

/**
 * Panel with hand raises
 * Note: State is now internal to the component store connection
 */
export const WithHandRaises: Story = {
  args: {
    ...defaultArgs,
    participants: mockParticipants.slice(0, 6),
    currentUserId: '1',
    isHost: true,
  },
};

/**
 * Panel with screen sharing participant
 */
export const WithScreenSharing: Story = {
  args: {
    ...defaultArgs,
    participants: mockParticipants.slice(0, 5),
    currentUserId: '1',
    isHost: false,
  },
};

/**
 * Panel with mixed participant states
 */
export const MixedStates: Story = {
  args: {
    ...defaultArgs,
    participants: mockParticipants,
    currentUserId: '1',
    isHost: true,
  },
};

/**
 * Many participants (scrollable)
 */
export const ManyParticipants: Story = {
  args: {
    ...defaultArgs,
    participants: [
      ...mockParticipants,
      { id: '9', username: 'Ivy Chen', role: 'participant' },
      { id: '10', username: 'Jack Robinson', role: 'participant' },
      { id: '11', username: 'Kelly Martinez', role: 'participant' },
      { id: '12', username: 'Leo Anderson', role: 'participant' },
      { id: '13', username: 'Maya Patel', role: 'participant' },
      { id: '14', username: 'Noah Taylor', role: 'participant' },
      { id: '15', username: 'Olivia Brown', role: 'participant' },
    ],
    currentUserId: '1',
    isHost: true,
  },
};

/**
 * Minimal audio/video activity
 */
export const LowActivity: Story = {
  args: {
    ...defaultArgs,
    participants: mockParticipants.slice(0, 6),
    currentUserId: '1',
    isHost: false,
  },
};

/**
 * High activity with multiple indicators
 */
export const HighActivity: Story = {
  args: {
    ...defaultArgs,
    participants: mockParticipants,
    currentUserId: '1',
    isHost: false,
  },
};

/**
 * Interactive example with state management
 */
export const Interactive: Story = {
  render: (args) => {
    const [participants, setParticipants] = React.useState(args.participants || []);

    const handleRemove = (id: string) => {
      setParticipants(participants.filter((p: any) => p.id !== id));
    };

    return (
      <div className="h-screen bg-gray-900 flex justify-end">
        <ParticipantsPanel
          {...args}
          participants={participants}
          onKick={handleRemove}
          onClose={() => alert('Close panel')}
        />
      </div>
    );
  },
  args: {
    ...defaultArgs,
    participants: mockParticipants.slice(0, 6),
  },
};

/**
 * Panel in room context (with background)
 */
export const InRoomContext: Story = {
  render: (args) => (
    <div className="h-screen bg-gray-900 flex">
      {/* Simulated video area */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-white/50 text-lg">Video Area</p>
      </div>

      {/* Participants panel */}
      <ParticipantsPanel {...args} />
    </div>
  ),
  args: {
    ...defaultArgs,
    participants: mockParticipants.slice(0, 5),
    currentUserId: '1',
    isHost: true,
  },
};
