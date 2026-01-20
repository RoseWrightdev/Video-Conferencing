"use client";

import { Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRoomStore } from "@/store/useRoomStore";
import { useShallow } from 'zustand/react/shallow';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import * as Typo from "@/components/ui/typography";

const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "fr", label: "French" },
    { code: "de", label: "German" },
    { code: "zh", label: "Chinese" },
    { code: "ja", label: "Japanese" },
    { code: "pt", label: "Portuguese" },
    { code: "ru", label: "Russian" },
    { code: "it", label: "Italian" },
];

export function LanguageSelector() {
    const { targetLanguage, setTargetLanguage } = useRoomStore(
        useShallow((state) => ({
            targetLanguage: state.targetLanguage,
            setTargetLanguage: state.setTargetLanguage,
        }))
    );

    const currentLang = LANGUAGES.find((l) => l.code === targetLanguage) || LANGUAGES[0];

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="default"
                            size="icon"
                            className="rounded-full frosted-2 bg-white/10 hover:bg-white/50 text-white hover:text-black"
                            aria-label={`Select Language: ${currentLang.label}`}
                        >
                            <Globe className="size-5" />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                    <Typo.P>Language: {currentLang.label}</Typo.P>
                </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-48">
                {LANGUAGES.map((lang) => (
                    <DropdownMenuItem
                        key={lang.code}
                        onClick={() => setTargetLanguage(lang.code)}
                        className="flex items-center justify-between cursor-pointer"
                    >
                        {lang.label}
                        {lang.code === targetLanguage && <Check className="ml-2 size-4" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
