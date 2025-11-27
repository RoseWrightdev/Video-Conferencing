import ChatInput from "@/components/chat-panel/components/ChatInput";
import { createMockChatDependencies } from "../factories/createChatDependencies";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";

const meta: Meta<typeof ChatInput> = {
  title: "Chat/ChatInput",
  component: ChatInput,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "Chat input component with dependency injection for sending messages.",
      },
    },
  },
  argTypes: {
    dependencies: {
      control: false,
      description: "Chat dependencies for sending messages",
    },
    disabled: {
      control: "boolean",
      description: "Whether the input is disabled",
    },
    placeholder: {
      control: "text", 
      description: "Placeholder text for the input",
    },
  },
};

export default meta;

type Story = StoryObj<typeof ChatInput>;

// Create base dependencies for all stories
const baseDependencies = createMockChatDependencies({
  messages: [],
  currentUserId: "user-1",
});

export const Default: Story = {
  args: {
    dependencies: baseDependencies,
    disabled: false,
    placeholder: "Type your message...",
  },
};

export const Disabled: Story = {
  args: {
    dependencies: baseDependencies,
    disabled: true,
    placeholder: "Chat is disabled",
  },
};

export const CustomPlaceholder: Story = {
  args: {
    dependencies: baseDependencies,
    disabled: false,
    placeholder: "Ask a question or share your thoughts...",
  },
};

export const PrivateChat: Story = {
  args: {
    dependencies: baseDependencies,
    disabled: false,
    placeholder: "Send a private message...",
  },
};
