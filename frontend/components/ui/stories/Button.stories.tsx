import { Button } from "@/components/ui/button";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { MailIcon, Loader2Icon, ChevronRightIcon } from "lucide-react";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: 
          "A flexible button component with multiple variants, sizes, and states. " +
          "Built with accessibility in mind and supports icons, loading states, and custom content. " +
          "Can be rendered as any element using the asChild prop.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
      description: "Visual style variant",
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
      description: "Button size",
    },
    disabled: {
      control: "boolean",
      description: "Disabled state",
    },
    asChild: {
      control: "boolean",
      description: "Render as a child component",
    },
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

/**
 * Default primary button.
 */
export const Default: Story = {
  args: {
    children: "Button",
  },
};

/**
 * Destructive button for dangerous actions.
 */
export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: "Delete",
  },
};

/**
 * Outline button variant.
 */
export const Outline: Story = {
  args: {
    variant: "outline",
    children: "Outline",
  },
};

/**
 * Secondary button variant.
 */
export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Secondary",
  },
};

/**
 * Ghost button for subtle actions.
 */
export const Ghost: Story = {
  args: {
    variant: "ghost",
    children: "Ghost",
  },
};

/**
 * Link-styled button.
 */
export const Link: Story = {
  args: {
    variant: "link",
    children: "Link",
  },
};

/**
 * All button variants.
 */
export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Button>Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

/**
 * Different button sizes.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

/**
 * Icon-only buttons.
 */
export const IconButtons: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button size="icon">
        <MailIcon />
      </Button>
      <Button variant="outline" size="icon">
        <MailIcon />
      </Button>
      <Button variant="destructive" size="icon">
        <MailIcon />
      </Button>
      <Button variant="ghost" size="icon">
        <MailIcon />
      </Button>
    </div>
  ),
};

/**
 * Buttons with icons and text.
 */
export const WithIcons: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Button>
        <MailIcon />
        Send Email
      </Button>
      <Button variant="outline">
        Continue
        <ChevronRightIcon />
      </Button>
      <Button variant="secondary">
        <MailIcon />
        Icon Left
      </Button>
    </div>
  ),
};

/**
 * Loading state buttons.
 */
export const Loading: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button disabled>
        <Loader2Icon className="animate-spin" />
        Please wait
      </Button>
      <Button variant="outline" disabled>
        <Loader2Icon className="animate-spin" />
        Loading
      </Button>
    </div>
  ),
};

/**
 * Disabled buttons.
 */
export const Disabled: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button disabled>Disabled</Button>
      <Button variant="outline" disabled>Disabled</Button>
      <Button variant="destructive" disabled>Disabled</Button>
    </div>
  ),
};

/**
 * Full width button.
 */
export const FullWidth: Story = {
  render: () => (
    <Button className="w-full">Full Width Button</Button>
  ),
};

/**
 * Button as a link using asChild.
 */
export const AsLink: Story = {
  render: () => (
    <Button asChild>
      <a href="#" className="cursor-pointer">
        Link Button
      </a>
    </Button>
  ),
};
