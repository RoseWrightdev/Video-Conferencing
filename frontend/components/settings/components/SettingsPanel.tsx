'use client';

import { useRouter, useSearchParams } from 'next/navigation';
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
import Link from 'next/link';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get active tab from URL or default to 'basic'
  const activeTab = searchParams.get('tab') || 'basic';
  
  // Update URL when tab changes
  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  
  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xl pointer-events-auto",
        className
      )}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[85vh] rounded-2xl flex flex-col bg-white/50 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 pb-0 flex items-center justify-between shrink-0">
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
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 bg-white/50 sticky top-0 z-10 border-b border-black/10 mb-4">
              <TabsTrigger value="basic" className="data-[state=active]:bg-white black">Basic</TabsTrigger>
              <TabsTrigger value="media" className="data-[state=active]:bg-white black">Advanced</TabsTrigger>
              <TabsTrigger value="about" className="data-[state=active]:bg-white black">About</TabsTrigger>
            </TabsList>

            {/* Basic Tab */}
            <TabsContent value="basic" className="space-y-4">
              <Card className="bg-white/40 border-black/10">
                <CardHeader>
                  <Typo.H4 className="text-black">Account</Typo.H4>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="display-name" className="text-black">Display Name</Label>
                    <Input
                      id="display-name"
                      placeholder="Enter your name"
                      className="bg-white border-black/10"
                    />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/40 border-black/10">
                <CardHeader>
                  <Typo.H4 className="text-black">Backgrounds</Typo.H4>
                  <Typo.Muted className="text-black/70">
                    Apply visual effects to your video
                  </Typo.Muted>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-black">Background Blur</Label>
                      <Typo.Small className="text-black/60">
                        Blur your background without replacement
                      </Typo.Small>
                    </div>
                    <Switch />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-black">Background Image</Label>
                    <Button variant="outline">
                      Choose Background
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
                      <div className="flex items-left gap-2">
                        <LayoutGrid className="w-4 h-4 text-black inline mr-auto" />
                        Grid Layout
                      </div>
                    </Label>
                    <Select value={gridLayout} onValueChange={(value) => setGridLayout(value as GridLayout)}>
                      <SelectTrigger id="grid-layout" className="bg-white border-black/10">
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

            {/* Media Tab */}
            <TabsContent value="media" className="space-y-4">
              <Card className="bg-white/40 border-black/10">
                <CardHeader>
                  <Typo.H4 className="text-black">Device Selection</Typo.H4>
                  <Typo.Muted className="text-black/70">
                    Choose your input devices
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
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-black">Echo Cancellation</Label>
                      <Typo.Small className="text-black/60">
                        Reduce audio feedback and echo
                      </Typo.Small>
                    </div>
                    <Switch />
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
                <CardContent>
                  <table className="w-full table-auto border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left p-4 text-black font-semibold">Shortcut</th>
                        <th className="text-left p-4 text-black font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-black/20">
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>D</Kbd>
                          </div>
                        </td>
                        <td className="p-4">
                          <Typo.Small>Toggle mute</Typo.Small>
                        </td>
                      </tr>
                      <tr className="border-t border-black/20">
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>E</Kbd>
                          </div>
                        </td>
                        <td className="p-4">
                          <Typo.Small>Toggle video</Typo.Small>
                        </td>
                      </tr>
                      <tr className="border-t border-black/20">
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>S</Kbd>
                          </div>
                        </td>
                        <td className="p-4">
                          <Typo.Small>Toggle screen share</Typo.Small>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* About Tab */}
            <TabsContent value="about" className="space-y-4">
              <Card className="bg-white/40 border-black/10">
                <CardHeader>
                  <Typo.H4 className="text-black">Resources</Typo.H4>
                  <Typo.Muted className="text-black/70">
                    Documentation and support links
                  </Typo.Muted>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="justify-start" asChild>
                    <Link href="https://github.com/RoseWrightdev/Video-Conferencing" target="_blank" rel="noopener noreferrer">
                      <Typo.Small className="text-black">GitHub Repository</Typo.Small>
                    </Link>
                  </Button>
                </CardContent>
              </Card>
              <Card className="bg-white/40 border-black/10">
                <CardHeader>
                  <Typo.H4 className="text-black">Application Info</Typo.H4>
                  <Typo.Muted className="text-black/70">
                    Version and build information
                  </Typo.Muted>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Typo.Small className="text-black">Version</Typo.Small>
                    <Typo.Small className="text-black/60 font-mono">1.0.0-beta</Typo.Small>
                  </div>
                  <div className="flex items-center justify-between">
                    <Typo.Small className="text-black">Build</Typo.Small>
                    <Typo.Small className="text-black/60 font-mono">{new Date().toISOString().split('T')[0]}</Typo.Small>
                  </div>
                  <div className="flex items-center justify-between">
                    <Typo.Small className="text-black">Environment</Typo.Small>
                    <Typo.Small className="text-black/60">{process.env.NODE_ENV}</Typo.Small>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
