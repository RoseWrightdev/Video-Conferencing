import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Volume2, 
  VolumeX,
  Sun,
  Moon,
  Wifi,
  WifiOff,
  Eye,
  EyeOff
} from "lucide-react";
import { useState } from "react";

const meta: Meta<typeof ToggleSwitch> = {
  title: "UI/ToggleSwitch",
  component: ToggleSwitch,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: 
          "An animated toggle switch component with customizable icons and colors for both states. " +
          "Perfect for binary controls like on/off, mute/unmute, or enable/disable actions. " +
          "Features smooth transitions, accessibility support, and full Tailwind CSS styling.",
      },
    },
  },
  argTypes: {
    before: {
      description: "Configuration for the unchecked state (icon, color, bgColor)",
      control: false,
    },
    after: {
      description: "Configuration for the checked state (icon, color, bgColor)",
      control: false,
    },
    checked: {
      control: "boolean",
      description: "Current checked state",
    },
    disabled: {
      control: "boolean",
      description: "Whether the toggle is disabled",
    },
    "aria-label": {
      control: "text",
      description: "Accessible label for screen readers",
    },
  },
};

export default meta;

type Story = StoryObj<typeof ToggleSwitch>;

/**
 * The classic YES/NO toggle, inspired by the original CSS example.
 * Shows "YES" in blue when unchecked, "NO" in red when checked.
 */
export const YesNo: Story = {
  args: {
    before: {
      icon: "YES",
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
    },
    after: {
      icon: "NO",
      color: "bg-red-500",
      bgColor: "bg-red-50",
    },
    checked: false,
    "aria-label": "Toggle yes or no",
  },
};

/**
 * Microphone mute/unmute toggle with icons.
 * Green when unmuted, gray when muted.
 */
export const MicrophoneToggle: Story = {
  args: {
    before: {
      icon: <Mic className="size-3.5" />,
      color: "bg-green-500",
      bgColor: "bg-green-50",
    },
    after: {
      icon: <MicOff className="size-3.5" />,
      color: "bg-gray-500",
      bgColor: "bg-gray-100",
    },
    checked: false,
    "aria-label": "Toggle microphone",
  },
};

/**
 * Camera/video toggle.
 * Blue when camera is on, red when off.
 */
export const CameraToggle: Story = {
  args: {
    before: {
      icon: <Video className="size-3.5" />,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
    },
    after: {
      icon: <VideoOff className="size-3.5" />,
      color: "bg-red-500",
      bgColor: "bg-red-50",
    },
    checked: false,
    "aria-label": "Toggle camera",
  },
};

/**
 * Volume/mute toggle.
 * Teal when volume is on, orange when muted.
 */
export const VolumeToggle: Story = {
  args: {
    before: {
      icon: <Volume2 className="size-3.5" />,
      color: "bg-teal-500",
      bgColor: "bg-teal-50",
    },
    after: {
      icon: <VolumeX className="size-3.5" />,
      color: "bg-orange-500",
      bgColor: "bg-orange-50",
    },
    checked: false,
    "aria-label": "Toggle volume",
  },
};

/**
 * Dark mode toggle.
 * Yellow sun for light mode, purple moon for dark mode.
 */
export const DarkModeToggle: Story = {
  args: {
    before: {
      icon: <Sun className="size-3.5" />,
      color: "bg-yellow-500",
      bgColor: "bg-yellow-50",
    },
    after: {
      icon: <Moon className="size-3.5" />,
      color: "bg-purple-600",
      bgColor: "bg-purple-50",
    },
    checked: false,
    "aria-label": "Toggle dark mode",
  },
};

/**
 * WiFi/connection toggle.
 * Green when connected, red when disconnected.
 */
export const ConnectionToggle: Story = {
  args: {
    before: {
      icon: <Wifi className="size-3.5" />,
      color: "bg-green-500",
      bgColor: "bg-green-50",
    },
    after: {
      icon: <WifiOff className="size-3.5" />,
      color: "bg-red-500",
      bgColor: "bg-red-50",
    },
    checked: false,
    "aria-label": "Toggle connection",
  },
};

/**
 * Visibility toggle for showing/hiding content.
 * Blue when visible, gray when hidden.
 */
export const VisibilityToggle: Story = {
  args: {
    before: {
      icon: <Eye className="size-3.5" />,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
    },
    after: {
      icon: <EyeOff className="size-3.5" />,
      color: "bg-gray-500",
      bgColor: "bg-gray-100",
    },
    checked: false,
    "aria-label": "Toggle visibility",
  },
};

/**
 * ON/OFF text toggle.
 * Green for ON, gray for OFF.
 */
