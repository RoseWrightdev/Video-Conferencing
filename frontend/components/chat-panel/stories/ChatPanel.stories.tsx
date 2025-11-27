import ChatPanel from "@/components/chat-panel/components/ChatPanel";
import { createMockChatDependencies } from "@/components/chat-panel/factories/createChatDependencies";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";

// Mock messages for different scenarios
const mockMessages = {
  empty: [],
  basic: [
    {
      id: "1",
      username: "Alice",
      timestamp: new Date("2024-01-01T10:00:00Z"),
      content: "Hello everyone!",
      participantId: "user-2",
      type: "text" as const,
    },
    {
      id: "2",
      username: "You",
      timestamp: new Date("2024-01-01T10:01:00Z"),
      content: "Hi Alice!",
      participantId: "user-1",
      type: "text" as const,
    },
  ],
  host: [
    {
      id: "1",
      username: "You",
      timestamp: new Date("2024-01-01T10:00:00Z"),
      content: "@everyone Welcome to the meeting!",
      participantId: "user-1",
      type: "text" as const,
    },
  ],
  private: [
    {
      id: "1",
      username: "Alice",
      timestamp: new Date("2024-01-01T10:00:00Z"),
      content: "This is a private message",
      participantId: "user-2",
      type: "private" as const,
    },
    {
      id: "2",
      username: "You",
      timestamp: new Date("2024-01-01T10:01:00Z"),
      content: "Got it, thanks!",
      participantId: "user-1",
      type: "private" as const,
    },
  ],
  system: [
    {
      id: "1",
      username: "System",
      timestamp: new Date("2024-01-01T10:00:00Z"),
      content: "Meeting room created",
      participantId: "system",
      type: "system" as const,
    },
    {
      id: "2",
      username: "System",
      timestamp: new Date("2024-01-01T10:01:00Z"),
      content: "Alice has joined the room",
      participantId: "system",
      type: "system" as const,
    },
  ],
  rich: [
    {
      id: "1",
      username: "Developer",
      timestamp: new Date("2024-01-01T10:00:00Z"),
      content: "Check out https://github.com/company/repo and email me at dev@company.com with feedback!",
      participantId: "user-2",
      type: "text" as const,
    },
    {
      id: "2",
      username: "You",
      timestamp: new Date("2024-01-01T10:01:00Z"),
      content: "@everyone great work! @alice please review this.",
      participantId: "user-1",
      type: "text" as const,
    },
  ],
  long: [
    {
      id: "1",
      username: "ProductManager",
      timestamp: new Date("2024-01-01T10:00:00Z"),
      content: "This is a very long message that demonstrates the scrolling and fade functionality. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
      participantId: "user-2",
      type: "text" as const,
    },
  ],
};

const meta: Meta<typeof ChatPanel> = {
  title: "Chat/ChatPanel",
  component: ChatPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Clean ChatPanel with pure dependency injection. All data comes from props, no hooks.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof ChatPanel>;

export const Empty: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.empty,
      currentUserId: "user-1",
    }),
  },
};

export const BasicMessages: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.basic,
      currentUserId: "user-1",
    }),
  },
};

export const HostMessages: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.host,
      currentUserId: "user-1",
      participants: {
        "user-1": { role: "host", username: "You" }
      }
    }),
  },
};

export const PrivateMessages: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.private,
      currentUserId: "user-1",
    }),
  },
};

export const SystemMessages: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.system,
      currentUserId: "user-1",
    }),
  },
};

export const RichContent: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.rich,
      currentUserId: "user-1",
    }),
  },
};

export const LongMessage: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.long,
      currentUserId: "user-1",
    }),
  },
};
