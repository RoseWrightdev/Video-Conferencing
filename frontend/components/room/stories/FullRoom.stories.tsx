import type { Meta, StoryObj } from '@storybook/react';
import { ActiveRoom } from '../ActiveRoom';
import { useRoomStore } from '@/store/useRoomStore';
import { useEffect } from 'react';
import type { Participant } from '@/store/types';

/**
 * Story for the full Active Room experience.
 * Uses a decorator to seed the Zustand store with mock data.
 */
const meta: Meta<typeof ActiveRoom> = {
    title: 'Room/ActiveRoom',
    component: ActiveRoom,
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component: 'The main interactive room interface showing video grid, controls, and side panels.',
            },
        },
    },
    args: {
        permissionsGranted: true,
        refreshDevices: async () => console.log('refreshDevices called'),
    },
};

export default meta;

type Story = StoryObj<typeof ActiveRoom>;

// Mock Data
const mockParticipants: Participant[] = [
    { id: '1', username: 'Me (Host)', role: 'host' },
    { id: '2', username: 'Alice', role: 'participant' },
    { id: '3', username: 'Bob', role: 'participant' },
    { id: '4', username: 'Charlie', role: 'participant' },
];

// Helper to seed store
const StoreSeeder = ({
    children,
    state
}: {
    children: React.ReactNode;
    state: Partial<ReturnType<typeof useRoomStore.getState>>
}) => {
    useEffect(() => {
        useRoomStore.setState(state);
    }, [state]);

    return <>{children}</>;
};

export const Default: Story = {
    decorators: [
        (Story) => (
            <StoreSeeder
                state={{
                    participants: new Map(mockParticipants.map(p => [p.id, p])),
                    currentUserId: '1',
                    localParticipant: mockParticipants[0],
                    isJoined: true,
                    isWaitingRoom: false,
                    gridLayout: 'gallery',
                    unmutedParticipants: new Set(['1', '2']),
                    cameraOnParticipants: new Set(['1', '2', '3']),
                    isChatPanelOpen: false,
                    isParticipantsPanelOpen: false,
                }}
            >
                <Story />
            </StoreSeeder>
        ),
    ],
};

export const WithChatOpen: Story = {
    decorators: [
        (Story) => (
            <StoreSeeder
                state={{
                    participants: new Map(mockParticipants.map(p => [p.id, p])),
                    currentUserId: '1',
                    localParticipant: mockParticipants[0],
                    isJoined: true,
                    gridLayout: 'gallery',
                    isChatPanelOpen: true,
                    messages: [
                        { id: '1', participantId: '2', username: 'Alice', content: 'Hello everyone!', timestamp: new Date(Date.now() - 10000), type: 'text' },
                        { id: '2', participantId: '1', username: 'Me', content: 'Hi Alice!', timestamp: new Date(Date.now() - 5000), type: 'text' },
                    ],
                }}
            >
                <Story />
            </StoreSeeder>
        ),
    ],
};

export const WithParticipantsPanel: Story = {
    decorators: [
        (Story) => (
            <StoreSeeder
                state={{
                    participants: new Map(mockParticipants.map(p => [p.id, p])),
                    currentUserId: '1',
                    localParticipant: mockParticipants[0],
                    isJoined: true,
                    gridLayout: 'gallery',
                    isParticipantsPanelOpen: true,
                }}
            >
                <Story />
            </StoreSeeder>
        ),
    ],
};

export const SpeakerLayout: Story = {
    decorators: [
        (Story) => (
            <StoreSeeder
                state={{
                    participants: new Map(mockParticipants.map(p => [p.id, p])),
                    currentUserId: '1',
                    localParticipant: mockParticipants[0],
                    isJoined: true,
                    gridLayout: 'speaker',
                    pinnedParticipantId: '2',
                    unmutedParticipants: new Set(['2']),

                }}
            >
                <Story />
            </StoreSeeder>
        ),
    ],
};
