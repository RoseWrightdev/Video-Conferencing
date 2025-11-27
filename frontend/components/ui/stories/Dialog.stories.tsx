import { 
  Dialog, 
  DialogTrigger, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

const meta: Meta<typeof Dialog> = {
  title: "UI/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: 
          "A modal dialog component built with Radix UI. Displays content in a layer above the main application. " +
          "Includes overlay backdrop, keyboard navigation, and focus management. " +
          "Perfect for confirmations, forms, and important messages that require user attention.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof Dialog>;

/**
 * Basic dialog with title and description.
 */
export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>
            This is a description of what the dialog is about.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm">Dialog content goes here.</p>
        </div>
      </DialogContent>
    </Dialog>
  ),
};

/**
 * Dialog with footer actions.
 */
export const WithFooter: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Delete Item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the item.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/**
 * Dialog with form inputs.
 */
export const WithForm: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Edit Profile</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input placeholder="Enter your name" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input type="email" placeholder="Enter your email" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/**
 * Confirmation dialog.
 */
export const Confirmation: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Leave Room</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave this room?</DialogTitle>
          <DialogDescription>
            You will be disconnected from the video call. You can rejoin at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Stay</Button>
          <Button variant="destructive">Leave Room</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/**
 * Dialog without close button.
 */
export const WithoutCloseButton: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open (No Close Button)</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Processing...</DialogTitle>
          <DialogDescription>
            Please wait while we process your request.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-8">
          <div className="size-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DialogContent>
    </Dialog>
  ),
};

/**
 * Interactive dialog with state.
 */
export const Interactive: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");

    const handleSave = () => {
      alert(`Saved: ${name}`);
      setOpen(false);
      setName("");
    };

    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Interactive Dialog</Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>What&apos;s your name?</DialogTitle>
              <DialogDescription>
                Enter your name to continue.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name" 
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!name}>
                Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
};

/**
 * Success dialog.
 */
export const Success: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Show Success</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-4 size-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="size-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <DialogTitle className="text-center">Success!</DialogTitle>
          <DialogDescription className="text-center">
            Your changes have been saved successfully.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/**
 * Alert/Warning dialog.
 */
export const Warning: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Show Warning</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-4 size-12 bg-yellow-100 rounded-full flex items-center justify-center">
            <svg className="size-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <DialogTitle className="text-center">Low Connection Quality</DialogTitle>
          <DialogDescription className="text-center">
            Your internet connection is weak. Video quality may be affected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button variant="outline">Settings</Button>
          <Button>Continue Anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
