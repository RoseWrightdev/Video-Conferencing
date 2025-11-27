import { Badge } from "@/components/ui/badge";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { CheckIcon, XIcon, AlertCircleIcon, InfoIcon } from "lucide-react";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: 
          "A versatile badge component for displaying status indicators, labels, and metadata. " +
          "Supports multiple variants, icons, and can be used as a clickable link. " +
          "Perfect for tags, status indicators, and categorization.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline"],
      description: "Visual style variant",
    },
    asChild: {
      control: "boolean",
      description: "Render as a child component",
    },
  },
};

export default meta;

type Story = StoryObj<typeof Badge>;

/**
 * Default primary badge.
 */
export const Default: Story = {
  args: {
    children: "Badge",
  },
};

/**
 * Secondary badge variant.
 */
export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary",
  },
};

/**
 * Destructive badge for errors or warnings.
 */
export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "Destructive",
  },
};

/**
 * Outline badge variant.
 */
export const Outline: Story = {
  args: {
    variant: "outline",
    children: "Outline",
  },
};

/**
 * All badge variants displayed together.
 */
export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

/**
 * Badges with icons.
 */
export const WithIcons: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Badge>
        <CheckIcon />
        Success
      </Badge>
      <Badge variant="destructive">
        <XIcon />
        Error
      </Badge>
      <Badge variant="secondary">
        <AlertCircleIcon />
        Warning
      </Badge>
      <Badge variant="outline">
        <InfoIcon />
        Info
      </Badge>
    </div>
  ),
};

/**
 * Badge as a clickable link.
 */
export const AsLink: Story = {
  render: () => (
    <div className="flex gap-2">
      <Badge asChild>
        <a href="#" className="cursor-pointer">
          Clickable
        </a>
      </Badge>
      <Badge variant="secondary" asChild>
        <a href="#" className="cursor-pointer">
          Link
        </a>
      </Badge>
    </div>
  ),
};

/**
 * Status badges for different states.
 */
export const StatusBadges: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Badge className="bg-green-500 text-white border-transparent">
        <CheckIcon />
        Active
      </Badge>
      <Badge className="bg-yellow-500 text-white border-transparent">
        <AlertCircleIcon />
        Pending
      </Badge>
      <Badge variant="destructive">
        <XIcon />
        Inactive
      </Badge>
      <Badge variant="outline">
        Draft
      </Badge>
    </div>
  ),
};

/**
 * Role badges for participants.
 */
export const RoleBadges: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Badge className="bg-purple-600 text-white border-transparent">Host</Badge>
      <Badge className="bg-blue-600 text-white border-transparent">Moderator</Badge>
      <Badge variant="secondary">Participant</Badge>
      <Badge variant="outline">Guest</Badge>
    </div>
  ),
};

/**
 * Notification count badges.
 */
export const CountBadges: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <div className="relative">
        <div className="size-10 bg-gray-200 rounded-full" />
        <Badge className="absolute -top-1 -right-1 size-5 p-0 justify-center">
          3
        </Badge>
      </div>
      
      <div className="relative">
        <div className="size-10 bg-gray-200 rounded-full" />
        <Badge variant="destructive" className="absolute -top-1 -right-1 size-5 p-0 justify-center">
          9
        </Badge>
      </div>
      
      <div className="relative">
        <div className="size-10 bg-gray-200 rounded-full" />
        <Badge className="absolute -top-1 -right-1 px-1.5 py-0 justify-center text-[10px]">
          99+
        </Badge>
      </div>
    </div>
  ),
};
