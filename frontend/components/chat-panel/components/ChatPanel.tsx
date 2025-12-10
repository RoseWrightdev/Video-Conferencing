import { Button } from "@/components/ui/button";
import { X as XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import ChatMessage from "@/components/chat-panel/components/ChatMessage";
import ChatInput from "@/components/chat-panel/components/ChatInput";
import { ChatDependencies } from "@/components/chat-panel/types/ChatDependencies";
import { Small, H1 } from "@/components/ui/typography";

interface ChatPanelProps {
  dependencies: ChatDependencies;
}

export default function ChatPanel({ dependencies }: ChatPanelProps) {
  const { chatService, roomService, participantService } = dependencies;
  const messages = chatService.messages;
  const currentUserId = roomService.currentUserId;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="absolute right-4 top-4 h-[calc(100vh-7rem)] w-[400px] rounded-2xl z-50 overflow-hidden shadow-xl">
      <div className="h-full flex flex-col bg-white/60 frosted-2">
        {/* Header */}
        <div className="p-4 flex items-center justify-between shrink-0">
          <H1 className="font-semibold text-black text-lg">Chat</H1>
          <Button
            variant="ghost"
            size="icon"
            onClick={chatService.closeChat}
            className="rounded-full -m-2"
            aria-label="Close chat panel"
          >
            <XIcon className="h-5 w-5 text-black" />
          </Button>
        </div>
        
        {/* Messages */}
        <div className="flex-1 overflow-hidden p-4">
          {messages.length === 0 ? (
            <div className="text-center text-black/60 py-8 select-none"><Small>No messages yet</Small></div>
          ) : (
            <div className="w-full overflow-y-auto h-full">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  chatMessage={msg}
                  currentUserId={currentUserId || ""}
                  dependencies={dependencies}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        
        {/* Input */}
        <div className="p-4 shrink-0">
          <ChatInput dependencies={dependencies} />
        </div>
      </div>
    </div>

  );
}
