/**
 * WebRTC Client for Peer-to-Peer Video Conferencing
 * 
 * @example
 * ```typescript
 * const manager = new WebRTCManager(clientInfo, websocketClient);
 * await manager.initializeLocalMedia();
 * await manager.addPeer('peer-id', true);
 * ```
 */

import { WebSocketClient } from './websockets';
import type { 
    ClientInfo,
    WebRTCOfferPayload,
    WebRTCAnswerPayload,
    WebRTCCandidatePayload,
    WebRTCRenegotiatePayload
} from '../../shared/types/events';

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  video: boolean | MediaTrackConstraints;
  audio: boolean | MediaTrackConstraints;
  screenshare?: boolean;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
export type StreamType = 'camera' | 'screen' | 'audio';
export type PeerEventType = 
  | 'stream-added'
  | 'stream-removed' 
  | 'connection-state-changed'
  | 'ice-candidate'
  | 'negotiation-needed'
  | 'data-channel-message';

export type StreamEventHandler = (stream: MediaStream, peerId: string, streamType: StreamType) => void;
export type ConnectionStateHandler = (state: PeerConnectionState, peerId: string) => void;
export type ICECandidateHandler = (candidate: RTCIceCandidate, peerId: string) => void;
export type NegotiationNeededHandler = (peerId: string) => void;
export type DataChannelMessageHandler = (message: unknown, peerId: string) => void;

