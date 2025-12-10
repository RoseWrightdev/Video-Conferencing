import React, { useRef, useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import * as Typo from "@/components/ui/typography";
import { type ChatMessage } from "@/store/types";
import { ChatDependencies } from "../types/ChatDependencies";

export interface ChatMessageProps {
  chatMessage: ChatMessage;
  currentUserId: string;
  dependencies: ChatDependencies;
}

const ChatMessage = React.memo(function ChatMessage({
  chatMessage,
  currentUserId,
  dependencies,
}: ChatMessageProps) {
  // Check if the message author is a host
  const isHost = dependencies.participantService.getParticipant(chatMessage.participantId)?.role === "host";

  if (chatMessage.type === "private") {
    return (
      <StandardChat chatMessage={chatMessage} currentUserId={currentUserId} isPriv={true} isHost={isHost} dependencies={dependencies} />
    );
  } else if (chatMessage.type === "system") {
    return (
      <div className="bg-gray-100 rounded-md p-3 mb-2 text-center text-sm text-gray-600">
        {chatMessage.content}
      </div>
    );
  } else if (chatMessage.type === "text") {
    return (
      <StandardChat chatMessage={chatMessage} currentUserId={currentUserId} isPriv={false} isHost={isHost} dependencies={dependencies} />
    );
  }

  return null;
}, (prevProps, nextProps) => {
  // Only re-render if message content or read status changes
  return prevProps.chatMessage.id === nextProps.chatMessage.id &&
         prevProps.chatMessage.content === nextProps.chatMessage.content &&
         prevProps.chatMessage.timestamp === nextProps.chatMessage.timestamp &&
         prevProps.currentUserId === nextProps.currentUserId;
});

function StandardChat({ chatMessage, currentUserId, isPriv, isHost, dependencies }: { chatMessage: ChatMessage, currentUserId: string, isPriv: boolean, isHost: boolean, dependencies: ChatDependencies }) {
  const messageContentRef = useRef<HTMLParagraphElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    if (messageContentRef.current) {
      messageContentRef.current.scrollTop = 0;
    }
  };
  const badgeStyle = "text-[14px] text-medium"
  const isCurrentUser = chatMessage.participantId === currentUserId;

  return (
    <div
      className={`flex items-start gap-4 p-3 mb-4 ${isCurrentUser ? "flex-row-reverse" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Avatar className="w-11 h-11 shrink-0 mt-2">
        <AvatarImage
          src={`https://api.dicebear.com/5.x/initials/svg?seed=${chatMessage.username}`}
        />
        <AvatarFallback className="w-10 h-10 flex items-center justify-center text-xl">
          {chatMessage.username.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className={`flex flex-col justify-center w-full ${isCurrentUser ? "items-end" : "items-start"}`}>
        <div className={`flex items-center gap-3 mt-2 ${isCurrentUser ? "flex-row-reverse" : ""}`}>
          <Typo.H4 className="my-0">{chatMessage.username}</Typo.H4>
          {isHost && <Badge variant="outline" className={badgeStyle + " bg-white"}>Host</Badge>}
          {isPriv && <Badge variant="outline" className={badgeStyle + " bg-white"}>Private</Badge>}
          <Typo.Muted className={`mt-1 transition-opacity duration-200 ${isHovered ? "opacity-100" : "opacity-0"}`}>
            {chatMessage.timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Typo.Muted>
        </div>
        <div className={`mt-1 ${isCurrentUser ? "text-right" : "text-left"} max-w-full`}>
          <RenderMessageContent
            chatMessage={chatMessage.content}
            forwardedRef={messageContentRef}
            isHovered={isHovered}
          />
        </div>
      </div>
    </div>
  );
}

function RenderMessageContent({
  chatMessage,
  forwardedRef,
  isHovered,
}: {
  chatMessage: string;
  forwardedRef?: React.RefObject<HTMLParagraphElement | null>;
  isHovered?: boolean;
}) {
  const internalRef = useRef<HTMLParagraphElement>(null);
  const ref = forwardedRef ?? internalRef;
  const [showGradient, setShowGradient] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const checkOverflow = () => {
      const isScrolledToBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

      // Check if natural content height exceeds the max-h-32 (128px) constraint by a significant margin
      // We use scrollHeight which gives us the natural height of the content
      const maxHeightInPx = 128; // max-h-32 = 8rem = 128px
      const contentExceedsLimit = el.scrollHeight > maxHeightInPx + 30; // Increased buffer to avoid flicker

      // Update overflow state to prevent switching between overflow modes
      setHasOverflow(contentExceedsLimit);
      setShowGradient(contentExceedsLimit && !isScrolledToBottom && !isHovered);
    };

    checkOverflow();
    el.addEventListener("scroll", checkOverflow);
    window.addEventListener("resize", checkOverflow);
    return () => {
      el.removeEventListener("scroll", checkOverflow);
      window.removeEventListener("resize", checkOverflow);
    };
  }, [chatMessage, ref, isHovered]);

  const gradient =
    "linear-gradient(to bottom, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 100%)";

  // Parse message content for links, emails, and mentions
  const renderMessageWithLinks = (text: string) => {
    // Regex patterns for URLs, emails, and mentions
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const mentionRegex = /(@everyone|@[a-zA-Z0-9._-]+)/g;

    // Split text by URLs, emails, and mentions while keeping the matches
    const parts = text.split(/(\s+|https?:\/\/[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|@everyone|@[a-zA-Z0-9._-]+)/g);

    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700 underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      } else if (emailRegex.test(part)) {
        return (
          <a
            key={index}
            href={`mailto:${part}`}
            className="text-blue-500 hover:text-blue-700 underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      } else if (mentionRegex.test(part)) {
        return (
          <Badge
            key={index}
            variant={part === "@everyone" ? "secondary" : "outline"}
            className="text-xs px-1.5 py-0.5 mx-0.5 inline-flex bg-white"
          >
            {part}
          </Badge>
        );
      } else {
        return part;
      }
    });
  };

  return (
    <Typo.P
      ref={ref}
      className={`text-wrap font-medium mt-0 relative transition-all duration-100 ${hasOverflow ? "overflow-y-auto" : "overflow-y-hidden"} max-h-32`}
      style={{
        ...(hasOverflow ? {
          scrollbarWidth: "thin",
          scrollbarColor: isHovered ? "rgba(156, 163, 175, 0.7) transparent" : "transparent transparent",
        } : {}),
        ...((showGradient && !isHovered)
          ? {
            WebkitMaskImage: gradient,
            maskImage: gradient,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
          }
          : {})
      }}
    >
      {renderMessageWithLinks(chatMessage)}
    </Typo.P>
  );
};

export default ChatMessage;