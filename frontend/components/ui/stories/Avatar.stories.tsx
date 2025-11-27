import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";

const meta: Meta<typeof Avatar> = {
  title: "UI/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: 
          "A circular avatar component built with Radix UI. Displays user profile images with automatic fallback support when images fail to load. " +
          "Perfect for user profiles, participant lists, and chat interfaces.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof Avatar>;

/**
 * Avatar with an image loaded successfully.
 */
export const WithImage: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  ),
};

/**
 * Avatar showing fallback when image fails to load or is not provided.
 */
export const WithFallback: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="/invalid-image.jpg" alt="@user" />
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  ),
};

/**
 * Avatar with initials fallback and custom background.
 */
export const WithInitials: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback className="bg-blue-500 text-white">
        RW
      </AvatarFallback>
    </Avatar>
  ),
};

/**
 * Different avatar sizes.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar className="size-6">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback className="text-xs">CN</AvatarFallback>
      </Avatar>
      <Avatar className="size-8">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar className="size-10">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar className="size-12">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
      <Avatar className="size-16">
        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <AvatarFallback>CN</AvatarFallback>
      </Avatar>
    </div>
  ),
};

/**
 * Avatar group showing multiple participants.
 */
export const Group: Story = {
  render: () => (
    <div className="flex -space-x-2">
      <Avatar className="ring-2 ring-background">
        <AvatarImage src="https://github.com/shadcn.png" alt="User 1" />
        <AvatarFallback>U1</AvatarFallback>
      </Avatar>
      <Avatar className="ring-2 ring-background">
        <AvatarFallback className="bg-green-500 text-white">U2</AvatarFallback>
      </Avatar>
      <Avatar className="ring-2 ring-background">
        <AvatarFallback className="bg-blue-500 text-white">U3</AvatarFallback>
      </Avatar>
      <Avatar className="ring-2 ring-background">
        <AvatarFallback className="bg-purple-500 text-white">U4</AvatarFallback>
      </Avatar>
      <Avatar className="ring-2 ring-background">
        <AvatarFallback className="bg-gray-500 text-white">+5</AvatarFallback>
      </Avatar>
    </div>
  ),
};

/**
 * Avatar with status indicator.
 */
export const WithStatus: Story = {
  render: () => (
    <div className="flex gap-6">
      <div className="relative">
        <Avatar>
          <AvatarImage src="https://github.com/shadcn.png" alt="Online" />
          <AvatarFallback>ON</AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 block size-2.5 rounded-full bg-green-500 ring-2 ring-background" />
      </div>
      
      <div className="relative">
        <Avatar>
          <AvatarFallback className="bg-blue-500 text-white">AW</AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 block size-2.5 rounded-full bg-yellow-500 ring-2 ring-background" />
      </div>
      
      <div className="relative">
        <Avatar>
          <AvatarFallback className="bg-gray-500 text-white">OF</AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 block size-2.5 rounded-full bg-gray-400 ring-2 ring-background" />
      </div>
    </div>
  ),
};

/**
 * Avatar colors for different users.
 */
export const ColorVariants: Story = {
  render: () => (
    <div className="flex gap-4">
      <Avatar>
        <AvatarFallback className="bg-red-500 text-white">RD</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-orange-500 text-white">OR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-yellow-500 text-white">YL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-green-500 text-white">GR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-blue-500 text-white">BL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-purple-500 text-white">PR</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-pink-500 text-white">PK</AvatarFallback>
      </Avatar>
    </div>
  ),
};