export class PeerConnection {
  private pc: RTCPeerConnection;
  private peerId: string;
  private localClientInfo: ClientInfo;
  private websocketClient: WebSocketClient;
  private dataChannel: RTCDataChannel | null = null;
  private localStreams = new Map<StreamType, MediaStream>();
  private remoteStreams = new Map<StreamType, MediaStream>();
  private streamAddedHandlers: StreamEventHandler[] = [];
  private streamRemovedHandlers: StreamEventHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];
  private iceCandidateHandlers: ICECandidateHandler[] = [];
  private negotiationNeededHandlers: NegotiationNeededHandler[] = [];
  private dataChannelMessageHandlers: DataChannelMessageHandler[] = [];

  constructor(
    peerId: string,
    localClientInfo: ClientInfo,
    websocketClient: WebSocketClient,
    config: WebRTCConfig
  ) {
    this.peerId = peerId;
    this.localClientInfo = localClientInfo;
    this.websocketClient = websocketClient;

    this.pc = new RTCPeerConnection({
      iceServers: config.iceServers || DEFAULT_ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });

    this.setupPeerConnectionEvents();
    this.createDataChannel();
  }

  async addLocalStream(stream: MediaStream, streamType: StreamType = 'camera'): Promise<void> {
    try {
      if (this.localStreams.has(streamType)) {
        await this.removeLocalStream(streamType);
      }

      stream.getTracks().forEach(track => {
        this.pc.addTrack(track, stream);
      });

      this.localStreams.set(streamType, stream);
    } catch (error) {
      console.error(`Failed to add local ${streamType} stream:`, error);
      throw error;
    }
  }

  async removeLocalStream(streamType: StreamType): Promise<void> {
    const stream = this.localStreams.get(streamType);
    if (!stream) return;

    try {
      const senders = this.pc.getSenders();
      stream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track === track);
        if (sender) {
          this.pc.removeTrack(sender);
        }
        track.stop();
      });

      this.localStreams.delete(streamType);
    } catch (error) {
      console.error(`Failed to remove local ${streamType} stream:`, error);
      throw error;
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    try {
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      
      await this.pc.setLocalDescription(offer);
      this.websocketClient.sendWebRTCOffer(offer, this.peerId, this.localClientInfo);      
      return offer;
    } catch (error) {
      console.error('Failed to create offer:', error);
      throw error;
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    try {
      await this.pc.setRemoteDescription(offer);
      
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      
      this.websocketClient.sendWebRTCAnswer(answer, this.peerId, this.localClientInfo);
      return answer;
    } catch (error) {
      console.error('Failed to handle offer:', error);
      throw error;
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      await this.pc.setRemoteDescription(answer);
    } catch (error) {
      console.error('Failed to handle answer:', error);
      throw error;
    }
  }

  async handleICECandidate(candidateData: { candidate: string; sdpMid?: string; sdpMLineIndex?: number }): Promise<void> {
    try {
      const candidate = new RTCIceCandidate({
        candidate: candidateData.candidate,
        sdpMid: candidateData.sdpMid || null,
        sdpMLineIndex: candidateData.sdpMLineIndex ?? null,
      });
      
      await this.pc.addIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
      throw error;
    }
  }

  async requestRenegotiation(reason: string): Promise<void> {
    try {
      this.websocketClient.requestRenegotiation(this.peerId, reason, this.localClientInfo);
    } catch (error) {
      console.error('Failed to request renegotiation:', error);
      throw error;
    }
  }

  sendData(data: unknown): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(data));
      } catch (error) {
        console.error('Failed to send data:', error);
      }
    } else {
      console.warn('Data channel not available or not open');
    }
  }

  getRemoteStreams(): Map<StreamType, MediaStream> {
    return new Map(this.remoteStreams);
  }

  getLocalStreams(): Map<StreamType, MediaStream> {
    return new Map(this.localStreams);
  }

  getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  async getStats(): Promise<RTCStatsReport> {
    return await this.pc.getStats();
  }

  close(): void {
    try {
      this.localStreams.forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
      });
      this.localStreams.clear();

      if (this.dataChannel) {
        this.dataChannel.close();
        this.dataChannel = null;
      }

      this.pc.close();
      
      console.log(`Closed peer connection with ${this.peerId}`);
    } catch (error) {
      console.error('Error closing peer connection:', error);
    }
  }

  onStreamAdded(handler: StreamEventHandler): void {
    this.streamAddedHandlers.push(handler);
  }

  onStreamRemoved(handler: StreamEventHandler): void {
    this.streamRemovedHandlers.push(handler);
  }

  onConnectionStateChanged(handler: ConnectionStateHandler): void {
    this.connectionStateHandlers.push(handler);
  }

  onICECandidate(handler: ICECandidateHandler): void {
    this.iceCandidateHandlers.push(handler);
  }

  onNegotiationNeeded(handler: NegotiationNeededHandler): void {
    this.negotiationNeededHandlers.push(handler);
  }

  onDataChannelMessage(handler: DataChannelMessageHandler): void {
    this.dataChannelMessageHandlers.push(handler);
  }

  private setupPeerConnectionEvents(): void {
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.websocketClient.sendICECandidate(event.candidate, this.peerId, this.localClientInfo);
        
        this.iceCandidateHandlers.forEach(handler => {
          try {
            handler(event.candidate!, this.peerId);
          } catch (error) {
            console.error('Error in ICE candidate handler:', error);
          }
        });
      }
    };

    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        const hasVideo = stream.getVideoTracks().length > 0;
        const hasAudio = stream.getAudioTracks().length > 0;
        
        let streamType: StreamType = 'camera';
        if (hasVideo && !hasAudio) {
          streamType = 'screen';
        } else if (!hasVideo && hasAudio) {
          streamType = 'audio';
        }

        this.remoteStreams.set(streamType, stream);
        
        this.streamAddedHandlers.forEach(handler => {
          try {
            handler(stream, this.peerId, streamType);
          } catch (error) {
            console.error('Error in stream added handler:', error);
          }
        });

        console.log(`Received remote ${streamType} stream from peer ${this.peerId}`);
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState as PeerConnectionState;
      
      this.connectionStateHandlers.forEach(handler => {
        try {
          handler(state, this.peerId);
        } catch (error) {
          console.error('Error in connection state handler:', error);
        }
      });

      console.log(`Peer ${this.peerId} connection state: ${state}`);
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log(`Peer ${this.peerId} ICE connection state: ${this.pc.iceConnectionState}`);
    };

    this.pc.onnegotiationneeded = () => {
      this.negotiationNeededHandlers.forEach(handler => {
        try {
          handler(this.peerId);
        } catch (error) {
          console.error('Error in negotiation needed handler:', error);
        }
      });

      console.log(`Negotiation needed for peer ${this.peerId}`);
    };

    this.pc.ondatachannel = (event) => {
      const channel = event.channel;
      this.setupDataChannelEvents(channel);
    };
  }

  private createDataChannel(): void {
    try {
      this.dataChannel = this.pc.createDataChannel('data', {
        ordered: true,
        maxRetransmits: 3,
      });
      
      this.setupDataChannelEvents(this.dataChannel);
    } catch (error) {
      console.error('Failed to create data channel:', error);
    }
  }

  private setupDataChannelEvents(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log(`Data channel opened with peer ${this.peerId}`);
    };

    channel.onclose = () => {
      console.log(`Data channel closed with peer ${this.peerId}`);
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.dataChannelMessageHandlers.forEach(handler => {
          try {
            handler(data, this.peerId);
          } catch (error) {
            console.error('Error in data channel message handler:', error);
          }
        });
      } catch (error) {
        console.error('Failed to parse data channel message:', error);
      }
    };

    channel.onerror = (error) => {
      console.error(`Data channel error with peer ${this.peerId}:`, error);
    };
  }
}

