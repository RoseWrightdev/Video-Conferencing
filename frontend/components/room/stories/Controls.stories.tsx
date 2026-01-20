import ControlBar from "@/components/room/components/Controls";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useRoomStore } from "@/store/useRoomStore";
import { RoomStoreState } from "@/store/types";

// Helper to seed store for stories
const StoreDecorator = ({ initialState, children }: { initialState: Partial<RoomStoreState>; children: React.ReactNode }) => {
    useEffect(() => {
        if (initialState) {
            useRoomStore.setState(initialState);
        }
    }, [initialState]);
    return <>{children}</>;
};

const meta: Meta<typeof ControlBar> = {
    title: "Room/ControlBar",
    component: ControlBar,
    tags: ["autodocs"],
    decorators: [
        (Story, context) => (
            <TooltipProvider>
                <div className="bg-gray-900 min-h-[200px] flex items-end p-4">
                    <StoreDecorator initialState={context.args as unknown as Partial<RoomStoreState>}>
                        <Story />
                    </StoreDecorator>
                </div>
            </TooltipProvider>
        ),
    ],
    parameters: {
        docs: {
            description: {
                component: "Control bar component. Manages media controls, room settings, and participant actions via global store.",
            },
        },
    },
    argTypes: {
        // Hide store state args from controls to avoid clutter, or leave them for tinkering
        isAudioEnabled: { control: 'boolean' },
        isVideoEnabled: { control: 'boolean' },
        isScreenSharing: { control: 'boolean' },
        currentUserId: { control: 'text' },
        unreadCount: { control: 'number' },
        isCaptionsEnabled: { control: 'boolean' },
    } as any,
};

export default meta;

type Story = StoryObj<typeof ControlBar & Partial<RoomStoreState>>;

export const Default: Story = {
    args: {
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        isHost: false,
        unreadCount: 0,
    },
};

export const Host: Story = {
    args: {
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        isHost: true,
    },
};

export const Muted: Story = {
    args: {
        isAudioEnabled: false,
        isVideoEnabled: true,
        isScreenSharing: false,
    },
};

export const VideoOff: Story = {
    args: {
        isAudioEnabled: true,
        isVideoEnabled: false,
        isScreenSharing: false,
    },
};

export const ScreenSharing: Story = {
    args: {
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: true,
    },
};

export const HandRaised: Story = {
    args: {
        isAudioEnabled: false,
        isVideoEnabled: true,
        isHandRaised: true, // Note: Controls.tsx derives this from raisingHandParticipants map
    },
    render: (args) => {
        // Custom render to set up complex state like Maps/Sets
        useEffect(() => {
            const state: Partial<RoomStoreState> = { ...args };
            // Simulate hand raised
            state.currentUserId = 'me';
            state.raisingHandParticipants = new Set(['me']);
            useRoomStore.setState(state);
        }, []);
        return <ControlBar />;
    }
};

export const UnreadMessages: Story = {
    args: {
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        unreadCount: 5,
    },
};

/**
 * Interactive playground to test all control bar features.
 * Toggle media controls, raise hand, and see real-time state updates.
 */
export const Interactive: Story = {
    render: () => {
        const state = useRoomStore();

        return (
            <div className="space-y-6">
                <div className="bg-gray-900 p-8 rounded-lg">
                    <ControlBar />
                </div>

                <div className="p-6 bg-white/80 frosted-3 rounded-lg border space-y-4">
                    <h3 className="text-lg font-semibold">Current Store State</h3>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="font-medium">Audio</p>
                            <p className={state.isAudioEnabled ? "text-green-600" : "text-gray-500"}>
                                {state.isAudioEnabled ? "✓ Enabled" : "✗ Muted"}
                            </p>
                        </div>

                        <div>
                            <p className="font-medium">Video</p>
                            <p className={state.isVideoEnabled ? "text-blue-600" : "text-red-500"}>
                                {state.isVideoEnabled ? "✓ Enabled" : "✗ Disabled"}
                            </p>
                        </div>

                        <div>
                            <p className="font-medium">Screen Share</p>
                            <p className={state.isScreenSharing ? "text-green-600" : "text-gray-500"}>
                                {state.isScreenSharing ? "✓ Sharing" : "✗ Not sharing"}
                            </p>
                        </div>

                        <div>
                            <p className="font-medium">Chat</p>
                            <p className="text-blue-600">
                                {state.unreadCount} unread
                            </p>
                        </div>
                    </div>

                    <div className="pt-4 border-t space-y-2">
                        <p className="text-xs text-gray-600">
                            💡 The component updates the global store directly.
                        </p>
                    </div>
                </div>
            </div>
        );
    },
};

