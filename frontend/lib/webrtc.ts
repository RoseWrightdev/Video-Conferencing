import { createLogger } from './logger';

const logger = createLogger('WebRTC');

/**
 * WebRTC peer-to-peer connection management for video conferencing.
 * 
 * This module provides a complete WebRTC implementation with:
 * - Peer connection lifecycle management (create, maintain, destroy)
 * - Media stream handling (camera, microphone, screen sharing)
 * - ICE candidate negotiation for NAT traversal
 * - SDP offer/answer exchange via WebSocket signaling
 * - RTCDataChannel for real-time data messaging
 * - Event-driven architecture for stream and state changes
 * 
 * Architecture:
 * - PeerConnection: Manages individual peer-to-peer connections
 * - WebRTCManager: Coordinates multiple peer connections (mesh topology)
 * - MediaDeviceUtils: Device enumeration and permission helpers
 * 
 * WebRTC Flow:
 * 1. Create RTCPeerConnection with ICE servers (STUN/TURN)
 * 2. Add local media streams (getUserMedia)
 * 3. Create offer or receive offer via WebSocket
 * 4. Exchange SDP (Session Description Protocol)
 * 5. Exchange ICE candidates for connectivity
 * 6. Establish peer-to-peer connection
 * 7. Receive remote streams via ontrack event
 * 
 * @example
 * ```typescript
 * // Initialize manager with client info and WebSocket
 * const manager = new WebRTCManager(clientInfo, wsClient);
 * 
 * // Get local media
 * const stream = await manager.initializeLocalMedia();
 * 
 * // Add peer connection
 * await manager.addPeer('remote-peer-id', true);
 * 
 * // Start screen sharing
 * const screenStream = await manager.startScreenShare();
 * 
 * // Listen for remote streams
 * manager.onStreamAdded((stream, peerId, type) => {
 *   if (type === 'camera') {
 *     videoElement.srcObject = stream;
 *   }
 * });
 * 
 * // Cleanup on disconnect
 * manager.cleanup();
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

/**
 * Configuration for WebRTC peer connections.
 * 
 * @property iceServers - STUN/TURN servers for NAT traversal
 * @property video - Video constraints or boolean to enable camera
 * @property audio - Audio constraints or boolean to enable microphone
 * @property screenshare - Whether screen sharing is enabled
 */
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

