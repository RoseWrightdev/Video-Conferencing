import { CaptionOverlay } from "../components/CaptionOverlay";
import { type Meta, type StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { useRoomStore } from "@/store/useRoomStore";
import { RoomStoreState } from "@/store/types";

// Helper to seed store for stories
const StoreDecorator = ({ initialState, children }: { initialState: Partial<RoomStoreState>; children: React.ReactNode }) => {
    useEffect(() => {
        // Reset specific slices to avoid pollution
        useRoomStore.setState({
            captions: [],
            isCaptionsEnabled: false,
            ...initialState
        });
    }, [initialState]);
    return <>{children}</>;
};

const meta: Meta<typeof CaptionOverlay> = {
    title: "Room/CaptionOverlay",
    component: CaptionOverlay,
    tags: ["autodocs"],
    decorators: [
        (Story, context) => (
            <div className="relative w-full h-[400px] bg-gray-900 overflow-hidden border border-gray-700 rounded-lg">
                <img
                    src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2070&auto=format&fit=crop"
                    alt="Background"
                    className="absolute inset-0 w-full h-full object-cover opacity-50"
                />
                <StoreDecorator initialState={context.args as unknown as Partial<RoomStoreState>}>
                    <Story />
                </StoreDecorator>
            </div>
        ),
    ],
    parameters: {
        docs: {
            description: {
                component: "Overlay component that displays live captions at the bottom of the video feed.",
            },
            story: {
                inline: false,
            },
        },
    },
};

export default meta;

type Story = StoryObj<typeof CaptionOverlay & Partial<RoomStoreState>>;

// Mock participants for stories
const mockParticipants = new Map([
    ["1", { id: "1", username: "Rose", role: "host" } as any],
    ["2", { id: "2", username: "Dave", role: "participant" } as any],
    ["3", { id: "3", username: "Alice", role: "participant" } as any]
]);

export const Default: Story = {
    args: {
        isCaptionsEnabled: true,
        participants: mockParticipants,
        captions: [
            {
                sessionId: "1",
                text: "Hello everyone, welcome to the meeting.",
                isFinal: true,
                confidence: 0.98,
                timestamp: Date.now() - 5000
            },
            {
                sessionId: "2",
                text: "We are discussing the new frontend architecture.",
                isFinal: false, // Interim result
                confidence: 0.85,
                timestamp: Date.now()
            }
        ],
    } as any,
};

export const Disabled: Story = {
    args: {
        isCaptionsEnabled: false,
        participants: mockParticipants,
        captions: [
            { sessionId: "1", text: "You should not see this.", isFinal: true, confidence: 1, timestamp: Date.now() }
        ],
    } as any,
};

export const LongText: Story = {
    args: {
        isCaptionsEnabled: true,
        participants: mockParticipants,
        captions: [
            {
                sessionId: "3",
                text: "This is a much longer sentence to test how the caption overlay handles wrapping text or multiple lines when the speaker processes a complex thought spanning many words.",
                isFinal: true,
                confidence: 0.95,
                timestamp: Date.now()
            }
        ],
    } as any,
};
