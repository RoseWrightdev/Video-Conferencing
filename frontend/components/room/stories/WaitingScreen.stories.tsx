import type { Meta, StoryObj } from '@storybook/react';
import { WaitingScreen } from '../WaitingScreen';

/**
 * WaitingScreen displays a friendly interface for users in the waiting room.
 * 
 * Features:
 * - Room name and user display
 * - Connection status indicators
 * - Animated loading state
 * - Reconnection awareness
 * - Frosted glass design
 */
const meta: Meta<typeof WaitingScreen> = {
  title: 'Room/WaitingScreen',
  component: WaitingScreen,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A waiting room screen shown to users awaiting host approval to join a video conference.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    roomName: {
      control: 'text',
      description: 'Name of the room (optional)',
    },
    username: {
      control: 'text',
      description: 'Display name of the waiting user',
    },
    isConnected: {
      control: 'boolean',
      description: 'Whether WebSocket is connected',
    },
    isReconnecting: {
      control: 'boolean',
      description: 'Whether actively reconnecting',
    },
  },
};

export default meta;
type Story = StoryObj<typeof WaitingScreen>;

/**
 * Default waiting screen with room name
 */
export const Default: Story = {
  args: {
    roomName: 'Team Standup',
    username: 'Alice Johnson',
    isConnected: true,
    isReconnecting: false,
  },
};

/**
 * Waiting screen without room name
 */
export const NoRoomName: Story = {
  args: {
    roomName: null,
    username: 'Bob Smith',
    isConnected: true,
    isReconnecting: false,
  },
};

/**
 * Disconnected state
 */
export const Disconnected: Story = {
  args: {
    roomName: 'Marketing Review',
    username: 'Charlie Brown',
    isConnected: false,
    isReconnecting: false,
  },
};

/**
 * Reconnecting state
 */
export const Reconnecting: Story = {
  args: {
    roomName: 'Product Demo',
    username: 'Diana Prince',
    isConnected: false,
    isReconnecting: true,
  },
};

/**
 * Guest user without name
 */
export const GuestUser: Story = {
  args: {
    roomName: 'Weekly Sync',
    username: null,
    isConnected: true,
    isReconnecting: false,
  },
};

/**
 * Long room name
 */
export const LongRoomName: Story = {
  args: {
    roomName: 'Q4 Strategic Planning and Budget Review Session',
    username: 'Emily Watson',
    isConnected: true,
    isReconnecting: false,
  },
};

/**
 * Connection recovery flow
 */
export const ConnectionRecovery: Story = {
  args: {
    roomName: 'Engineering Standup',
    username: 'Frank Miller',
    isConnected: true,
    isReconnecting: false,
  },
  play: async ({ canvasElement }) => {
    // This could demonstrate connection state transitions
    // in an interactive story
  },
};
