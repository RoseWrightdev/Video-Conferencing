import { Button } from "@/components/ui/button";
import { X as XIcon, MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const [width, setWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle resize
  useEffect(() => {
    if (!isResizing) return;

    mouseMoveHandlerRef.current = (e: MouseEvent) => {
      if (!panelRef.current) return;
      
      const rect = panelRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      
      // Close chat if dragged below minimum threshold
      if (newWidth < 200) {
        chatService.closeChat();
        return;
      }
      
      // Constrain width between 250px and 600px
      setWidth(Math.min(Math.max(newWidth, 250), 600));
    };

    mouseUpHandlerRef.current = () => {
      setIsResizing(false);
    };

    const handleMouseMove = (e: MouseEvent) => mouseMoveHandlerRef.current?.(e);
    const handleMouseUp = (e: MouseEvent) => mouseUpHandlerRef.current?.(e);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      mouseMoveHandlerRef.current = null;
      mouseUpHandlerRef.current = null;
    };
  }, [isResizing, chatService]);

  return (
    <div 
      ref={panelRef}
      className="absolute right-4 top-4 h-[calc(100vh-7rem)] rounded-2xl z-50 overflow-hidden shadow-xl"
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-gray-400/20 active:bg-gray-500/30 transition-colors z-10 flex items-center justify-center group"
        onMouseDown={() => setIsResizing(true)}
      >
        <div className="w-1 h-12 rounded-full bg-gray-400/50 group-hover:bg-gray-500 group-active:bg-gray-600 transition-colors" />
      </div>

      <div className="h-full flex flex-col bg-white/60 frosted-2">
        {/* Header */}
        <div className="p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            <H1 className="font-semibold text-black text-lg">Chat</H1>
          </div>
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
