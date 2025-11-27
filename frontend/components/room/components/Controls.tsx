import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  ScreenShare, 
  ScreenShareOff,
  PhoneOff,
  MessageSquare,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { ControlDependencies } from "../types/ControlsDependcies";

export interface ControlBarProps {
  dependencies: ControlDependencies;
}

export default function ControlBar({ dependencies }: ControlBarProps) {
  const { mediaService, roomControlService } = dependencies;
  
  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-background border-t">
      {/* Left side controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => roomControlService.toggleParticipantsPanel()}
          aria-label="Toggle participants"
        >
          <Users className="size-5" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => roomControlService.toggleChatPanel()}
          aria-label="Toggle chat"
        >
          <MessageSquare className="size-5" />
        </Button>
      </div>

      {/* Center controls */}
      <div className="flex items-center gap-3">
        {/* Audio Toggle */}
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
          checked={!mediaService.isAudioEnabled}
          onCheckedChange={() => mediaService.toggleAudio()}
          aria-label="Toggle microphone"
        />

        {/* Video Toggle */}
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
          checked={!mediaService.isVideoEnabled}
          onCheckedChange={() => mediaService.toggleVideo()}
          aria-label="Toggle camera"
        />

        {/* Screen Share Toggle */}
        <Button
          variant={mediaService.isScreenSharing ? "default" : "outline"}
          size="icon"
          className="rounded-full"
          onClick={() => mediaService.isScreenSharing ? mediaService.stopScreenShare() : mediaService.startScreenShare()}
          aria-label="Toggle screen share"
        >
          {mediaService.isScreenSharing ? (
            <ScreenShareOff className="size-5" />
          ) : (
            <ScreenShare className="size-5" />
          )}
        </Button>

        {/* Leave Room */}
        <Button
          variant="destructive"
          size="icon"
          className="rounded-full"
          onClick={() => roomControlService.leaveRoom()}
          aria-label="Leave room"
        >
          <PhoneOff className="size-5" />
        </Button>
      </div>

      {/* Right side spacer for balance */}
      <div className="w-[88px]" />
    </div>
  );
}