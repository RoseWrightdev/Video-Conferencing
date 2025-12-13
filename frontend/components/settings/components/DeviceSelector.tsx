'use client';

import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Mic, Video, Volume2 } from 'lucide-react';
import { createLogger } from '@/lib/logger';

const logger = createLogger('DeviceSelector');

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface DeviceSelectorProps {
  onDeviceChange?: (deviceId: string, kind: MediaDeviceKind) => void;
  className?: string;
}

export default function DeviceSelector({ onDeviceChange, className }: DeviceSelectorProps) {
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);

  const [selectedAudioInput, setSelectedAudioInput] = useState<string>('');
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('');
  const [selectedVideoInput, setSelectedVideoInput] = useState<string>('');

  // Enumerate available devices
  const enumerateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 5)}`,
          kind: device.kind,
        }));

      const audioOutputs = devices
        .filter(device => device.kind === 'audiooutput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Speaker ${device.deviceId.slice(0, 5)}`,
          kind: device.kind,
        }));

      const videoInputs = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 5)}`,
          kind: device.kind,
        }));

      setAudioInputDevices(audioInputs);
      setAudioOutputDevices(audioOutputs);
      setVideoInputDevices(videoInputs);

      // Set default selections if not already set
      if (!selectedAudioInput && audioInputs.length > 0) {
        setSelectedAudioInput(audioInputs[0].deviceId);
      }
      if (!selectedAudioOutput && audioOutputs.length > 0) {
        setSelectedAudioOutput(audioOutputs[0].deviceId);
      }
      if (!selectedVideoInput && videoInputs.length > 0) {
        setSelectedVideoInput(videoInputs[0].deviceId);
      }

      logger.debug('Devices enumerated', {
        audioInputs: audioInputs.length,
        audioOutputs: audioOutputs.length,
        videoInputs: videoInputs.length
      });
    } catch (error) {
      logger.debug('Failed to enumerate devices', { error });
    }
  };

  // Handle device changes
  const handleDeviceChange = (deviceId: string, kind: MediaDeviceKind) => {
    logger.debug('Device changed', { deviceId, kind });

    switch (kind) {
      case 'audioinput':
        setSelectedAudioInput(deviceId);
        break;
      case 'audiooutput':
        setSelectedAudioOutput(deviceId);
        break;
      case 'videoinput':
        setSelectedVideoInput(deviceId);
        break;
    }

    onDeviceChange?.(deviceId, kind);
  };

  // Initial enumeration and listen for device changes
  useEffect(() => {
    enumerateDevices();

    // Listen for device changes (plug/unplug)
    const handleDeviceChange = () => {
      logger.debug('Device change detected, re-enumerating');
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, []);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Audio Input (Microphone) */}
      <div className="space-y-2">
        <Label htmlFor="audio-input" className="flex items-center gap-2">
          <Mic className="w-4 h-4" />
          Microphone
        </Label>
        <Select
          value={selectedAudioInput}
          onValueChange={(value) => handleDeviceChange(value, 'audioinput')}
        >
          <SelectTrigger id="audio-input" className="w-full">
            <SelectValue placeholder="Select a microphone" />
          </SelectTrigger>
          <SelectContent>
            {audioInputDevices.length === 0 ? (
              <SelectItem value="none" disabled>
                No microphones found
              </SelectItem>
            ) : (
              audioInputDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Audio Output (Speakers) */}
      <div className="space-y-2">
        <Label htmlFor="audio-output" className="flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Speaker
        </Label>
        <Select
          value={selectedAudioOutput}
          onValueChange={(value) => handleDeviceChange(value, 'audiooutput')}
        >
          <SelectTrigger id="audio-output" className="w-full">
            <SelectValue placeholder="Select a speaker" />
          </SelectTrigger>
          <SelectContent>
            {audioOutputDevices.length === 0 ? (
              <SelectItem value="none" disabled>
                No speakers found
              </SelectItem>
            ) : (
              audioOutputDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Video Input (Camera) */}
      <div className="space-y-2">
        <Label htmlFor="video-input" className="flex items-center gap-2">
          <Video className="w-4 h-4" />
          Camera
        </Label>
        <Select
          value={selectedVideoInput}
          onValueChange={(value) => handleDeviceChange(value, 'videoinput')}
        >
          <SelectTrigger id="video-input" className="w-full">
            <SelectValue placeholder="Select a camera" />
          </SelectTrigger>
          <SelectContent>
            {videoInputDevices.length === 0 ? (
              <SelectItem value="none" disabled>
                No cameras found
              </SelectItem>
            ) : (
              videoInputDevices.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
