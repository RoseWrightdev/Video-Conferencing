import *  as Card from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X as XIcon } from "lucide-react";
import { useMemo, useEffect, useRef } from "react";

import ChatMessage from "@/components/chat-panel/components/ChatMessage";
import ChatInput from "@/components/chat-panel/components/ChatInput";
import { ChatDependencies } from "@/components/chat-panel/types/ChatDependencies";
import { Small } from "@/components/ui/typography";

interface ChatPanelProps {
  dependencies: ChatDependencies;
}

export default function ChatPanel({ dependencies }: ChatPanelProps) {
  const { chatService, roomService, participantService } = dependencies;
  const messages = chatService.messages;
  const currentUserId = roomService.currentUserId;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Memoize expensive computations
  const isHost = useMemo(() => 
    participantService.getParticipant(currentUserId || "")?.role === "host",
    [participantService, currentUserId]
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <Card.Card className="w-full h-full bg-white/80 frosted-2 flex flex-col">
        <Card.CardHeader>
          <Card.CardAction>
            <Button
              variant="ghost"
              size="icon"
              onClick={chatService.closeChat}
              className="rounded-4xl"
              aria-label="Close chat panel"
            >
              <XIcon className="h-12 w-12" />
            </Button>
          </Card.CardAction>
        </Card.CardHeader>
        <Card.CardContent className="overflow-hidden">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8 select-none"><Small>No messages yet</Small></div>
          ) : (
            <div className="w-full overflow-y-auto max-h-full">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  chatMessage={msg}
                  isHost={isHost}
                  currentUserId={currentUserId || ""}
                  dependencies={dependencies}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </Card.CardContent>
        <Card.CardFooter>
          <ChatInput dependencies={dependencies} />
        </Card.CardFooter>
      </Card.Card>
    </div>
  );
}
