import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter,
  CardAction
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { MoreVerticalIcon } from "lucide-react";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: 
          "A versatile card component for displaying content in a contained, elevated box. " +
          "Includes composable sub-components for header, title, description, content, footer, and actions. " +
          "Perfect for displaying participant cards, settings panels, and content sections.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof Card>;

/**
 * Basic card with title and description.
 */
export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">This is the card content area.</p>
      </CardContent>
    </Card>
  ),
};

/**
 * Card with header, content, and footer.
 */
export const WithFooter: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>Enter your details to create an account</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Form fields would go here...
        </p>
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Create</Button>
      </CardFooter>
    </Card>
  ),
};

/**
 * Card with action button in header.
 */
export const WithAction: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>You have 3 unread messages</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon">
            <MoreVerticalIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm">Message 1</p>
          <p className="text-sm">Message 2</p>
          <p className="text-sm">Message 3</p>
        </div>
      </CardContent>
    </Card>
  ),
};

/**
 * Participant card for video conference.
 */
export const ParticipantCard: Story = {
  render: () => (
    <Card className="w-[300px]">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="size-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
            JD
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">John Doe</CardTitle>
            <CardDescription>Host</CardDescription>
          </div>
        </div>
        <CardAction>
          <Badge className="bg-green-500 text-white border-transparent">Active</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Audio</span>
          <Badge variant="outline">On</Badge>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Video</span>
          <Badge variant="outline">On</Badge>
        </div>
      </CardContent>
    </Card>
  ),
};

/**
 * Stats card with numbers.
 */
export const StatsCard: Story = {
  render: () => (
    <div className="grid gap-4 grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription>Total Participants</CardDescription>
          <CardTitle className="text-3xl">24</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Active Now</CardDescription>
          <CardTitle className="text-3xl">18</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Duration</CardDescription>
          <CardTitle className="text-3xl">45m</CardTitle>
        </CardHeader>
      </Card>
    </div>
  ),
};

/**
 * Feature card with icon.
 */
export const FeatureCard: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <div className="size-12 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
          <svg className="size-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <CardTitle>HD Video Quality</CardTitle>
        <CardDescription>
          Experience crystal clear video calls with up to 1080p resolution
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="w-full">Learn More</Button>
      </CardContent>
    </Card>
  ),
};

/**
 * Settings card with border sections.
 */
export const SettingsCard: Story = {
  render: () => (
    <Card className="w-[400px]">
      <CardHeader className="border-b">
        <CardTitle>Audio Settings</CardTitle>
        <CardDescription>Configure your audio devices</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 py-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Microphone</label>
          <select className="w-full h-9 rounded-md border px-3 text-sm">
            <option>Default Microphone</option>
            <option>External Microphone</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Speaker</label>
          <select className="w-full h-9 rounded-md border px-3 text-sm">
            <option>Default Speaker</option>
            <option>Headphones</option>
          </select>
        </div>
      </CardContent>
      <CardFooter className="border-t justify-end gap-2">
        <Button variant="outline">Cancel</Button>
        <Button>Save Changes</Button>
      </CardFooter>
    </Card>
  ),
};

/**
 * Compact card without padding.
 */
export const Compact: Story = {
  render: () => (
    <Card className="w-[250px] py-4">
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Recording</span>
          <Badge variant="destructive">Live</Badge>
        </div>
        <div className="text-2xl font-bold">00:15:23</div>
        <Button size="sm" className="w-full">Stop Recording</Button>
      </CardContent>
    </Card>
  ),
};
