import ParticipantGrid, { type GridLayout } from '@/components/participants/components/ParticipantGrid';
import { type Meta, type StoryObj } from '@storybook/nextjs-vite';
import type { Participant } from '@/store/types';

const meta: Meta<typeof ParticipantGrid> = {
  title: 'Room/ParticipantGrid',
  component: ParticipantGrid,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Responsive grid layout for displaying multiple video participants. Supports gallery, speaker, and sidebar layouts with automatic responsive behavior based on participant count.',
      },
    },
  },
  argTypes: {
    participants: {
      control: false,
      description: 'Array of participant objects',
    },
    layout: {
      control: 'select',
      options: ['gallery', 'speaker', 'sidebar'],
      description: 'Layout mode for displaying participants',
    },
    currentUserId: {
      control: 'text',
      description: 'ID of the current user',
    },
    pinnedParticipantId: {
      control: 'text',
      description: 'ID of pinned participant (featured in speaker/sidebar)',
    },
  },
};

export default meta;

type Story = StoryObj<typeof ParticipantGrid>;

// Mock participants
const mockParticipants: Participant[] = [
  { id: '1', username: 'Alice Johnson', role: 'host' },
  { id: '2', username: 'Bob Smith', role: 'participant' },
  { id: '3', username: 'Charlie Davis', role: 'participant' },
  { id: '4', username: 'Diana Prince', role: 'participant' },
  { id: '5', username: 'Eve Thompson', role: 'participant' },
  { id: '6', username: 'Frank Miller', role: 'participant' },
];

/**
 * Empty grid with no participants
 */
export const Empty: Story = {
  args: {
    participants: [],
    currentUserId: '1',
    layout: 'gallery',
  },
};

/**
 * Single participant view
 */
export const SingleParticipant: Story = {
  args: {
    participants: [mockParticipants[0]],
    currentUserId: '1',
    layout: 'gallery',
    unmutedParticipants: new Set(['1']),
    cameraOnParticipants: new Set(['1']),
  },
};

/**
 * Two participants in gallery layout
 */
export const TwoParticipants: Story = {
  args: {
    participants: mockParticipants.slice(0, 2),
    currentUserId: '1',
    layout: 'gallery',
    unmutedParticipants: new Set(['1', '2']),
    cameraOnParticipants: new Set(['1']),
    speakingParticipants: new Set(['2']),
  },
};

/**
 * Gallery layout with 4 participants
 */
export const GalleryFour: Story = {
  args: {
    participants: mockParticipants.slice(0, 4),
    currentUserId: '1',
    layout: 'gallery',
    unmutedParticipants: new Set(['1', '2', '3']),
    cameraOnParticipants: new Set(['1', '2', '4']),
    raisingHandParticipants: new Set(['3']),
    speakingParticipants: new Set(['2']),
  },
};

/**
 * Gallery layout with 6 participants
 */
export const GallerySix: Story = {
  args: {
    participants: mockParticipants,
    currentUserId: '1',
    layout: 'gallery',
    unmutedParticipants: new Set(['1', '2', '3', '4', '5']),
    cameraOnParticipants: new Set(['1', '2', '3', '5', '6']),
    sharingScreenParticipants: new Set(['4']),
    raisingHandParticipants: new Set(['3', '5']),
    speakingParticipants: new Set(['2']),
  },
};

/**
 * Gallery layout with many participants (10+)
 */
export const GalleryMany: Story = {
  args: {
    participants: [
      ...mockParticipants,
      { id: '7', username: 'George Wilson', role: 'participant' },
      { id: '8', username: 'Helen Clark', role: 'participant' },
      { id: '9', username: 'Ian Martinez', role: 'participant' },
      { id: '10', username: 'Jane Cooper', role: 'participant' },
      { id: '11', username: 'Kevin Brown', role: 'participant' },
      { id: '12', username: 'Laura White', role: 'participant' },
    ],
    currentUserId: '1',
    layout: 'gallery',
    unmutedParticipants: new Set(['1', '2', '3', '4', '5', '6', '7', '8']),
    cameraOnParticipants: new Set(['1', '2', '4', '6', '8', '10', '12']),
    speakingParticipants: new Set(['3', '7']),
  },
};