export class WebRTCManager {
  private peers = new Map<string, PeerConnection>();
  private localClientInfo: ClientInfo;
  private websocketClient: WebSocketClient;
  private config: WebRTCConfig;
  private localMediaStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private streamAddedHandlers: StreamEventHandler[] = [];
  private streamRemovedHandlers: StreamEventHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];

  constructor(
    localClientInfo: ClientInfo,
    websocketClient: WebSocketClient,
    config: Partial<WebRTCConfig> = {}
  ) {
    this.localClientInfo = localClientInfo;
    this.websocketClient = websocketClient;
    this.config = {
      iceServers: DEFAULT_ICE_SERVERS,
      video: true,
      audio: true,
      screenshare: false,
      ...config,
    };

    this.setupWebSocketHandlers();
  }

  async initializeLocalMedia(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: this.config.video,
        audio: this.config.audio,
      });

      this.localMediaStream = stream;
      
      for (const peer of this.peers.values()) {
        await peer.addLocalStream(stream, 'camera');
      }

      console.log('Local media stream initialized');
      return stream;
    } catch (error) {
      console.error('Failed to initialize local media:', error);
      throw error;
    }
  }

  async startScreenShare(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      this.localScreenStream = stream;
      
      for (const peer of this.peers.values()) {
        await peer.addLocalStream(stream, 'screen');
        await peer.requestRenegotiation('screen sharing started');
      }

      stream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };

      console.log('Screen sharing started');
      return stream;
    } catch (error) {
      console.error('Failed to start screen sharing:', error);
      throw error;
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.localScreenStream) return;

    try {
      for (const peer of this.peers.values()) {
        await peer.removeLocalStream('screen');
        await peer.requestRenegotiation('screen sharing stopped');
      }

      this.localScreenStream.getTracks().forEach(track => track.stop());
      this.localScreenStream = null;

      console.log('Screen sharing stopped');
    } catch (error) {
      console.error('Failed to stop screen sharing:', error);
      throw error;
    }
  }

  async addPeer(peerId: string, initiateConnection = false): Promise<PeerConnection> {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId)!;
    }

    const peer = new PeerConnection(
      peerId,
      this.localClientInfo,
      this.websocketClient,
      this.config
    );

    peer.onStreamAdded((stream, peerId, streamType) => {
      this.streamAddedHandlers.forEach(handler => handler(stream, peerId, streamType));
    });

    peer.onStreamRemoved((stream, peerId, streamType) => {
      this.streamRemovedHandlers.forEach(handler => handler(stream, peerId, streamType));
    });

    peer.onConnectionStateChanged((state, peerId) => {
      this.connectionStateHandlers.forEach(handler => handler(state, peerId));
    });

    this.peers.set(peerId, peer);

    if (this.localMediaStream) {
      await peer.addLocalStream(this.localMediaStream, 'camera');
    }
    if (this.localScreenStream) {
      await peer.addLocalStream(this.localScreenStream, 'screen');
    }

    if (initiateConnection) {
      await peer.createOffer();
    }

    console.log(`Added peer ${peerId}`);
    return peer;
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
      console.log(`Removed peer ${peerId}`);
    }
  }

  getPeer(peerId: string): PeerConnection | undefined {
    return this.peers.get(peerId);
  }

  getAllPeers(): Map<string, PeerConnection> {
    return new Map(this.peers);
  }

  toggleAudio(enabled: boolean): void {
    if (this.localMediaStream) {
      this.localMediaStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  toggleVideo(enabled: boolean): void {
    if (this.localMediaStream) {
      this.localMediaStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }

  getLocalMediaStream(): MediaStream | null {
    return this.localMediaStream;
  }

  getLocalScreenStream(): MediaStream | null {
    return this.localScreenStream;
  }

  cleanup(): void {
    this.peers.forEach(peer => peer.close());
    this.peers.clear();

    if (this.localMediaStream) {
      this.localMediaStream.getTracks().forEach(track => track.stop());
      this.localMediaStream = null;
    }
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach(track => track.stop());
      this.localScreenStream = null;
    }

    console.log('WebRTC manager cleaned up');
  }

  onStreamAdded(handler: StreamEventHandler): void {
    this.streamAddedHandlers.push(handler);
  }

  onStreamRemoved(handler: StreamEventHandler): void {
    this.streamRemovedHandlers.push(handler);
  }

  onConnectionStateChanged(handler: ConnectionStateHandler): void {
    this.connectionStateHandlers.push(handler);
  }

  private setupWebSocketHandlers(): void {
    this.websocketClient.on('offer', async (message) => {
      const payload = message.payload as WebRTCOfferPayload;
      if (payload.targetClientId === this.localClientInfo.clientId) {
        const peer = await this.addPeer(payload.clientId, false);
        await peer.handleOffer({ type: 'offer', sdp: payload.sdp });
      }
    });

    this.websocketClient.on('answer', async (message) => {
      const payload = message.payload as WebRTCAnswerPayload;
      if (payload.targetClientId === this.localClientInfo.clientId) {
        const peer = this.getPeer(payload.clientId);
        if (peer) {
          await peer.handleAnswer({ type: 'answer', sdp: payload.sdp });
        }
      }
    });

    this.websocketClient.on('candidate', async (message) => {
      const payload = message.payload as WebRTCCandidatePayload;
      if (payload.targetClientId === this.localClientInfo.clientId) {
        const peer = this.getPeer(payload.clientId);
        if (peer) {
          await peer.handleICECandidate({
            candidate: payload.candidate,
            sdpMid: payload.sdpMid,
            sdpMLineIndex: payload.sdpMLineIndex,
          });
        }
      }
    });

    this.websocketClient.on('renegotiate', async (message) => {
      const payload = message.payload as WebRTCRenegotiatePayload;
      if (payload.targetClientId === this.localClientInfo.clientId) {
        const peer = this.getPeer(payload.clientId);
        if (peer) {
          await peer.createOffer();
          console.log(`Renegotiation requested by ${payload.clientId}: ${payload.reason}`);
        }
      }
    });
  }
}

export const MediaDeviceUtils = {
  async getDevices(): Promise<MediaDeviceInfo[]> {
    try {
      return await navigator.mediaDevices.enumerateDevices();
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      return [];
    }
  },

  async getVideoDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await this.getDevices();
    return devices.filter(device => device.kind === 'videoinput');
  },

  async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await this.getDevices();
    return devices.filter(device => device.kind === 'audioinput');
  },

  async getAudioOutputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await this.getDevices();
    return devices.filter(device => device.kind === 'audiooutput');
  },

  async requestPermissions(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Failed to request media permissions:', error);
      return false;
    }
  },

  isScreenShareSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  },
};

export default WebRTCManager;
