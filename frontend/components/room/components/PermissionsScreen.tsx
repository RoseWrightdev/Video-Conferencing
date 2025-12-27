import { Button } from '@/components/ui/button';
import { Video, Mic } from 'lucide-react';

interface PermissionsScreenProps {
  permissionError: string | null;
  onRequestPermissions: () => void;
  onSkipPermissions: () => void;
  hasPermissions?: boolean;
}

export default function PermissionsScreen({
  permissionError,
  onRequestPermissions,
  onSkipPermissions,
  hasPermissions = false,
}: PermissionsScreenProps) {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="max-w-md p-8 space-y-6 text-center">
        <div className="flex justify-center gap-4 mb-6">
          <div className="p-4 rounded-full bg-primary/10">
            <Video className="h-8 w-8 text-primary" />
          </div>
          <div className="p-4 rounded-full bg-primary/10">
            <Mic className="h-8 w-8 text-primary" />
          </div>
        </div>

        <h2 className="text-2xl font-semibold">
          {hasPermissions ? 'Ready to Join?' : 'Camera & Microphone Access'}
        </h2>
        <p className="text-muted-foreground">
          {hasPermissions
            ? 'Your devices are ready. Click Join to enter the room.'
            : 'To join the video call, we need access to your camera and microphone.'}
        </p>

        {permissionError && (
          <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
            {permissionError}
          </div>
        )}

        <div className="space-y-3">
          <Button
            onClick={onRequestPermissions}
            size="lg"
            className="w-full"
          >
            {hasPermissions ? 'Join Room' : 'Allow Camera & Microphone'}
          </Button>
          {!hasPermissions && (
            <Button
              onClick={onSkipPermissions}
              variant="outline"
              size="lg"
              className="w-full"
            >
              Join Without Media
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
