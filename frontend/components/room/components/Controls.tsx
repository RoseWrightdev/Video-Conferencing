"use client";

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
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const { mediaService, roomControlService, chatService } = dependencies;
  const [hasRequestedScreenShare, setHasRequestedScreenShare] = useState(false);
  
  return (
    <div className="flex items-center justify-between gap-4 p-4 w-full">
      {/* Left side controls */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="icon"
            className="rounded-full frosted-2 bg-white/10 hover:bg-white/50 text-white hover:text-black"
            onClick={() => roomControlService.toggleParticipantsPanel()}
            aria-label="Toggle participants"
          >
            <Users className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <Typo.P>Participants</Typo.P>
        </TooltipContent>
      </Tooltip>
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
              tooltip: "Microphone on",
            }}
            after={{
              icon: <MicOff className="size-3.5" />,
              color: "bg-red-500",
              bgColor: "bg-red-100",
              textColor: "text-red-950",
              tooltip: "Microphone off",
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
              tooltip: "Camera on",
            }}
            after={{
              icon: <VideoOff className="size-3.5" />,
              color: "bg-red-500",
              bgColor: "bg-red-100",
              textColor: "text-red-950",
              tooltip: "Camera off",
            }}
            checked={!mediaService.isVideoEnabled}
            onCheckedChange={() => mediaService.toggleVideo()}
            aria-label="Toggle camera"
          />
          
          {/* Spacer */}
          <div className="w-10" />

          {/* Hand Raise */}
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent>
              <Typo.P>{roomControlService.isHandRaised ? "Lower hand" : "Raise hand"}</Typo.P>
            </TooltipContent>
          </Tooltip>

          {/* Screen Share Toggle */}
          {roomControlService.canScreenShare ? (
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent>
                <Typo.P>{mediaService.isScreenSharing ? "Stop sharing" : "Share screen"}</Typo.P>
              </TooltipContent>
            </Tooltip>
          ) :
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full w-14 bg-white/10 hover:bg-white/50 text-white"
                onClick={() => {
                  mediaService.startScreenShare();
                  setHasRequestedScreenShare(true);
                }}
                aria-label="Request screen share"
              >
                <ScreenShare className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <Typo.P>{hasRequestedScreenShare ? "Permission requested" : "Request screen share permission"}</Typo.P>
            </TooltipContent>
          </Tooltip>}

          {/* Spacer */}
          <div className="w-2" />

          {/* Leave Room */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                className="rounded-full w-16 bg-red-600 hover:bg-red-900"
                onClick={() => roomControlService.leaveRoom()}
                aria-label="Leave room"
              >
                <PhoneOff className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <Typo.P>Leave room</Typo.P>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Right side controls */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">
            <Button
              variant="default"
              size="icon"
              className="rounded-full frosted-2 bg-white/10 hover:bg-white/50 text-white hover:text-black"
              onClick={() => {
                roomControlService.toggleChatPanel()
                chatService.markMessagesRead()
              }}
              aria-label="Toggle chat"
            >
              <MessageSquare className="size-5" />
            </Button>
            {chatService.unreadCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1 text-xs"
              >
                {chatService.unreadCount > 99 ? '99+' : chatService.unreadCount}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <Typo.P>Chat</Typo.P>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}