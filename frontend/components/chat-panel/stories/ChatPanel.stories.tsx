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
    layout: "fullscreen",
    docs: {
      description: {
        component: "Clean ChatPanel with pure dependency injection and frosted glass styling. All data comes from props, no hooks. Features backdrop-filter blur effects that shine on various backgrounds.",
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

/**
 * Frosted glass effect on dark gradient background.
 * Shows how the backdrop blur creates depth and separation.
 */
export const DarkGradient: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.basic,
      currentUserId: "user-1",
    }),
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen w-full bg-linear-to-br from-gray-900 via-purple-900 to-blue-900 flex items-center justify-center p-8">
        <Story />
      </div>
    ),
  ],
};

/**
 * Frosted glass on vibrant colorful background.
 * Demonstrates how the blur effect works with bright colors.
 */
export const VibrantBackground: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.rich,
      currentUserId: "user-1",
    }),
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen w-full bg-linear-to-br from-pink-500 via-orange-400 to-yellow-500 flex items-center justify-center p-8">
        <Story />
      </div>
    ),
  ],
};

/**
 * Frosted glass on cool blue background.
 * Shows professional, calm aesthetic with backdrop blur.
 */
export const CoolBlue: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.system,
      currentUserId: "user-1",
    }),
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen w-full bg-linear-to-br from-blue-600 via-cyan-500 to-teal-400 flex items-center justify-center p-8">
        <Story />
      </div>
    ),
  ],
};

/**
 * Frosted glass on image background.
 * Real-world scenario with textured background.
 */
export const ImageBackground: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.host,
      currentUserId: "user-1",
      participants: {
        "user-1": { role: "host", username: "You" }
      }
    }),
  },
  decorators: [
    (Story) => (
      <div 
        className="min-h-screen w-full flex items-center justify-center p-8"
        style={{
          backgroundImage: 'url("https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&q=80")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Story />
      </div>
    ),
  ],
};

/**
 * Frosted glass on geometric pattern.
 * Shows how blur effect interacts with sharp patterns.
 */
export const GeometricPattern: Story = {
  args: {
    dependencies: createMockChatDependencies({
      messages: mockMessages.private,
      currentUserId: "user-1",
    }),
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen w-full flex items-center justify-center p-8 bg-gray-900">
        <div className="absolute inset-0 opacity-30">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        <div className="relative z-10">
          <Story />
        </div>
      </div>
    ),
  ],
};

/**
 * Frosted glass comparison showcase.
 * Side-by-side view on different backgrounds to compare effects.
 */
export const FrostedShowcase: Story = {
  render: () => (
    <div className="min-h-screen w-full p-8 space-y-8">
      <div className="grid grid-cols-2 gap-8">
        {/* Dark Background */}
        <div className="bg-linear-to-br from-gray-900 to-gray-700 rounded-lg p-6 flex items-center justify-center min-h-[600px]">
          <ChatPanel dependencies={createMockChatDependencies({
            messages: mockMessages.basic,
            currentUserId: "user-1",
          })} />
        </div>
        
        {/* Bright Background */}
        <div className="bg-linear-to-br from-blue-400 to-purple-500 rounded-lg p-6 flex items-center justify-center min-h-[600px]">
          <ChatPanel dependencies={createMockChatDependencies({
            messages: mockMessages.basic,
            currentUserId: "user-1",
          })} />
        </div>
        
        {/* Warm Background */}
        <div className="bg-linear-to-br from-orange-400 to-red-500 rounded-lg p-6 flex items-center justify-center min-h-[600px]">
          <ChatPanel dependencies={createMockChatDependencies({
            messages: mockMessages.rich,
            currentUserId: "user-1",
          })} />
        </div>
        
        {/* Cool Background */}
        <div className="bg-linear-to-br from-teal-400 to-cyan-600 rounded-lg p-6 flex items-center justify-center min-h-[600px]">
          <ChatPanel dependencies={createMockChatDependencies({
            messages: mockMessages.rich,
            currentUserId: "user-1",
          })} />
        </div>
      </div>
    </div>
  ),
};
