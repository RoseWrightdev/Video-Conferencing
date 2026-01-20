"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRoomStore } from "@/store/useRoomStore";
import { useShallow } from 'zustand/react/shallow';
import Markdown from 'markdown-to-jsx';
import { Loader2, AlertCircle } from "lucide-react";

export function SummaryModal() {
    const {
        isOpen,
        toggle,
        isGenerating,
        summary,
        actionItems,
        targetLanguage
    } = useRoomStore(
        useShallow((state) => ({
            isOpen: state.isSummaryModalOpen,
            toggle: state.toggleSummaryModal,
            isGenerating: state.isGeneratingSummary,
            summary: state.summaryData,
            actionItems: state.actionItems,
            targetLanguage: state.targetLanguage
        }))
    );

    return (
        <Dialog open={isOpen} onOpenChange={toggle}>
            <DialogContent className="sm:max-w-[700px] bg-zinc-950/90 backdrop-blur-xl border-zinc-800 text-zinc-100 max-h-[85vh] flex flex-col p-6">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        Meeting Summary
                        <span className="text-sm font-normal text-muted-foreground bg-zinc-800 px-2 py-0.5 rounded-full uppercase">
                            {targetLanguage}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden mt-4">
                    {isGenerating ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-4">
                            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                            <p className="text-zinc-400">Generating summary using AI...</p>
                        </div>
                    ) : summary ? (
                        <ScrollArea className="h-[60vh] pr-4">
                            <div className="space-y-6">
                                <section>
                                    <h3 className="text-lg font-semibold mb-3 text-blue-400">Summary</h3>
                                    <div className="prose prose-invert prose-sm max-w-none text-zinc-300">
                                        <Markdown>{summary}</Markdown>
                                    </div>
                                </section>

                                {actionItems && actionItems.length > 0 && (
                                    <section>
                                        <h3 className="text-lg font-semibold mb-3 text-green-400">Action Items</h3>
                                        <ul className="space-y-2">
                                            {actionItems.map((item, i) => (
                                                <li key={i} className="flex gap-2 text-sm text-zinc-300 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800/50">
                                                    <span className="font-bold text-green-500/50 select-none">•</span>
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}
                            </div>
                        </ScrollArea>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-zinc-500 space-y-2">
                            <AlertCircle className="w-10 h-10 opacity-20" />
                            <p>No summary available.</p>
                            <p className="text-xs">Click "Summarize" in the control bar to generate one.</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
