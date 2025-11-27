import { Input } from "@/components/ui/input";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { SearchIcon, MailIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: 
          "A styled input component with support for various input types, states, and accessibility features. " +
          "Includes focus states, validation states, and file input support. " +
          "Built with Tailwind CSS and fully customizable.",
      },
    },
  },
  argTypes: {
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "search", "tel", "url", "date", "time"],
      description: "Input type",
    },
    placeholder: {
      control: "text",
      description: "Placeholder text",
    },
    disabled: {
      control: "boolean",
      description: "Disabled state",
    },
  },
};

export default meta;

type Story = StoryObj<typeof Input>;

/**
 * Default text input.
 */
export const Default: Story = {
  args: {
    placeholder: "Enter text...",
  },
};

/**
 * Email input with type validation.
 */
export const Email: Story = {
  args: {
    type: "email",
    placeholder: "Enter your email",
  },
};

/**
 * Password input.
 */
export const Password: Story = {
  args: {
    type: "password",
    placeholder: "Enter password",
  },
};

/**
 * Search input.
 */
export const Search: Story = {
  args: {
    type: "search",
    placeholder: "Search...",
  },
};

/**
 * Number input.
 */
export const Number: Story = {
  args: {
    type: "number",
    placeholder: "Enter a number",
  },
};

/**
 * Disabled input.
 */
export const Disabled: Story = {
  args: {
    placeholder: "Disabled input",
    disabled: true,
    value: "This input is disabled",
  },
};

/**
 * Input with value.
 */
export const WithValue: Story = {
  args: {
    value: "Input with value",
  },
};

/**
 * All input types.
 */
export const AllTypes: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <Input type="text" placeholder="Text input" />
      <Input type="email" placeholder="Email input" />
      <Input type="password" placeholder="Password input" />
      <Input type="search" placeholder="Search input" />
      <Input type="number" placeholder="Number input" />
      <Input type="tel" placeholder="Phone input" />
      <Input type="url" placeholder="URL input" />
      <Input type="date" />
      <Input type="time" />
    </div>
  ),
};

/**
 * Input with label.
 */
export const WithLabel: Story = {
  render: () => (
    <div className="space-y-2 max-w-md">
      <label htmlFor="name" className="text-sm font-medium">
        Name
      </label>
      <Input id="name" placeholder="Enter your name" />
    </div>
  ),
};

/**
 * Input with error state.
 */
export const WithError: Story = {
  render: () => (
    <div className="space-y-2 max-w-md">
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <Input 
        id="email" 
        type="email" 
        placeholder="Enter your email"
        aria-invalid="true"
      />
      <p className="text-sm text-destructive">Please enter a valid email address</p>
    </div>
  ),
};

/**
 * Input with icon using wrapper.
 */
export const WithIcon: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search..." />
      </div>
      
      <div className="relative">
        <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="pl-9" type="email" placeholder="Email address" />
      </div>
    </div>
  ),
};

/**
 * Password input with toggle visibility.
 */
export const PasswordToggle: Story = {
  render: () => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="space-y-2 max-w-md">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <div className="relative">
          <Input 
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter password"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </button>
        </div>
      </div>
    );
  },
};

/**
 * File input.
 */
export const File: Story = {
  render: () => (
    <div className="space-y-2 max-w-md">
      <label htmlFor="file" className="text-sm font-medium">
        Upload File
      </label>
      <Input id="file" type="file" />
    </div>
  ),
};

/**
 * Form with multiple inputs.
 */
export const Form: Story = {
  render: () => (
    <form className="space-y-4 max-w-md">
      <div className="space-y-2">
        <label htmlFor="fullname" className="text-sm font-medium">
          Full Name
        </label>
        <Input id="fullname" placeholder="John Doe" />
      </div>

      <div className="space-y-2">
        <label htmlFor="email-form" className="text-sm font-medium">
          Email
        </label>
        <Input id="email-form" type="email" placeholder="john@example.com" />
      </div>

      <div className="space-y-2">
        <label htmlFor="message" className="text-sm font-medium">
          Room Name
        </label>
        <Input id="message" placeholder="Enter room name" />
      </div>

      <button 
        type="submit" 
        className="w-full h-9 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90"
      >
        Join Room
      </button>
    </form>
  ),
};

/**
 * Different input sizes.
 */
export const Sizes: Story = {
  render: () => (
    <div className="space-y-4 max-w-md">
      <Input className="h-8 text-sm" placeholder="Small input" />
      <Input placeholder="Default input (h-9)" />
      <Input className="h-10" placeholder="Large input" />
      <Input className="h-12 text-base" placeholder="Extra large input" />
    </div>
  ),
};
