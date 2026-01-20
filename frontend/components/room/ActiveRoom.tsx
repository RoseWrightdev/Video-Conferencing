'use client';

import { useState, useRef, useEffect } from 'react';
import ChatPanel from '@/components/chat-panel/components/ChatPanel';
import ControlBar from '@/components/room/components/Controls';
import ParticipantGrid from '@/components/participants/components/ParticipantGrid';
import ParticipantsPanel from '@/components/participants/components/ParticipantsPanel';
import SettingsPanel from '@/components/settings/components/SettingsPanel';
import LeaveRoomDialog from '@/components/room/components/LeaveRoomDialog';
import { CaptionOverlay } from '@/components/room/components/CaptionOverlay';
import { useRoomStore } from '@/store/useRoomStore';
import { useChat } from '@/hooks';
import { useAudioDetection } from '@/hooks/useAudioDetection';

interface ActiveRoomProps {
    permissionsGranted: boolean;
    refreshDevices: () => Promise<void>;
}

export const ActiveRoom = ({ permissionsGranted, refreshDevices }: ActiveRoomProps) => {
    const [showControls, setShowControls] = useState(true);
    const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseMove = () => {
        setShowControls(true);
        if (hideControlsTimeout.current) {
            clearTimeout(hideControlsTimeout.current);
        }
        hideControlsTimeout.current = setTimeout(() => {
            setShowControls(false);
        }, 3000);
    };

    useEffect(() => {
        // Start initial timer - deferred to avoid set-state-in-effect warning
        setTimeout(() => setShowControls(true), 0);

        hideControlsTimeout.current = setTimeout(() => {
            setShowControls(false);
        }, 3000);

        return () => {
            if (hideControlsTimeout.current) {
                clearTimeout(hideControlsTimeout.current);
            }
        };
    }, []);

    const {
        screenShareStream,
        raisingHandParticipants,
        participants,
        unmutedParticipants,
        cameraOnParticipants,
        sharingScreenParticipants,
        isParticipantsPanelOpen,
        isSettingsPanelOpen,
        pinnedParticipantId,
        gridLayout,
        toggleSettingsPanel,
        setGridLayout,
        pinParticipant,
        currentUserId,
    } = useRoomStore();

    const { isChatPanelOpen } = useChat();

    const speakingParticipants = useAudioDetection(
        Array.from(participants.values()),
        0.02,
        permissionsGranted
    );

    return (
        <div
            className="h-screen w-screen flex flex-col overflow-hidden bg-background"
            onMouseMove={handleMouseMove}
        >
            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Video Area */}
                <div className={`flex-1 flex flex-col relative ${!showControls ? 'cursor-none' : ''}`}>
                    <div className="flex-1 bg-[#1a1a1a] overflow-hidden relative">
                        {/* Participant Grid */}
                        <ParticipantGrid
                            participants={Array.from(participants.values())}
                            currentUserId={currentUserId || undefined}
                            pinnedParticipantId={pinnedParticipantId}
                            layout={gridLayout}
                            onLayoutChange={(layout) => setGridLayout(layout)}
                            unmutedParticipants={unmutedParticipants}
                            cameraOnParticipants={cameraOnParticipants}
                            sharingScreenParticipants={sharingScreenParticipants}
                            raisingHandParticipants={raisingHandParticipants}
                            speakingParticipants={speakingParticipants}
                            screenShareStream={screenShareStream}
                            onPinParticipant={(id) => {
                                pinParticipant(pinnedParticipantId === id ? null : id);
                            }}
                        />
                    </div>

                    {/* Controls at bottom of video - auto-hide on inactivity */}
                    <div
                        className={`absolute bottom-0 left-0 right-0 z-30 flex justify-center py-4 transition-all duration-300 ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                            }`}
                    >
                        <ControlBar />
                    </div>

                    {/* Caption Overlay */}
                    <CaptionOverlay />
                </div>

                {/* Chat Panel - Right Side */}
                {isChatPanelOpen && (
                    <ChatPanel />
                )}

                {/* Participants Panel - Left Side */}
                {isParticipantsPanelOpen && (
                    <div className="absolute inset-0 pointer-events-none">
                        <ParticipantsPanel className="pointer-events-auto" />
                    </div>
                )}

                {/* Settings Panel - Centered Modal */}
                {isSettingsPanelOpen && (
                    <SettingsPanel
                        gridLayout={gridLayout}
                        setGridLayout={setGridLayout}
                        refreshDevices={refreshDevices}
                        onClose={() => toggleSettingsPanel()}
                    />
                )}
            </div>

            {/* Global Modals */}
            <LeaveRoomDialog />
        </div>
    );
};
