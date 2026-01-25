import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { useState, useRef, useEffect, memo, ChangeEvent, KeyboardEvent } from "react";
import { useRoomStore } from "@/store/useRoomStore";
import { useShallow } from 'zustand/react/shallow';

export interface ChatInputProps {
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput = memo(function ChatInput({
  disabled = false,
  placeholder = "Message"
}: ChatInputProps) {
  const sendMessage = useRoomStore(useShallow(state => state.sendMessage));
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSendMessage = () => {
    if (message.trim() && !disabled) {
      sendMessage(message);
      setMessage("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-resize textarea based on content with debouncing for performance
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Use requestAnimationFrame to debounce resize calculations
    const timeoutId = requestAnimationFrame(() => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    });

    return () => cancelAnimationFrame(timeoutId);
  }, [message]);

  return (
    <div className="flex items-center w-full">
      <div className="relative flex-1">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`font-medium bg-black/5! resize-none min-h-10 max-h-[200px] overflow-y-auto text-black placeholder-black/40 border-black/10! rounded-lg shadow-none! ${message.trim() ? "pr-12" : ""}`}
          rows={1}
          aria-label="Chat message input"
        />
        {message.trim() && (
          <Button
            onClick={handleSendMessage}
            disabled={disabled}
            size="icon"
            className="absolute right-1 bottom-1 top-1 h-8 w-8 shrink-0 rounded-full"
            aria-label="Send message"
            variant="ghost"
          >
            <Send className="h-4 w-4 text-gray-900" />
          </Button>
        )}
      </div>
    </div>
  );
});

export default ChatInput;