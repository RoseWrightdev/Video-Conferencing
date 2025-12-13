'use client';

import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import DeviceSelector from '@/components/settings/components/DeviceSelector';
import { X as XIcon, RefreshCw, LayoutGrid } from 'lucide-react';
import type { GridLayout } from '@/store/types';
import { cn } from '@/lib/utils';
import * as Typo from '@/components/ui/typography';
import { createLogger } from '@/lib/logger';

export interface SettingsPanelProps {
    gridLayout: GridLayout;
    setGridLayout: (layout: GridLayout) => void;
    onClose: () => void;
    refreshDevices: () => void;
    className?: string;
}

/**
 * Centered modal panel for room settings with frosted glass styling.
 * 
 * Features:
 * - Display settings (grid layout)
 * - Media settings (device selection, mirror video)
 * 
 * @example
 * ```tsx
 * <SettingsPanel
 *   gridLayout={gridLayout}
 *   setGridLayout={setGridLayout}
 *   onClose={() => toggleSettingsPanel()}
 * />
 * ```
 */
export default function SettingsPanel({
    gridLayout,
    setGridLayout,
    onClose,
    refreshDevices,
    className,
}: SettingsPanelProps) {
    const logger = createLogger('SettingsPanel');
    return (
        <div
            className={cn(
                "absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm pointer-events-auto",
                className
            )}
            onClick={onClose}
        >
            <div
                className="w-full max-w-4xl max-h-[85vh] rounded-2xl flex flex-col bg-white/50 frosted-3 overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 pb-0 flex items-center justify-between shrink-0 border-black/10">
                    <div className="flex items-center gap-2">
                        <Typo.H3 className="font-semibold text-black text-lg">Settings</Typo.H3>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="rounded-full -m-2"
                        aria-label="Close settings panel"
                    >
                        <XIcon className="h-5 w-5 text-black" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    <Tabs defaultValue="general" className="space-y-4">
                        <TabsList className="grid w-full grid-cols-5 bg-white/30">
                            <TabsTrigger value="general" className="data-[state=active]:bg-white/60">General</TabsTrigger>
                            <TabsTrigger value="video" className="data-[state=active]:bg-white/60">Video</TabsTrigger>
                            <TabsTrigger value="audio" className="data-[state=active]:bg-white/60">Audio</TabsTrigger>
                            <TabsTrigger value="layout" className="data-[state=active]:bg-white/60">Layout</TabsTrigger>
                            <TabsTrigger value="notifications" className="data-[state=active]:bg-white/60">Notifications</TabsTrigger>
                        </TabsList>

                        {/* General Tab */}
                        <TabsContent value="general" className="space-y-4">
                            <Card className="bg-white/40 border-black/10">
                                <CardHeader>
                                    <Typo.H4 className="text-black">Profile</Typo.H4>
                                    <Typo.Muted className="text-black/70">
                                        Customize your display name and avatar
                                    </Typo.Muted>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="display-name" className="text-black">Display Name</Label>
                                        <Input
                                            id="display-name"
                                            placeholder="Enter your name"
                                            className="bg-white/50 border-black/10"
                                            disabled
                                        />
                                        <Typo.Small className="text-black/60">Coming soon - Change your display name</Typo.Small>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-black">Profile Picture</Label>
                                        <Button variant="outline" disabled className="w-full">
                                            Upload Avatar
                                        </Button>
                                        <Typo.Small className="text-black/60">Coming soon - Custom profile pictures</Typo.Small>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white/40 border-black/10">
                                <CardHeader>
                                    <Typo.H4 className="text-black">Keyboard Shortcuts</Typo.H4>
                                    <Typo.Muted className="text-black/70">
                                        Quick actions with hotkeys
                                    </Typo.Muted>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Enable Keyboard Shortcuts</Label>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                <div className="flex items-center gap-1">
                                                    <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>D</Kbd>
                                                    <Typo.Small className="text-black/60">mute</Typo.Small>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>E</Kbd>
                                                    <Typo.Small className="text-black/60">video</Typo.Small>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>S</Kbd>
                                                    <Typo.Small className="text-black/60">share</Typo.Small>
                                                </div>
                                            </div>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <Typo.Small className="text-black/60">Coming soon - Keyboard shortcuts</Typo.Small>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Video Tab */}
                        <TabsContent value="video" className="space-y-4">
                            <Card className="bg-white/40 border-black/10">
                                <CardHeader>
                                    <Typo.H4 className="text-black">Camera Selection</Typo.H4>
                                    <Typo.Muted className="text-black/70">
                                        Choose your video input device
                                    </Typo.Muted>
                                    <CardAction>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={refreshDevices}
                                            className="text-black hover:bg-white/30 rounded-full"
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
                                    </CardAction>
                                </CardHeader>
                                <CardContent>
                                    <DeviceSelector
                                        onDeviceChange={(deviceId, kind) => {
                                            logger.info(`Device changed: ${kind} -> ${deviceId}`);
                                        }}
                                    />
                                </CardContent>
                            </Card>

                            <Card className="bg-white/40 border-black/10">
                                <CardHeader>
                                    <Typo.H4 className="text-black">Video Effects</Typo.H4>
                                    <Typo.Muted className="text-black/70">
                                        Apply visual effects to your video
                                    </Typo.Muted>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Mirror my video</Label>
                                            <Typo.Small className="text-black/60">
                                                Show your video mirrored (flipped horizontally)
                                            </Typo.Small>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Background Blur</Label>
                                            <Typo.Small className="text-black/60">
                                                Blur your background without replacement
                                            </Typo.Small>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-black">Virtual Background</Label>
                                        <Button variant="outline" disabled className="w-full">
                                            Choose Background
                                        </Button>
                                        <Typo.Small className="text-black/60">Coming soon - Virtual backgrounds and blur</Typo.Small>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white/40 border-black/10">
                                <CardHeader>
                                    <Typo.H4 className="text-black">Ambient Effects</Typo.H4>
                                    <Typo.Muted className="text-black/70">
                                        Dynamic visual enhancements
                                    </Typo.Muted>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Edge Glow Effect</Label>
                                            <Typo.Small className="text-black/60">
                                                YouTube-style ambient lighting around video tiles
                                            </Typo.Small>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Speaker Color Shift</Label>
                                            <Typo.Small className="text-black/60">
                                                Background shifts to speaker's color when talking
                                            </Typo.Small>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <Typo.Small className="text-black/60">Coming soon - Dynamic ambient effects</Typo.Small>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Audio Tab */}
                        <TabsContent value="audio" className="space-y-4">
                            <Card className="bg-white/40 border-black/10">
                                <CardHeader>
                                    <Typo.H4 className="text-black">Audio Devices</Typo.H4>
                                    <Typo.Muted className="text-black/70">
                                        Choose your microphone and speakers
                                    </Typo.Muted>
                                    <CardAction>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={refreshDevices}
                                            className="text-black hover:bg-white/30 rounded-full"
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
                                    </CardAction>
                                </CardHeader>
                                <CardContent>
                                    <DeviceSelector
                                        onDeviceChange={(deviceId, kind) => {
                                            logger.info(`Device changed: ${kind} -> ${deviceId}`);
                                        }}
                                    />
                                </CardContent>
                            </Card>

                            <Card className="bg-white/40 border-black/10">
                                <CardHeader>
                                    <Typo.H4 className="text-black">Audio Enhancements</Typo.H4>
                                    <Typo.Muted className="text-black/70">
                                        Improve audio quality with filters
                                    </Typo.Muted>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Noise Suppression</Label>
                                            <Typo.Small className="text-black/60">
                                                Filter out background noise during calls
                                            </Typo.Small>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Echo Cancellation</Label>
                                            <Typo.Small className="text-black/60">
                                                Reduce audio feedback and echo
                                            </Typo.Small>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-black">Audio Quality</Label>
                                        <Select disabled>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select quality" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="high">High - 128kbps</SelectItem>
                                                <SelectItem value="medium">Medium - 64kbps</SelectItem>
                                                <SelectItem value="low">Low - 32kbps</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Typo.Small className="text-black/60">Coming soon - Audio enhancements</Typo.Small>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Layout Tab */}
                        <TabsContent value="layout" className="space-y-4">
                            <Card className="bg-white/40 border-black/10">
                                <CardHeader>
                                    <Typo.H4 className="text-black">Grid Layout</Typo.H4>
                                    <Typo.Muted className="text-black/70">
                                        Choose how participants are displayed in the room
                                    </Typo.Muted>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="grid-layout" className="text-black">
                                            <LayoutGrid className="w-4 h-4 text-black inline mr-2" />
                                            Grid Layout
                                        </Label>
                                        <Select value={gridLayout} onValueChange={(value) => setGridLayout(value as GridLayout)}>
                                            <SelectTrigger id="grid-layout">
                                                <SelectValue placeholder="Select layout" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="gallery">Gallery - Equal-sized grid of all participants</SelectItem>
                                                <SelectItem value="speaker">Speaker - Large view for active speaker</SelectItem>
                                                <SelectItem value="sidebar">Sidebar - Main content with participant list</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Notifications Tab */}
                        <TabsContent value="notifications" className="space-y-4">
                            <Card className="bg-white/40 border-black/10">
                                <CardHeader>
                                    <Typo.H4 className="text-black">Activity Notifications</Typo.H4>
                                    <Typo.Muted className="text-black/70">
                                        Control when you receive notifications
                                    </Typo.Muted>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Join/Leave Notifications</Label>
                                            <Typo.Small className="text-black/60">
                                                Show when participants join or leave
                                            </Typo.Small>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Hand Raise Alerts</Label>
                                            <Typo.Small className="text-black/60">
                                                Notify when someone raises their hand
                                            </Typo.Small>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-black">Sound Notifications</Label>
                                            <Typo.Small className="text-black/60">
                                                Play sounds for notifications
                                            </Typo.Small>
                                        </div>
                                        <Switch disabled />
                                    </div>
                                    <Typo.Small className="text-black/60">Coming soon - Notification preferences</Typo.Small>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