/**
 * Manages a single WebRTC peer-to-peer connection.
 * 
 * Responsibilities:
 * - Create and configure RTCPeerConnection instance
 * - Handle SDP offer/answer exchange
 * - Process ICE candidates for NAT traversal
 * - Manage local and remote media streams
 * - Provide RTCDataChannel for messaging
 * - Emit events for streams and connection state
 * 
 * Stream Management:
 * - Supports multiple stream types (camera, screen, audio-only)
 * - Tracks both local and remote streams separately
 * - Allows replacing streams (e.g., switch camera to screen)
 * 
 * Connection Lifecycle:
 * 1. new: RTCPeerConnection created
 * 2. connecting: ICE negotiation in progress
 * 3. connected: Peer-to-peer link established
 * 4. disconnected: Temporary connection loss
 * 5. failed: Connection cannot be established
 * 6. closed: Connection terminated
 * 
 * @see WebRTCManager For multi-peer coordination
 */
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
  private isNegotiating = false; // Prevent simultaneous offer creation
  private makingOffer = false; // Track if we're currently making an offer
  private polite: boolean; // Polite peer rolls back on glare, impolite peer ignores

  constructor(
    peerId: string,
    localClientInfo: ClientInfo,
    websocketClient: WebSocketClient,
    config: WebRTCConfig
  ) {
    this.peerId = peerId;
    this.localClientInfo = localClientInfo;
    this.websocketClient = websocketClient;
    // Determine politeness by comparing client IDs (lexicographic order)
    this.polite = localClientInfo.clientId < peerId;

    this.pc = new RTCPeerConnection({
      iceServers: config.iceServers || DEFAULT_ICE_SERVERS,
      iceCandidatePoolSize: 10,
    });

    this.setupPeerConnectionEvents();
    this.createDataChannel();
  }

  async addLocalStream(stream: MediaStream, streamType: StreamType = 'camera'): Promise<void> {
    try {
      logger.debug(`Adding ${streamType} stream to peer ${this.peerId}`);
      
      // Remove existing stream of same type to avoid duplicates
      if (this.localStreams.has(streamType)) {
        logger.debug(`Removing existing ${streamType} stream before adding new one`);
        await this.removeLocalStream(streamType);
      }

      // Get existing senders to avoid duplicates
      const existingSenders = this.pc.getSenders();
      const existingTrackIds = new Set(existingSenders.map(s => s.track?.id).filter(Boolean));

      stream.getTracks().forEach(track => {
        // Only add tracks that aren't already in the peer connection
        if (!existingTrackIds.has(track.id)) {
          this.pc.addTrack(track, stream);
          logger.debug(`Added ${track.kind} track (enabled: ${track.enabled}) to peer ${this.peerId}`);
        } else {
          logger.debug(`Skipped duplicate ${track.kind} track for peer ${this.peerId}`);
        }
      });

      this.localStreams.set(streamType, stream);
      logger.info(`Successfully added ${streamType} stream with ${stream.getTracks().length} tracks to peer ${this.peerId}`);
    } catch (error) {
      throw new Error(`Failed to add local ${streamType} stream: ${error instanceof Error ? error.message : String(error)}`);
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
      throw new Error(`Failed to remove local ${streamType} stream: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    try {
      this.makingOffer = true;
      this.isNegotiating = true;
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      
      await this.pc.setLocalDescription(offer);
      this.websocketClient.sendWebRTCOffer(offer, this.peerId, this.localClientInfo);      
      return offer;
    } catch (error) {
      this.isNegotiating = false;
      throw new Error(`Failed to create offer for peer ${this.peerId}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.makingOffer = false;
    }
  }

  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    try {
      logger.info(`Handling offer from ${this.peerId} - signalingState: ${this.pc.signalingState}, makingOffer: ${this.makingOffer}, polite: ${this.polite}`);
      
      // GLARE DETECTION: Both peers sent offers simultaneously
      const offerCollision = (offer.type === 'offer') && 
                             (this.makingOffer || this.pc.signalingState !== 'stable');

      // PERFECT NEGOTIATION PATTERN:
      // - Impolite peer: Ignore incoming offer during collision
      // - Polite peer: Rollback local offer and accept incoming offer
      const ignoreOffer = !this.polite && offerCollision;
      if (ignoreOffer) {
        logger.debug(`Impolite peer ${this.localClientInfo.clientId} ignoring offer from ${this.peerId} due to glare`);
        throw new Error('Ignoring offer due to glare (impolite peer)');
      }

      logger.info(`Setting remote description for offer from ${this.peerId}`);
      this.isNegotiating = false; // Clear flag when accepting offer
      await this.pc.setRemoteDescription(offer);
      logger.info(`Remote description set - new signalingState: ${this.pc.signalingState}`);
      
      logger.info(`Creating and sending answer to ${this.peerId}`);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      logger.info(`Answer created - final signalingState: ${this.pc.signalingState}`);
      
      this.websocketClient.sendWebRTCAnswer(answer, this.peerId, this.localClientInfo);
      logger.info(`Answer sent to ${this.peerId}`);
      return answer;
    } catch (error) {
      throw new Error(`Failed to handle offer from peer ${this.peerId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      // Only set remote description if we're in the correct state
      // 'have-local-offer' means we created an offer and are waiting for an answer
      if (this.pc.signalingState !== 'have-local-offer') {
        logger.warn(`Ignoring answer from ${this.peerId} - wrong signaling state: ${this.pc.signalingState}`);
        this.isNegotiating = false;
        return;
      }
      
      await this.pc.setRemoteDescription(answer);
      this.isNegotiating = false; // Negotiation complete
    } catch (error) {
      this.isNegotiating = false;
      throw new Error(`Failed to handle answer from peer ${this.peerId}: ${error instanceof Error ? error.message : String(error)}`);
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
      throw new Error(`Failed to add ICE candidate for peer ${this.peerId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async requestRenegotiation(reason: string): Promise<void> {
    try {
      this.websocketClient.requestRenegotiation(this.peerId, reason, this.localClientInfo);
    } catch (error) {
      throw new Error(`Failed to request renegotiation with peer ${this.peerId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  sendData(data: unknown): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error(`Data channel not available or not open for peer ${this.peerId}`);
    }
    
    try {
      this.dataChannel.send(JSON.stringify(data));
    } catch (error) {
      throw new Error(`Failed to send data to peer ${this.peerId}: ${error instanceof Error ? error.message : String(error)}`);
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

  getSignalingState(): RTCSignalingState {
    return this.pc.signalingState;
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
    } catch (error) {
      throw new Error(`Error closing peer connection with ${this.peerId}: ${error instanceof Error ? error.message : String(error)}`);
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
            logger.error(`Error in ICE candidate handler for peer ${this.peerId}`, error);
          }
        });
      }
    };

    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        const hasVideo = stream.getVideoTracks().length > 0;
        const hasAudio = stream.getAudioTracks().length > 0;
        logger.info(`Received track from ${this.peerId} - video: ${hasVideo}, audio: ${hasAudio}, streamId: ${stream.id}`);
        
        let streamType: StreamType = 'camera';
        if (hasVideo && !hasAudio) {
          streamType = 'screen';
          logger.info(`Identified as screen share stream from ${this.peerId}`);
        } else if (!hasVideo && hasAudio) {
          streamType = 'audio';
        }

        this.remoteStreams.set(streamType, stream);
        
        this.streamAddedHandlers.forEach(handler => {
          try {
            handler(stream, this.peerId, streamType);
          } catch (error) {
            logger.error(`Error in stream added handler for peer ${this.peerId}`, error);
          }
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState as PeerConnectionState;
      
      this.connectionStateHandlers.forEach(handler => {
        try {
          handler(state, this.peerId);
        } catch (error) {
          logger.error(`Error in connection state handler for peer ${this.peerId}`, error);
        }
      });
    };

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === 'failed') {
        logger.warn(`ICE connection failed for peer ${this.peerId} - connection may be unstable`);
      }
    };

    this.pc.onnegotiationneeded = () => {
      this.negotiationNeededHandlers.forEach(handler => {
        try {
          handler(this.peerId);
        } catch (error) {
          logger.error(`Error in negotiation needed handler for peer ${this.peerId}`, error);
        }
      });
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
      throw new Error(`Failed to create data channel for peer ${this.peerId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private setupDataChannelEvents(channel: RTCDataChannel): void {
    channel.onopen = () => {
      // Data channel ready for use
    };

    channel.onclose = () => {
      // Data channel closed
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.dataChannelMessageHandlers.forEach(handler => {
          try {
            handler(data, this.peerId);
          } catch (error) {
            logger.error(`Error in data channel message handler for peer ${this.peerId}`, error);
          }
        });
      } catch (error) {
        logger.error(`Failed to parse data channel message from peer ${this.peerId}`, error);
      }
    };

    channel.onerror = (error) => {
      // Data channel errors are common during disconnection and non-fatal
      logger.warn(`Data channel error with peer ${this.peerId}`, error);
    };
  }
}

/**
 * Manages multiple WebRTC peer connections in a mesh topology.
 * 
 * Coordinates:
 * - Local media stream initialization (getUserMedia)
 * - Screen sharing lifecycle (getDisplayMedia)
 * - Multiple peer connections (one per remote participant)
 * - WebSocket signaling event handling
 * - Stream distribution to all peers
 * 
 * Mesh Topology:
 * - Each participant connects directly to every other participant
 * - N participants = N*(N-1)/2 total connections
 * - Scales well for small rooms (< 6 participants)
 * - For larger rooms, consider SFU (Selective Forwarding Unit)
 * 
 * Media Management:
 * - Shares local stream with all peers automatically
 * - Handles screen sharing start/stop with renegotiation
 * - Supports dynamic peer addition/removal
 * - Audio/video mute/unmute affects all peer connections
 * 
 * Signaling:
 * - Listens for offer/answer/candidate events from WebSocket
 * - Routes events to appropriate PeerConnection instance
 * - Sends local SDP and ICE candidates via WebSocket
 * 
 * @see PeerConnection For individual peer management
 * @see WebSocketClient For signaling protocol
 */
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

    // Note: WebSocket handlers for offer/answer/candidate are managed by roomService
    // to avoid duplicate event processing
  }

  setLocalMediaStream(stream: MediaStream): void {
    this.localMediaStream = stream;
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

      return stream;
    } catch (error) {
      throw new Error(`Failed to initialize local media: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async startScreenShare(): Promise<MediaStream> {
    try {
      logger.info('Starting screen share');
      // Request screen capture from browser
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      this.localScreenStream = stream;
      logger.debug(`Screen share stream obtained with ${stream.getTracks().length} tracks`);
      
      // Add screen share to all existing peer connections
      // NOTE: Adding tracks automatically triggers negotiationneeded event - no manual renegotiation needed
      for (const [peerId, peer] of this.peers) {
        logger.debug(`Adding screen share to peer ${peerId}`);
        await peer.addLocalStream(stream, 'screen');
      }

      // Auto-stop screen share when user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        logger.info('Screen share ended by user');
        this.stopScreenShare();
      };

      logger.info('Screen share started successfully');
      return stream;
    } catch (error) {
      throw new Error(`Failed to start screen sharing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.localScreenStream) {
      logger.debug('No screen share to stop');
      return;
    }

    try {
      logger.info('Stopping screen share');
      // Remove screen share from all peer connections
      // NOTE: Removing tracks automatically triggers negotiationneeded event - no manual renegotiation needed
      for (const [peerId, peer] of this.peers) {
        logger.debug(`Removing screen share from peer ${peerId}`);
        await peer.removeLocalStream('screen');
      }

      // Stop all tracks to release screen capture
      this.localScreenStream.getTracks().forEach(track => track.stop());
      this.localScreenStream = null;
      logger.info('Screen share stopped successfully');
    } catch (error) {
      throw new Error(`Failed to stop screen sharing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async addPeer(peerId: string, initiateConnection = false): Promise<PeerConnection> {
    // Return existing peer if already connected
    if (this.peers.has(peerId)) {
      logger.debug(`Peer ${peerId} already exists, returning existing connection`);
      return this.peers.get(peerId)!;
    }

    logger.info(`Adding new peer ${peerId}, initiateConnection: ${initiateConnection}`);
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

    peer.onNegotiationNeeded(async (peerId) => {
      // Only auto-create offer if:
      // 1. We're in stable signaling state (not already negotiating)
      // 2. Connection is established (for renegotiation scenarios like adding screen share)
      // 3. Not currently in the middle of another negotiation
      // Don't auto-negotiate during initial setup - let manual createOffer handle it
      const signalingState = peer.getSignalingState();
      const connectionState = peer.getConnectionState();
      
      if (signalingState === 'stable' && connectionState === 'connected' && !peer['isNegotiating']) {
        try {
          logger.debug(`Auto-renegotiating with peer ${peerId} (connection: ${connectionState}, signaling: ${signalingState})`);
          await peer.createOffer();
        } catch (error) {
          logger.warn(`Auto-renegotiation failed for peer ${peerId}`, error);
        }
      } else {
        logger.debug(`Skipping auto-negotiation for peer ${peerId} (negotiating: ${peer['isNegotiating']}, connection: ${connectionState}, signaling: ${signalingState})`);
      }
    });

    this.peers.set(peerId, peer);

    // Add local media streams to new peer if they exist
    if (this.localMediaStream) {
      logger.debug(`Adding local media stream to peer ${peerId}`);
      await peer.addLocalStream(this.localMediaStream, 'camera');
    }
    if (this.localScreenStream) {
      logger.info(`Adding screen share stream to new peer ${peerId} - screen sharing active!`);
      await peer.addLocalStream(this.localScreenStream, 'screen');
    }

    // If we're the initiator, create and send offer AFTER streams are added
    if (initiateConnection) {
      logger.debug(`Initiating connection with peer ${peerId}`);
      await peer.createOffer();
    }

    logger.info(`Successfully added peer ${peerId} (camera: ${!!this.localMediaStream}, screen: ${!!this.localScreenStream})`);
    return peer;
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      logger.info(`Removing peer ${peerId}`);
      // Close peer connection and clean up resources
      peer.close();
      this.peers.delete(peerId);
      logger.debug(`Peer ${peerId} removed, ${this.peers.size} peers remaining`);
    } else {
      logger.warn(`Attempted to remove non-existent peer ${peerId}`);
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
      logger.info(`Toggling audio: ${enabled}`);
      // Enable/disable all audio tracks without removing them from peer connection
      this.localMediaStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
        logger.debug(`Audio track ${track.id} enabled: ${enabled}`);
      });
    } else {
      logger.warn('Cannot toggle audio - no local media stream');
    }
  }

  toggleVideo(enabled: boolean): void {
    if (this.localMediaStream) {
      logger.info(`Toggling video: ${enabled}`);
      // Enable/disable all video tracks without removing them from peer connection
      this.localMediaStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
        logger.debug(`Video track ${track.id} enabled: ${enabled}`);
      });
    } else {
      logger.warn('Cannot toggle video - no local media stream');
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
}

/**
 * Utility functions for media device enumeration and management.
 * 
 * Provides:
 * - Device enumeration (cameras, microphones, speakers)
 * - Permission request helpers
 * - Feature detection (screen sharing support)
 * 
 * Device Labels:
 * - Require getUserMedia permission before labels are populated
 * - Before permission: deviceId available, label empty
 * - After permission: both deviceId and label available
 * 
 * Browser Compatibility:
 * - enumerateDevices: All modern browsers
 * - getDisplayMedia: Chrome, Firefox, Edge (Safari 13+)
 * - audiooutput devices: Not available in Firefox
 * 
 * @example
 * ```typescript
 * // Request permissions first
 * await MediaDeviceUtils.requestPermissions();
 * 
 * // Get all cameras
 * const cameras = await MediaDeviceUtils.getVideoDevices();
 * cameras.forEach(cam => console.log(cam.label));
 * 
 * // Check screen share support
 * if (MediaDeviceUtils.isScreenShareSupported()) {
 *   await navigator.mediaDevices.getDisplayMedia({ video: true });
 * }
 * ```
 */
export const MediaDeviceUtils = {
  async getDevices(): Promise<MediaDeviceInfo[]> {
    try {
      return await navigator.mediaDevices.enumerateDevices();
    } catch (error) {
      throw new Error(`Failed to enumerate devices: ${error instanceof Error ? error.message : String(error)}`);
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
      throw new Error(`Failed to request media permissions: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  isScreenShareSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  },
};

export default WebRTCManager;
