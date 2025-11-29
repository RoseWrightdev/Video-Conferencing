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
  Hand,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import * as Typo from "@/components/ui/typography";
import { ControlDependencies } from "../types/ControlsDependcies";

export interface ControlBarProps {
  dependencies: ControlDependencies;
}

export default function ControlBar({ dependencies }: ControlBarProps) {
  const { mediaService, roomControlService } = dependencies;
  
  return (
    <div className="flex items-center justify-between gap-4 p-4 w-full">
      {/* Left side controls */}
        <Button
          variant="default"
          size="icon"
          className="rounded-full frosted-2 bg-white/10 hover:bg-white/50 text-white hover:text-black"
          onClick={() => roomControlService.toggleParticipantsPanel()}
          aria-label="Toggle participants"
        >
          <Users className="size-5" />
        </Button>
      <div className="m-3 bg-white-/20 frosted-2 rounded-full p-1 flex items-center justify-center">
        {/* Center controls */}
        <div className="flex items-center gap-3">
          {/* Audio Toggle */}
          <ToggleSwitch
            className="rounded-2xl"
            before={{
              icon: <Mic className="size-3.5" />,
              color: "bg-green-500",
              bgColor: "bg-green-100",
              textColor: "text-green-950",
            }}
            after={{
              icon: <MicOff className="size-3.5" />,
              color: "bg-red-500",
              bgColor: "bg-red-100",
              textColor: "text-red-950",
            }}
            checked={!mediaService.isAudioEnabled}
            onCheckedChange={() => mediaService.toggleAudio()}
            aria-label="Toggle microphone"
          />

          {/* Video Toggle */}
          <ToggleSwitch
            className="rounded-2xl"
            before={{
              icon: <Video className="size-3.5" />,
              color: "bg-blue-500",
              bgColor: "bg-blue-100",
              textColor: "text-blue-950",
            }}
            after={{
              icon: <VideoOff className="size-3.5" />,
              color: "bg-red-500",
              bgColor: "bg-red-100",
              textColor: "text-red-950",
            }}
            checked={!mediaService.isVideoEnabled}
            onCheckedChange={() => mediaService.toggleVideo()}
            aria-label="Toggle camera"
          />
          
          {/* Spacer */}
          <div className="w-10" />

          {/* Hand Raise */}
          <Button
            variant={roomControlService.isHandRaised ? "default" : "outline"}
            size="icon"
            className={`rounded-full w-10 transition-colors ${
              roomControlService.isHandRaised
                ? "bg-yellow-500 hover:bg-yellow-600 text-yellow-950"
                : "bg-white/10 hover:bg-white/80 text-white"
            }`}
            onClick={() => roomControlService.toggleHand()}
            aria-label="Raise hand"
          >
            <Hand className="size-5" />
          </Button>

          {/* Screen Share Toggle */}
          {roomControlService.canScreenShare ? (
            <Button
              variant={mediaService.isScreenSharing ? "default" : "outline"}
              size="icon"
              className={`rounded-full w-14 transition-colors ${
                mediaService.isScreenSharing
                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                  : "bg-white/10 hover:bg-white/80 text-white"
              }`}
              onClick={() =>
                mediaService.isScreenSharing
                  ? mediaService.stopScreenShare()
                  : mediaService.startScreenShare()
              }
              aria-label="Toggle screen share"
            >
              {mediaService.isScreenSharing ? (
                <ScreenShareOff className="size-5" />
              ) : (
                <ScreenShare className="size-5" />
              )}
            </Button>
          ) :
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={mediaService.isScreenSharing ? "default" : "outline"}
                size="icon"
                className={`rounded-full w-14 ${mediaService.isScreenSharing ? "bg-purple-600 hover:bg-purple-900" : "bg-white/10 hover:bg-white/50"} text-white`}
                onClick={() => mediaService.isScreenSharing ? mediaService.stopScreenShare() : mediaService.startScreenShare()}
                aria-label="Toggle screen share"
              >
                <ScreenShare className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><Typo.P>Request screen share permission</Typo.P></TooltipContent>
          </Tooltip>}

          {/* Spacer */}
          <div className="w-2" />

          {/* Leave Room */}
          <Button
            variant="destructive"
            size="icon"
            className="rounded-full w-16 bg-red-600 hover:bg-red-900"
            onClick={() => roomControlService.leaveRoom()}
            aria-label="Leave room"
          >
            <PhoneOff className="size-5" />
          </Button>
        </div>
      </div>

      {/* Right side controls */}
      <Button
        variant="default"
        size="icon"
        className="rounded-full frosted-2 bg-white/10 hover:bg-white/50 text-white hover:text-black"
        onClick={() => roomControlService.toggleChatPanel()}
        aria-label="Toggle chat"
      >
          <MessageSquare className="size-5" />
      </Button>
    </div>
  );
}