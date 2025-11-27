import *  as Card from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X as XIcon } from "lucide-react";

import ChatMessage from "@/components/chat-panel/components/ChatMessage";
import ChatInput from "@/components/chat-panel/components/ChatInput";
import { ChatDependencies } from "@/components/chat-panel/types/ChatDependencies";

interface ChatPanelProps {
  dependencies: ChatDependencies;
}

export default function ChatPanel({ dependencies }: ChatPanelProps) {
  const { chatService, roomService, participantService } = dependencies;
  const messages = chatService.messages;
  const currentUserId = roomService.currentUserId;
  const isHost = participantService.getParticipant(currentUserId || "")?.role === "host";

  return (
    <div
      style={{
        minWidth: '480px',
        maxWidth: '720px',
        flexShrink: 0,
        display: 'block',
        overflow: 'hidden'
      }}
    >
      <Card.Card
        style={{
          width: '100%',
          height: '100%'
        }}
      >
        <Card.CardHeader>
          <Card.CardAction>
            <Button
              variant="ghost"
              size="icon"
              onClick={chatService.closeChat}
              className="h-8 w-8 rounded-4xl"
            >
              <XIcon />
            </Button>
          </Card.CardAction>
        </Card.CardHeader>
        <Card.CardContent className="overflow-hidden">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8 select-none">No messages yet</div>
          ) : (
            <div className="w-full overflow-hidden">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  chatMessage={msg}
                  isHost={isHost}
                  currentUserId={currentUserId || ""}
                  dependencies={dependencies}
                />
              ))}
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
