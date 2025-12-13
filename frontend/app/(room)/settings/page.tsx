'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import DeviceSelector from '@/components/settings/components/DeviceSelector';
import { useState } from 'react';
import { useRoomStore } from '@/store/useRoomStore';
import type { GridLayout, RoomStoreState } from '@/store/types';

export default function SettingsPage() {
  const gridLayout = useRoomStore((state: RoomStoreState) => state.gridLayout);
  const setGridLayout = useRoomStore((state: RoomStoreState) => state.setGridLayout);

  const [settings, setSettings] = useState({
    // Audio settings
    autoMute: false,
    noiseSuppression: true,
    echoCancellation: true,
    audioQuality: 'high',
    
    // Video settings
    autoStartVideo: true,
    hdVideo: true,
    virtualBackground: false,
    mirrorVideo: true,
    
    // Notifications
    chatNotifications: true,
    participantJoinNotifications: true,
    screenShareNotifications: true,
    soundEffects: true,
    
    // Privacy
    showParticipantsList: true,
    allowRecording: false,
    shareSystemAudio: false,
    
    // Display
    darkMode: false,
    compactView: false,
    showParticipantNames: true,
  });

  const handleToggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Manage your video conferencing preferences and configurations
        </p>
      </div>

      <Tabs defaultValue="display" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="display">Display</TabsTrigger>
          <TabsTrigger value="audio">Audio</TabsTrigger>
          <TabsTrigger value="video">Video</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        {/* Display Settings */}
        <TabsContent value="display" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Layout Settings</CardTitle>
              <CardDescription>
                Choose how participants are displayed in the room
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="grid-layout">Grid Layout</Label>
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
                <p className="text-sm text-muted-foreground">
                  Current layout: <span className="font-semibold capitalize">{gridLayout}</span>
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-participant-names">Show participant names</Label>
                  <p className="text-sm text-muted-foreground">
                    Display names on video tiles
                  </p>
                </div>
                <Switch
                  id="show-participant-names"
                  checked={settings.showParticipantNames}
                  onCheckedChange={() => handleToggle('showParticipantNames')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode">Dark mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Use dark theme for the interface
                  </p>
                </div>
                <Switch
                  id="dark-mode"
                  checked={settings.darkMode}
                  onCheckedChange={() => handleToggle('darkMode')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="compact-view">Compact view</Label>
                  <p className="text-sm text-muted-foreground">
                    Reduce spacing in the interface
                  </p>
                </div>
                <Switch
                  id="compact-view"
                  checked={settings.compactView}
                  onCheckedChange={() => handleToggle('compactView')}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audio Settings */}
        <TabsContent value="audio" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Audio Devices</CardTitle>
              <CardDescription>
                Select your microphone and speaker
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeviceSelector 
                onDeviceChange={(deviceId, kind) => {
                  console.log('Device changed:', { deviceId, kind });
                  // Handle device change logic here
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audio Settings</CardTitle>
              <CardDescription>
                Configure your audio preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-mute">Auto-mute on join</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically mute microphone when joining a room
                  </p>
                </div>
                <Switch
                  id="auto-mute"
                  checked={settings.autoMute}
                  onCheckedChange={() => handleToggle('autoMute')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="noise-suppression">Noise suppression</Label>
                  <p className="text-sm text-muted-foreground">
                    Filter out background noise during calls
                  </p>
                </div>
                <Switch
                  id="noise-suppression"
                  checked={settings.noiseSuppression}
                  onCheckedChange={() => handleToggle('noiseSuppression')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="echo-cancellation">Echo cancellation</Label>
                  <p className="text-sm text-muted-foreground">
                    Reduce echo from speakers and microphone
                  </p>
                </div>
                <Switch
                  id="echo-cancellation"
                  checked={settings.echoCancellation}
                  onCheckedChange={() => handleToggle('echoCancellation')}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="audio-quality">Audio quality</Label>
                <select
                  id="audio-quality"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={settings.audioQuality}
                  onChange={(e) => setSettings(prev => ({ ...prev, audioQuality: e.target.value }))}
                >
                  <option value="low">Low (Data saver)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Video Settings */}
        <TabsContent value="video" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Video Settings</CardTitle>
              <CardDescription>
                Customize your video display and quality preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-start-video">Auto-start video</Label>
                  <p className="text-sm text-muted-foreground">
                    Turn on camera automatically when joining
                  </p>
                </div>
                <Switch
                  id="auto-start-video"
                  checked={settings.autoStartVideo}
                  onCheckedChange={() => handleToggle('autoStartVideo')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="hd-video">HD video quality</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable 720p video streaming (uses more bandwidth)
                  </p>
                </div>
                <Switch
                  id="hd-video"
                  checked={settings.hdVideo}
                  onCheckedChange={() => handleToggle('hdVideo')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="virtual-background">Virtual background</Label>
                  <p className="text-sm text-muted-foreground">
                    Blur or replace your background
                  </p>
                </div>
                <Switch
                  id="virtual-background"
                  checked={settings.virtualBackground}
                  onCheckedChange={() => handleToggle('virtualBackground')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="mirror-video">Mirror my video</Label>
                  <p className="text-sm text-muted-foreground">
                    Show your video mirrored (flipped horizontally)
                  </p>
                </div>
                <Switch
                  id="mirror-video"
                  checked={settings.mirrorVideo}
                  onCheckedChange={() => handleToggle('mirrorVideo')}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Control when and how you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="chat-notifications">Chat notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when someone sends a message
                  </p>
                </div>
                <Switch
                  id="chat-notifications"
                  checked={settings.chatNotifications}
                  onCheckedChange={() => handleToggle('chatNotifications')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="participant-notifications">Participant join/leave</Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when someone joins or leaves the room
                  </p>
                </div>
                <Switch
                  id="participant-notifications"
                  checked={settings.participantJoinNotifications}
                  onCheckedChange={() => handleToggle('participantJoinNotifications')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="screen-share-notifications">Screen share notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Alert when someone starts screen sharing
                  </p>
                </div>
                <Switch
                  id="screen-share-notifications"
                  checked={settings.screenShareNotifications}
                  onCheckedChange={() => handleToggle('screenShareNotifications')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sound-effects">Sound effects</Label>
                  <p className="text-sm text-muted-foreground">
                    Play sounds for notifications and events
                  </p>
                </div>
                <Switch
                  id="sound-effects"
                  checked={settings.soundEffects}
                  onCheckedChange={() => handleToggle('soundEffects')}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Privacy Settings */}
        <TabsContent value="privacy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Privacy & Security</CardTitle>
              <CardDescription>
                Control your privacy and security settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-participants">Show participants list</Label>
                  <p className="text-sm text-muted-foreground">
                    Display the list of participants in the room
                  </p>
                </div>
                <Switch
                  id="show-participants"
                  checked={settings.showParticipantsList}
                  onCheckedChange={() => handleToggle('showParticipantsList')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-recording">Allow recording</Label>
                  <p className="text-sm text-muted-foreground">
                    Permit others to record the meeting
                  </p>
                </div>
                <Switch
                  id="allow-recording"
                  checked={settings.allowRecording}
                  onCheckedChange={() => handleToggle('allowRecording')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="share-system-audio">Share system audio</Label>
                  <p className="text-sm text-muted-foreground">
                    Include computer audio when screen sharing
                  </p>
                </div>
                <Switch
                  id="share-system-audio"
                  checked={settings.shareSystemAudio}
                  onCheckedChange={() => handleToggle('shareSystemAudio')}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Display Settings */}
        <TabsContent value="display" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>
                Customize the look and feel of your interface
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode">Dark mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Use dark theme for the interface
                  </p>
                </div>
                <Switch
                  id="dark-mode"
                  checked={settings.darkMode}
                  onCheckedChange={() => handleToggle('darkMode')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="compact-view">Compact view</Label>
                  <p className="text-sm text-muted-foreground">
                    Reduce spacing and show more content
                  </p>
                </div>
                <Switch
                  id="compact-view"
                  checked={settings.compactView}
                  onCheckedChange={() => handleToggle('compactView')}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="show-names">Show participant names</Label>
                  <p className="text-sm text-muted-foreground">
                    Display names on video tiles
                  </p>
                </div>
                <Switch
                  id="show-names"
                  checked={settings.showParticipantNames}
                  onCheckedChange={() => handleToggle('showParticipantNames')}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" onClick={() => window.history.back()}>
          Cancel
        </Button>
        <Button onClick={() => {
          // Save settings logic here
          console.log('Settings saved:', settings);
        }}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}