/**
 * Speaker layout with featured participant
 */
export const SpeakerLayout: Story = {
  args: {
    participants: mockParticipants,
    currentUserId: '1',
    layout: 'speaker',
    pinnedParticipantId: '2',
    unmutedParticipants: new Set(['1', '2', '3', '4']),
    cameraOnParticipants: new Set(['1', '2', '3', '4', '5']),
    speakingParticipants: new Set(['2']),
  },
};

/**
 * Speaker layout with screen sharing participant
 */
export const SpeakerScreenShare: Story = {
  args: {
    participants: mockParticipants,
    currentUserId: '1',
    layout: 'speaker',
    unmutedParticipants: new Set(['1', '2', '3', '4']),
    cameraOnParticipants: new Set(['1', '2', '3', '4']),
    sharingScreenParticipants: new Set(['3']),
  },
};

/**
 * Sidebar layout with featured participant
 */
export const SidebarLayout: Story = {
  args: {
    participants: mockParticipants,
    currentUserId: '1',
    layout: 'sidebar',
    pinnedParticipantId: '2',
    unmutedParticipants: new Set(['1', '2', '3', '4', '5']),
    cameraOnParticipants: new Set(['1', '2', '3', '5']),
    speakingParticipants: new Set(['2']),
    raisingHandParticipants: new Set(['4']),
  },
};

/**
 * Sidebar layout with active speaker
 */
export const SidebarActiveSpeaker: Story = {
  args: {
    participants: mockParticipants,
    currentUserId: '1',
    layout: 'sidebar',
    unmutedParticipants: new Set(['1', '2', '3', '4', '5', '6']),
    cameraOnParticipants: new Set(['1', '2', '3', '4', '5', '6']),
    speakingParticipants: new Set(['3']),
    raisingHandParticipants: new Set(['5']),
  },
};

/**
 * Interactive example with pin functionality
 */
export const Interactive: Story = {
  render: (args) => {
    const [pinnedId, setPinnedId] = React.useState<string | null>(null);
    
    return (
      <div className="h-screen w-screen bg-gray-900">
        <ParticipantGrid
          {...args}
          pinnedParticipantId={pinnedId}
          onPinParticipant={(id) => {
            setPinnedId(pinnedId === id ? null : id);
          }}
        />
      </div>
    );
  },
  args: {
    participants: mockParticipants,
    currentUserId: '1',
    layout: 'gallery',
    unmutedParticipants: new Set(['1', '2', '3', '4', '5', '6']),
    cameraOnParticipants: new Set(['1', '2', '3', '4', '5', '6']),
    speakingParticipants: new Set(['2']),
  },
};

import * as React from 'react';

/**
 * Layout comparison showing all three modes
 */
export const LayoutComparison: Story = {
  render: () => {
    const layouts: GridLayout[] = ['gallery', 'speaker', 'sidebar'];
    
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 bg-gray-900 h-screen">
        {layouts.map((layout) => (
          <div key={layout} className="border border-gray-700 rounded-lg overflow-hidden flex flex-col">
            <div className="p-2 bg-gray-800 text-white text-sm font-semibold text-center">
              {layout.charAt(0).toUpperCase() + layout.slice(1)} Layout
            </div>
            <div className="flex-1">
              <ParticipantGrid
                participants={mockParticipants.slice(0, 4)}
                currentUserId="1"
                layout={layout}
                unmutedParticipants={new Set(['1', '2', '3'])}
                cameraOnParticipants={new Set(['1', '2', '3', '4'])}
                speakingParticipants={new Set(['2'])}
              />
            </div>
          </div>
        ))}
      </div>
    );
  },
};
