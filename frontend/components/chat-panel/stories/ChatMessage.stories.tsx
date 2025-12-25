import ChatMessage from "@/components/chat-panel/components/ChatMessage";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { type ChatDependencies } from "@/components/chat-panel/types/ChatDependencies";

// Helper to create mock dependencies
const createMockDependencies = (isHost: boolean = false): ChatDependencies => ({
  chatService: {
    messages: [],
    sendChat: () => { },
    closeChat: () => { },
  },
  participantService: {
    getParticipant: (id: string) => ({
      id,
      username: "User",
      role: isHost ? "host" as const : "participant" as const
    })
  },
  roomService: {
    currentUserId: "1"
  }
});

const meta: Meta<typeof ChatMessage> = {
  title: "Chat/ChatMessage",
  component: ChatMessage,
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof ChatMessage>;

export const Default: Story = {
  args: {
    chatMessage: {
      username: "User1",
      timestamp: new Date(),
      content: "Hello, this is a chat message! Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla eleifend eget purus ut lacinia. Phasellus et elementum magna. Suspendisse tempus magna ac quam tincidunt, et facilisis leo cursus. Maecenas augue dui, hendrerit.",
      id: "msg-1",
      participantId: "1",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies()
  },
};

export const FromOtherUser: Story = {
  args: {
    chatMessage: {
      username: "Alice",
      timestamp: new Date(),
      content: "Hi everyone! How's the meeting going?",
      id: "msg-2",
      participantId: "2",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies()
  },
};

export const LongMessage: Story = {
  args: {
    chatMessage: {
      username: "Bob",
      timestamp: new Date(),
      content: "This is a very long message that should test how the component handles text wrapping and layout when dealing with extensive content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. should test how the component handles text wrapping and layout when dealing with extensive content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitationshould test how the component handles text wrapping and layout when dealing with extensive content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation",
      id: "msg-3",
      participantId: "3",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const SystemMessage: Story = {
  args: {
    chatMessage: {
      username: "System",
      timestamp: new Date(),
      content: "Alice has joined the room",
      id: "msg-4",
      participantId: "system",
      type: "system"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const PrivateMessage: Story = {
  args: {
    chatMessage: {
      username: "User1",
      timestamp: new Date(),
      content: "Hey Alice, can we talk privately?",
      id: "msg-4",
      participantId: "private",
      type: "private"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const HostMessage: Story = {
  args: {
    chatMessage: {
      username: "Alice",
      timestamp: new Date(),
      content: "Welcome everyone! Let's start the meeting.",
      id: "msg-5",
      participantId: "2",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(true),
  },
};

export const HostPrivateMessage: Story = {
  args: {
    chatMessage: {
      username: "Alice",
      timestamp: new Date(),
      content: "This is a private message from the host.",
      id: "msg-6",
      participantId: "2",
      type: "private"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(true),
  },
};

export const CurrentUserHost: Story = {
  args: {
    chatMessage: {
      username: "You",
      timestamp: new Date(),
      content: "I'm the host of this meeting!",
      id: "msg-7",
      participantId: "1",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(true),
  },
};

export const ShortMessage: Story = {
  args: {
    chatMessage: {
      username: "Bob",
      timestamp: new Date(),
      content: "👍",
      id: "msg-8",
      participantId: "3",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const EmptyMessage: Story = {
  args: {
    chatMessage: {
      username: "Charlie",
      timestamp: new Date(),
      content: "",
      id: "msg-9",
      participantId: "4",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MessageWithEmojis: Story = {
  args: {
    chatMessage: {
      username: "Diana",
      timestamp: new Date(),
      content: "Great presentation! 🎉 Thanks for sharing your insights 💡 Looking forward to the next one! 🚀",
      id: "msg-10",
      participantId: "5",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MessageWithNumbers: Story = {
  args: {
    chatMessage: {
      username: "Eve",
      timestamp: new Date(),
      content: "Here are the metrics: Q1: 15%, Q2: 23%, Q3: 31%, Q4: 42%. Total growth: 111%",
      id: "msg-11",
      participantId: "6",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MessageWithSpecialCharacters: Story = {
  args: {
    chatMessage: {
      username: "Frank",
      timestamp: new Date(),
      content: "Check this out: @everyone! Visit https://example.com & email us at test@domain.com (urgent!) #meeting",
      id: "msg-12",
      participantId: "7",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MessageWithLinks: Story = {
  args: {
    chatMessage: {
      username: "Sarah",
      timestamp: new Date(),
      content: "Here are some useful resources: https://github.com/facebook/react and https://nextjs.org/docs for documentation.",
      id: "msg-16",
      participantId: "11",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MessageWithEmail: Story = {
  args: {
    chatMessage: {
      username: "Mike",
      timestamp: new Date(),
      content: "For support issues, please contact support@company.com or reach out to admin@example.org",
      id: "msg-17",
      participantId: "12",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MessageWithMixedContent: Story = {
  args: {
    chatMessage: {
      username: "Lisa",
      timestamp: new Date(),
      content: "Meeting notes are available at https://docs.google.com/document/123. Questions? Email me at lisa.jones@company.com or visit our help center at https://help.company.com",
      id: "msg-18",
      participantId: "13",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MessageWithEveryoneMention: Story = {
  args: {
    chatMessage: {
      username: "Alex",
      timestamp: new Date(),
      content: "Hey @everyone! The meeting will start in 5 minutes. Please join the call.",
      id: "msg-19",
      participantId: "14",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MessageWithUserMentions: Story = {
  args: {
    chatMessage: {
      username: "Jordan",
      timestamp: new Date(),
      content: "Thanks @alice and @bob.smith for the great feedback! @everyone should review the document.",
      id: "msg-20",
      participantId: "15",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MessageWithAllFeatures: Story = {
  args: {
    chatMessage: {
      username: "Taylor",
      timestamp: new Date(),
      content: "@everyone please check https://github.com/company/project for updates. Contact @admin or email support@company.com if you need help!",
      id: "msg-21",
      participantId: "16",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(true),
  },
};

export const VeryLongUsernameMessage: Story = {
  args: {
    chatMessage: {
      username: "VeryLongUsernameExample",
      timestamp: new Date(),
      content: "Testing how the layout handles long usernames.",
      id: "msg-13",
      participantId: "8",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const OldTimestamp: Story = {
  args: {
    chatMessage: {
      username: "Grace",
      timestamp: new Date("2024-01-01T09:30:00"),
      content: "This message has an older timestamp.",
      id: "msg-14",
      participantId: "9",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};

export const MultilineMessage: Story = {
  args: {
    chatMessage: {
      username: "Henry",
      timestamp: new Date(),
      content: "This is line one.\nThis is line two.\nThis is line three.\nAnd this is line four with more content to test multiline rendering.",
      id: "msg-15",
      participantId: "10",
      type: "text"
    },
    currentUserId: "1",
    dependencies: createMockDependencies(),
  },
};