export const OnOff: Story = {
  args: {
    before: {
      icon: "ON",
      color: "bg-green-600",
      bgColor: "bg-green-50",
    },
    after: {
      icon: "OFF",
      color: "bg-gray-600",
      bgColor: "bg-gray-100",
    },
    checked: false,
    "aria-label": "Toggle on or off",
  },
};

/**
 * Disabled toggle showing how the component handles disabled state.
 */
export const Disabled: Story = {
  args: {
    before: {
      icon: "YES",
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
    },
    after: {
      icon: "NO",
      color: "bg-red-500",
      bgColor: "bg-red-50",
    },
    checked: false,
    disabled: true,
    "aria-label": "Disabled toggle",
  },
};

/**
 * Pre-checked toggle showing the checked state.
 */
export const Checked: Story = {
  args: {
    before: {
      icon: <Mic className="size-3.5" />,
      color: "bg-green-500",
      bgColor: "bg-green-50",
    },
    after: {
      icon: <MicOff className="size-3.5" />,
      color: "bg-gray-500",
      bgColor: "bg-gray-100",
    },
    checked: true,
    "aria-label": "Checked toggle",
  },
};

/**
 * Interactive playground for customizing the toggle.
 * Click to toggle between states and see the smooth animation.
 */
export const Playground: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(args.checked ?? false);
    
    return (
      <div className="space-y-4">
        <ToggleSwitch
          {...args}
          checked={checked}
          onCheckedChange={setChecked}
        />
        <p className="text-sm text-gray-600">
          Current state: <strong>{checked ? "Checked" : "Unchecked"}</strong>
        </p>
      </div>
    );
  },
  args: {
    before: {
      icon: <Mic className="size-3.5" />,
      color: "bg-green-500",
      bgColor: "bg-green-50",
    },
    after: {
      icon: <MicOff className="size-3.5" />,
      color: "bg-gray-500",
      bgColor: "bg-gray-100",
    },
    checked: false,
    "aria-label": "Interactive toggle",
  },
};

/**
 * Multiple toggles demonstrating common use cases together.
 * Shows how they can be used in a control panel or settings interface.
 */
export const MultipleToggles: Story = {
  render: () => {
    const [mic, setMic] = useState(true);
    const [camera, setCamera] = useState(true);
    const [volume, setVolume] = useState(false);
    const [darkMode, setDarkMode] = useState(false);

    return (
      <div className="space-y-6 p-6 bg-white rounded-lg border">
        <h3 className="text-lg font-semibold mb-4">Conference Controls</h3>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Microphone</p>
            <p className="text-sm text-gray-500">
              {mic ? "Unmuted" : "Muted"}
            </p>
          </div>
          <ToggleSwitch
            before={{
              icon: <Mic className="size-3.5" />,
              color: "bg-green-500",
              bgColor: "bg-green-50",
            }}
            after={{
              icon: <MicOff className="size-3.5" />,
              color: "bg-gray-500",
              bgColor: "bg-gray-100",
            }}
            checked={!mic}
            onCheckedChange={(checked) => setMic(!checked)}
            aria-label="Toggle microphone"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Camera</p>
            <p className="text-sm text-gray-500">
              {camera ? "Enabled" : "Disabled"}
            </p>
          </div>
          <ToggleSwitch
            before={{
              icon: <Video className="size-3.5" />,
              color: "bg-blue-500",
              bgColor: "bg-blue-50",
            }}
            after={{
              icon: <VideoOff className="size-3.5" />,
              color: "bg-red-500",
              bgColor: "bg-red-50",
            }}
            checked={!camera}
            onCheckedChange={(checked) => setCamera(!checked)}
            aria-label="Toggle camera"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Volume</p>
            <p className="text-sm text-gray-500">
              {volume ? "Muted" : "On"}
            </p>
          </div>
          <ToggleSwitch
            before={{
              icon: <Volume2 className="size-3.5" />,
              color: "bg-teal-500",
              bgColor: "bg-teal-50",
            }}
            after={{
              icon: <VolumeX className="size-3.5" />,
              color: "bg-orange-500",
              bgColor: "bg-orange-50",
            }}
            checked={volume}
            onCheckedChange={setVolume}
            aria-label="Toggle volume"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Theme</p>
            <p className="text-sm text-gray-500">
              {darkMode ? "Dark" : "Light"}
            </p>
          </div>
          <ToggleSwitch
            before={{
              icon: <Sun className="size-3.5" />,
              color: "bg-yellow-500",
              bgColor: "bg-yellow-50",
            }}
            after={{
              icon: <Moon className="size-3.5" />,
              color: "bg-purple-600",
              bgColor: "bg-purple-50",
            }}
            checked={darkMode}
            onCheckedChange={setDarkMode}
            aria-label="Toggle dark mode"
          />
        </div>
      </div>
    );
  },
};
