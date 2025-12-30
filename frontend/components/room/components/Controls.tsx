"use client";

import {
  Crown,
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
  Settings,
} from "lucide-react";
import { useState, memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import * as Typo from "@/components/ui/typography";
import { useRoomStore } from "@/store/useRoomStore";
import { useShallow } from 'zustand/react/shallow';
import { useRouter } from "next/navigation";

const ControlBar = memo(function ControlBar() {
  const {
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    isHost,
    setLeaveDialogOpen
  } = useRoomStore(useShallow(state => ({
    isAudioEnabled: state.isAudioEnabled,
    isVideoEnabled: state.isVideoEnabled,
    isScreenSharing: state.isScreenSharing,
    toggleAudio: state.toggleAudio,
    toggleVideo: state.toggleVideo,
    startScreenShare: state.startScreenShare,
    stopScreenShare: state.stopScreenShare,
    isHost: state.isHost,
    setLeaveDialogOpen: state.setLeaveDialogOpen
  })));

  const {
    toggleParticipantsPanel,
    toggleSettingsPanel,
    toggleChatPanel,
    unreadParticipantsCount,
  } = useRoomStore(useShallow(state => ({
    toggleParticipantsPanel: state.toggleParticipantsPanel,
    toggleSettingsPanel: state.toggleSettingsPanel,
    toggleChatPanel: state.toggleChatPanel,
    unreadParticipantsCount: state.unreadParticipantsCount,
  })));

  const { unreadCount, markMessagesRead } = useRoomStore(useShallow(state => ({
    unreadCount: state.unreadCount,
    markMessagesRead: state.markMessagesRead
  })));

  const { leaveRoom } = useRoomStore(useShallow(state => ({ leaveRoom: state.leaveRoom })));
  const router = useRouter();

  // Hand raise is in participant slice, let's get it correctly
  const { currentUserId, raisingHandParticipants, toggleHand } = useRoomStore(useShallow(state => ({
    currentUserId: state.currentUserId,
    raisingHandParticipants: state.raisingHandParticipants,
    toggleHand: state.toggleHand
  })));

  const isHandRaised = currentUserId ? raisingHandParticipants.has(currentUserId) : false;
  const [hasRequestedScreenShare, setHasRequestedScreenShare] = useState(false);
  const canScreenShare = true; // Defining as true or based on local logic as requested

  return (
    <div className="flex items-center justify-between gap-4 p-4 w-full">
      {/* Left side controls */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="icon"
              className="rounded-full frosted-2 bg-white/10 hover:bg-white/50 text-white hover:text-black"
              onClick={toggleSettingsPanel}
              aria-label="Toggle settings"
            >
              <Settings className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <Typo.P>Settings</Typo.P>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <Button
                variant="default"
                size="icon"
                className="rounded-full frosted-2 bg-white/10 hover:bg-white/50 text-white hover:text-black"
                onClick={toggleParticipantsPanel}
                aria-label="Toggle participants"
              >
                <Users className="size-5" />
              </Button>
              {unreadParticipantsCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1 text-xs"
                >
                  {unreadParticipantsCount > 99 ? '99+' : unreadParticipantsCount}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <Typo.P>Participants</Typo.P>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="m-3 bg-white/15 frosted-2 rounded-full p-1 flex items-center justify-center">
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
            checked={!isAudioEnabled}
            onCheckedChange={() => {
              // eslint-disable-next-line no-console
              console.log('[ControlBar] Audio toggle clicked', { isAudioEnabled });
              toggleAudio();
            }}
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
            checked={!isVideoEnabled}
            onCheckedChange={() => {
              // eslint-disable-next-line no-console
              console.log('[ControlBar] Video toggle clicked', { isVideoEnabled });
              toggleVideo();
            }}
            aria-label="Toggle camera"
          />

          {/* Spacer */}
          <div className="w-10" />

          {/* Hand Raise */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isHandRaised ? "default" : "outline"}
                size="icon"
                className={`rounded-full w-10 transition-colors ${isHandRaised
                  ? "bg-yellow-500 hover:bg-yellow-600 text-yellow-950"
                  : "bg-white/10 hover:bg-white/80 text-white"
                  }`}
                onClick={() => toggleHand()}
                aria-label="Raise hand"
              >
                <Hand className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <Typo.P>{isHandRaised ? "Lower hand" : "Raise hand"}</Typo.P>
            </TooltipContent>
          </Tooltip>

          {/* Screen Share Toggle */}
          {canScreenShare ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isScreenSharing ? "default" : "outline"}
                  size="icon"
                  className={`rounded-full w-14 transition-colors ${isScreenSharing
                    ? "bg-purple-600 hover:bg-purple-700 text-white"
                    : "bg-white/10 hover:bg-white/80 text-white"
                    }`}
                  onClick={() =>
                    isScreenSharing
                      ? stopScreenShare()
                      : startScreenShare()
                  }
                  aria-label="Toggle screen share"
                >
                  {isScreenSharing ? (
                    <ScreenShareOff className="size-5" />
                  ) : (
                    <ScreenShare className="size-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <Typo.P>{isScreenSharing ? "Stop sharing" : "Share screen"}</Typo.P>
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
                    startScreenShare();
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

          {/* Leave Room / End Meeting Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                className="rounded-full w-16 bg-red-500 hover:bg-red-700 hover:text-white"
                aria-label="Leave room"
                onClick={() => setLeaveDialogOpen(true)}
              >
                <PhoneOff className="size-5 text-red-950" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <Typo.P>{isHost ? "End or Leave" : "Leave room"}</Typo.P>
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
                toggleChatPanel()
                markMessagesRead()
              }}
              aria-label="Toggle chat"
            >
              <MessageSquare className="size-5" />
            </Button>
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1 text-xs"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
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
});

export default ControlBar;