import { Input } from "@/components/ui/input";
import { useState } from "react";
import { ChatDependencies } from "../types/ChatDependencies";

export interface ChatInputProps {
  dependencies: ChatDependencies;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  dependencies,
  disabled = false,
  placeholder = "Message"
}: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSendMessage = () => {
    if (message.trim() && !disabled) {
      dependencies.chatService.sendChat(message);
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex items-center w-full">
      <div className="relative flex-1">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="font-extralight"
        />
      </div>
    </div>
  );
}