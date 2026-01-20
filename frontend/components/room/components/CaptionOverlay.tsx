"use client";

import { useRoomStore } from "@/store/useRoomStore";
import { useShallow } from 'zustand/react/shallow';
import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CaptionEvent } from "@/types/proto/signaling";

type CaptionItemProps = {
    caption: CaptionEvent;
    displayName: string;
};

const CaptionItem = memo(function CaptionItem({ caption, displayName }: CaptionItemProps) {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Wait 1 second, then fade out
        const timer = setTimeout(() => {
            setIsVisible(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    if (!isVisible) return null;

    return (
        <div
            className={cn(
                "bg-black/60 backdrop-blur-md text-white px-6 py-3 rounded-xl shadow-lg transition-opacity duration-500 ease-out animate-in fade-in slide-in-from-bottom-2",
                isVisible ? "opacity-100" : "opacity-0",
                caption.isFinal ? "" : "opacity-80 italic"
            )}
        >
            <p className="text-lg font-medium text-center leading-relaxed">
                <span className="font-bold text-blue-300 mr-2">[{displayName}]</span>
                {caption.text}
            </p>
        </div>
    );
});

export const CaptionOverlay = memo(function CaptionOverlay() {
    const { captions, isCaptionsEnabled, participants } = useRoomStore(
        useShallow((state) => ({
            captions: state.captions,
            isCaptionsEnabled: state.isCaptionsEnabled,
            participants: state.participants,
        }))
    );

    // Show last 2 items
    const recentCaptions = captions.slice(-2);

    if (!isCaptionsEnabled || recentCaptions.length === 0) return null;

    return (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-full max-w-2xl pointer-events-none z-50 flex flex-col items-center gap-2">
            {recentCaptions.map((cap, idx) => {
                // sessionId is "room:user", we need just "user" to lookup participant
                const userId = cap.sessionId.includes(':') ? cap.sessionId.split(':')[1] : cap.sessionId;
                const participant = participants.get(userId);
                const displayName = participant ? participant.username : "Unknown Speaker";

                return (
                    <CaptionItem
                        key={idx + cap.timestamp} // Composite key to ensure re-mount if needed, though usually stable id is better.
                        caption={cap}
                        displayName={displayName}
                    />
                );
            })}
        </div>
    );
});
