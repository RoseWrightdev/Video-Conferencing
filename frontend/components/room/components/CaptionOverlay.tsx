"use client";

import { useRoomStore } from "@/store/useRoomStore";
import { useShallow } from 'zustand/react/shallow';
import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export const CaptionOverlay = memo(function CaptionOverlay() {
    const { captions, isCaptionsEnabled, participants } = useRoomStore(
        useShallow((state) => ({
            captions: state.captions,
            isCaptionsEnabled: state.isCaptionsEnabled,
            participants: state.participants,
        }))
    );

    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of caption list if we decide to show history
    // For overlay, we usually show just the last few lines.

    // Show last 2 items
    const recentCaptions = captions.slice(-2);

    if (!isCaptionsEnabled || recentCaptions.length === 0) return null;

    return (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-full max-w-2xl pointer-events-none z-50 flex flex-col items-center gap-2">
            {recentCaptions.map((cap, idx) => {
                const participant = participants.get(cap.sessionId);
                const displayName = participant ? participant.username : "Unknown Speaker";

                return (
                    <div
                        key={idx + cap.timestamp}
                        className={cn(
                            "bg-black/60 backdrop-blur-md text-white px-6 py-3 rounded-xl shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-2",
                            cap.isFinal ? "opacity-100" : "opacity-80 italic"
                        )}
                    >
                        <p className="text-lg font-medium text-center leading-relaxed">
                            <span className="font-bold text-blue-300 mr-2">[{displayName}]</span>
                            {cap.text}
                        </p>
                    </div>
                );
            })}
        </div>
    );
});
