import { WebSocketClient } from '@/lib/websockets';
import { WebRTCManager } from '@/lib/webrtc';
import { useRoomStore } from '@/store/useRoomStore';
import {
  type ChatMessage,
  type Participant,
} from '../store/types';
import type {
  AddChatPayload,
  RoomStatePayload,
  HandStatePayload,
  ClientInfo,
  WebRTCOfferPayload,
  WebRTCAnswerPayload,
  WebRTCCandidatePayload,
  WebRTCRenegotiatePayload,
} from '../../shared/types/events';

/**
 * RoomService manages the lifecycle of a video conferencing room.
 * 
 * Responsibilities:
 * - Initializes and maintains WebSocket connections to the signaling server
 * - Manages WebRTC peer connections for audio/video streaming
 * - Handles room state synchronization and event routing
 * - Coordinates chat messages and participant actions
 * 
 * Architecture:
 * - Singleton pattern via exported instance
 * - Event-driven communication through WebSocket message handlers
 * - State management delegated to Zustand store
 * - Separation of concerns: WebSocket for signaling, WebRTC for media
 * 
 * @example
 * ```typescript
 * // Initialize room connection
 * await roomService.initializeRoom('room-123', 'John Doe', 'jwt-token');
 * 
 * // Join as participant
 * await roomService.joinRoom();
 * 
 * // Clean up on exit
 * roomService.leaveRoom();
 * ```
 */
export class RoomService {
  private wsClient: WebSocketClient | null = null;
  private webrtcManager: WebRTCManager | null = null;
  private clientInfo: ClientInfo | null = null;

  /**
   * Initializes the room connection and establishes WebSocket/WebRTC infrastructure.
   * 
   * This method:
   * 1. Disconnects any existing WebSocket connection
   * 2. Generates a unique client ID for this session
   * 3. Creates WebSocket client with auto-reconnect
   * 4. Establishes connection to signaling server
   * 5. Initializes WebRTC manager for peer connections
   * 6. Updates global store with connection state
   * 7. Refreshes available media devices
   * 
   * @param roomId - Unique identifier for the room to join
   * @param username - Display name for this participant
   * @param token - JWT authentication token for authorization
   * 
   * @throws {Error} If WebSocket connection fails
   * @throws {Error} If device enumeration fails
   * 
   * @example
   * ```typescript
   * try {
   *   await roomService.initializeRoom(
   *     'room-abc123',
   *     'Alice',
   *     session.accessToken
   *   );
   * } catch (error) {
   *   console.error('Failed to initialize room:', error);
   * }
   * ```
   */
  public async initializeRoom(roomId: string, username: string, token: string) {
    if (this.wsClient) {
      this.wsClient.disconnect();
    }

    // Validate token is provided
    if (!token || token.trim() === '') {
      throw new Error('Authentication token is required. Please sign in to continue.');
    }

    // Extract client ID from JWT token's 'sub' claim
    // Backend expects clientId to match the token's subject
    let clientId: string;
    try {
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        throw new Error('Invalid JWT token format');
      }
      const payload = JSON.parse(atob(tokenParts[1]));
      clientId = payload.sub || payload.subject;
      if (!clientId) {
        throw new Error('JWT token missing sub/subject claim');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse JWT token';
      throw new Error(`Authentication failed: ${message}`);
    }

    this.clientInfo = {
      clientId,
      displayName: username,
    };

    this.wsClient = new WebSocketClient({
      url: `ws://localhost:8080/ws/hub/${roomId}?username=${encodeURIComponent(username)}`,
      token,
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
    });

    this.setupEventHandlers();

    try {
      await this.wsClient.connect();
      this.webrtcManager = new WebRTCManager(this.clientInfo, this.wsClient);

      // Setup WebRTC stream handlers to update participant streams
      this.webrtcManager.onStreamAdded((stream, peerId, streamType) => {
        const store = useRoomStore.getState();
        const participant = store.participants.get(peerId);
        if (participant) {
          store.updateParticipant(peerId, { stream });
        }
      });

      this.webrtcManager.onStreamRemoved((stream, peerId, streamType) => {
        const store = useRoomStore.getState();
        const participant = store.participants.get(peerId);
        if (participant) {
          store.updateParticipant(peerId, { stream: undefined });
        }
      });

      useRoomStore.setState({
        roomId,
        currentUserId: this.clientInfo.clientId,
        currentUsername: username,
        clientInfo: this.clientInfo,
        wsClient: this.wsClient,
        webrtcManager: this.webrtcManager,
      });

      // Initialize local media stream (will be added to peer connections when they're created)
      try {
        const localStream = await this.webrtcManager.initializeLocalMedia();
        useRoomStore.getState().setLocalStream(localStream);
      } catch (error) {
        // Continue without local media - user can enable it later
      }

      // Refresh available devices
      await useRoomStore.getState().refreshDevices();
    } catch (error) {
      useRoomStore.getState().handleError(
        `Failed to initialize room: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }
  }

  /**
   * Requests to join the room as a participant.
   * 
   * For rooms with waiting room enabled, this sends a request to the host
   * for approval. The host will receive a waiting room event and can
   * accept or deny the request.
   * 
   * @throws {Error} If connection is not initialized
   * @throws {Error} If WebSocket send fails
   * 
   * @see setupEventHandlers For accept_waiting and deny_waiting event handling
   * 
   * @example
   * ```typescript
   * await roomService.joinRoom();
   * // Wait for 'accept_waiting' or 'deny_waiting' event
   * ```
   */
  public async joinRoom() {
    if (!this.wsClient || !this.clientInfo) {
      useRoomStore.getState().handleError('Connection not ready. Please try again.');
      return;
    }
    try {
      this.wsClient.requestWaiting(this.clientInfo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useRoomStore.getState().handleError(`Failed to join room: ${message}`);
      throw error;
    }
  }

  /**
   * Gracefully disconnects from the room and cleans up all resources.
   * 
   * Cleanup process:
   * 1. Stops all local media tracks (camera, microphone)
   * 2. Stops screen sharing if active
   * 3. Closes all WebRTC peer connections
   * 4. Disconnects WebSocket connection
   * 5. Resets store to initial state
   * 
   * Safe to call multiple times - will not throw if already disconnected.
   * 
   * @example
   * ```typescript
   * // On component unmount or user logout
   * roomService.leaveRoom();
   * ```
   */
  public leaveRoom() {
    const { localStream, screenShareStream } = useRoomStore.getState();

    localStream?.getTracks().forEach((track) => track.stop());
    screenShareStream?.getTracks().forEach((track) => track.stop());
    this.webrtcManager?.cleanup();
    this.wsClient?.disconnect();

    useRoomStore.setState({
      roomId: null,
      roomName: null,
      roomSettings: null,
      isJoined: false,
      isHost: false,
      currentUserId: null,
      currentUsername: null,
      clientInfo: null,
      wsClient: null,
      webrtcManager: null,
      participants: new Map(),
      hosts: new Map(),
      waitingParticipants: new Map(),
      localParticipant: null,
      unmutedParticipants: new Set(),
      cameraOnParticipants: new Set(),
      sharingScreenParticipants: new Set(),
      raisingHandParticipants: new Set(),
      localStream: null,
      screenShareStream: null,
      messages: [],
      unreadCount: 0,
      isChatPanelOpen: false,
      isParticipantsPanelOpen: false,
      isWaitingRoom: false,
      selectedParticipantId: null,
      gridLayout: 'gallery',
      isPinned: false,
      pinnedParticipantId: null,
      connectionState: {
        wsConnected: false,
        wsReconnecting: false,
        webrtcConnected: false,
      },
    });
  }

  /**
   * Establishes WebRTC peer connections with all participants in the room.
   * Creates peer connections for participants we don't already have connections with.
   * The first participant (alphabetically by clientId) initiates the connection.
   * 
   * @private
   */
  private async setupPeerConnections(participants: Map<string, Participant>, hosts: Map<string, Participant>) {
    if (!this.webrtcManager || !this.clientInfo) return;

    // Combine all participants (hosts and regular participants)
    const allParticipants = new Map([...hosts, ...participants]);
    
    // Remove self from the list
    allParticipants.delete(this.clientInfo.clientId);

    // Establish peer connections with each participant
    for (const [peerId, participant] of allParticipants) {
      try {
        // Check if we already have a peer connection
        const existingPeer = this.webrtcManager.getPeer(peerId);
        if (existingPeer) {
          continue;
        }

        // Determine who initiates the connection (to avoid both sides creating offers)
        // The participant with the lexicographically smaller clientId initiates
        const shouldInitiate = this.clientInfo!.clientId < peerId;
        
        await this.webrtcManager.addPeer(peerId, shouldInitiate);
      } catch (error) {
        // Peer connection failed, will retry on next room_state update
      }
    }
  }

  /**
   * Registers WebSocket event handlers for room-level events.
   * 
   * Event handlers:
   * - add_chat: Receives new chat messages from other participants
   * - recents_chat: Loads chat history when joining room
   * - room_state: Synchronizes participant list and room metadata
   * - accept_waiting: Notification of approval to join room
   * - deny_waiting: Notification of denied room access
   * - raise_hand: Participant requests to speak
   * - lower_hand: Participant cancels speak request
   * 
   * All handlers update the Zustand store to trigger React re-renders.
   * Error handling delegates to store's handleError method.
   * 
   * @private
   * @see WebSocketClient.on For event subscription API
   */
  private setupEventHandlers() {
    if (!this.wsClient) return;

    this.wsClient.on('add_chat', (message) => {
      const chatPayload = message.payload as AddChatPayload;
      const chatMessage: ChatMessage = {
        id: chatPayload.chatId,
        participantId: chatPayload.clientId,
        username: chatPayload.displayName,
        content: chatPayload.chatContent,
        timestamp: new Date(chatPayload.timestamp),
        type: 'text',
      };
      useRoomStore.getState().addMessage(chatMessage);
    });

    this.wsClient.on('recents_chat', (message) => {
      const payload = message.payload as unknown as { chats: AddChatPayload[] };
      const chatMessages: ChatMessage[] = (payload.chats || []).map((chat) => ({
        id: chat.chatId,
        participantId: chat.clientId,
        username: chat.displayName,
        content: chat.chatContent,
        timestamp: new Date(chat.timestamp),
        type: 'text' as const,
      }));
      useRoomStore.setState({ messages: chatMessages });
    });

    this.wsClient.on('delete_chat', (message) => {
      const payload = message.payload as { chatId: string; clientId: string; displayName: string };
      useRoomStore.setState((state) => ({
        messages: state.messages.filter(msg => msg.id !== payload.chatId)
      }));
    });

    this.wsClient.on('room_state', async (message) => {
      const payload = message.payload as RoomStatePayload;
      const newParticipants = new Map<string, Participant>();
      const newHosts = new Map<string, Participant>();
      const newWaiting = new Map<string, Participant>();

      payload.hosts?.forEach((host) => {
        const participant: Participant = {
          id: host.clientId,
          username: host.displayName,
          role: 'host',
        };
        newParticipants.set(host.clientId, participant);
        newHosts.set(host.clientId, participant);
      });

      payload.participants?.forEach((participant) => {
        const p: Participant = {
          id: participant.clientId,
          username: participant.displayName,
          role: 'participant',
        };
        newParticipants.set(participant.clientId, p);
      });

      payload.waitingUsers?.forEach((user) => {
        const participant: Participant = {
          id: user.clientId,
          username: user.displayName,
          role: 'waiting',
        };
        newWaiting.set(user.clientId, participant);
      });

      // Initialize audio/video state from payload
      const unmuted = new Set<string>();
      payload.unmuted?.forEach((client) => {
        unmuted.add(client.clientId);
      });

      const cameraOn = new Set<string>();
      payload.cameraOn?.forEach((client) => {
        cameraOn.add(client.clientId);
      });

      const isHost = payload.hosts?.some((h) => h.clientId === this.clientInfo?.clientId) || false;
      const isWaiting = payload.waitingUsers?.some((w) => w.clientId === this.clientInfo?.clientId) || false;
      const isParticipant = payload.participants?.some((p) => p.clientId === this.clientInfo?.clientId) || false;

      useRoomStore.setState({
        participants: newParticipants,
        hosts: newHosts,
        waitingParticipants: newWaiting,
        unmutedParticipants: unmuted,
        cameraOnParticipants: cameraOn,
        isHost,
        isJoined: isHost || isParticipant, // Only truly joined if host or participant
        isWaitingRoom: isWaiting, // Show waiting screen if in waiting list
      });

      // Attach local stream to local participant for local video display
      const { localStream, updateParticipant } = useRoomStore.getState();
      if (localStream && this.clientInfo && newParticipants.has(this.clientInfo.clientId)) {
        updateParticipant(this.clientInfo.clientId, { stream: localStream });
      }

      // Establish peer connections with all other participants
      this.setupPeerConnections(newParticipants, newHosts);

      // Ensure local stream is added to all peers (handles race condition where peers created before media ready)
      if (this.webrtcManager && localStream) {
        const allPeers = this.webrtcManager.getAllPeers();
        for (const [peerId, peer] of allPeers) {
          const localStreams = peer.getLocalStreams();
          // Only add if peer doesn't have our camera stream yet
          if (!localStreams.has('camera')) {
            try {
              await peer.addLocalStream(localStream, 'camera');
            } catch (error) {
              // Stream add failed, will retry on next room_state or renegotiation
            }
          }
        }
      }

      // Request chat history when room state is received (for hosts or approved participants)
      if (this.wsClient && this.clientInfo) {
        this.wsClient.requestChatHistory(this.clientInfo);
      }
    });

    this.wsClient.on('accept_waiting', () => {
      useRoomStore.setState({ isWaitingRoom: false, isJoined: true });
      
      // Request chat history when accepted into room
      if (this.wsClient && this.clientInfo) {
        this.wsClient.requestChatHistory(this.clientInfo);
      }
    });

    this.wsClient.on('deny_waiting', () => {
      useRoomStore.getState().handleError('Access to room denied by host');
    });

    this.wsClient.on('raise_hand', (message) => {
      const payload = message.payload as HandStatePayload;
      useRoomStore.getState().setHandRaised(payload.clientId, true);
    });

    this.wsClient.on('lower_hand', (message) => {
      const payload = message.payload as HandStatePayload;
      useRoomStore.getState().setHandRaised(payload.clientId, false);
    });

    this.wsClient.on('toggle_audio', (message) => {
      const payload = message.payload as { clientId: string; displayName: string; enabled: boolean };
      useRoomStore.getState().setAudioEnabled(payload.clientId, payload.enabled);
    });

    this.wsClient.on('toggle_video', (message) => {
      const payload = message.payload as { clientId: string; displayName: string; enabled: boolean };
      useRoomStore.getState().setVideoEnabled(payload.clientId, payload.enabled);
    });

    // WebRTC Signaling Handlers
    this.wsClient.on('offer', async (message) => {
      const payload = message.payload as WebRTCOfferPayload;
      
      if (!this.webrtcManager) {
        useRoomStore.getState().handleError('WebRTC not initialized for incoming call');
        return;
      }

      try {
        // Get or create peer connection
        let peer = this.webrtcManager.getPeer(payload.clientId);
        if (!peer) {
          peer = await this.webrtcManager.addPeer(payload.clientId, false);
        }

        // Handle the offer and send answer
        const answer = await peer.handleOffer({ type: 'offer', sdp: payload.sdp });
        if (this.clientInfo) {
          this.wsClient!.sendWebRTCAnswer(answer, payload.clientId, this.clientInfo);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        useRoomStore.getState().handleError(`Failed to establish video connection: ${message}`);
      }
    });

    this.wsClient.on('answer', async (message) => {
      const payload = message.payload as WebRTCAnswerPayload;
      
      if (!this.webrtcManager) {
        useRoomStore.getState().handleError('WebRTC not initialized for call response');
        return;
      }

      try {
        const peer = this.webrtcManager.getPeer(payload.clientId);
        if (peer) {
          await peer.handleAnswer({ type: 'answer', sdp: payload.sdp });
        } else {
          throw new Error(`Peer connection not found for ${payload.clientId}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        useRoomStore.getState().handleError(`Failed to complete video connection: ${message}`);
      }
    });

    this.wsClient.on('candidate', async (message) => {
      const payload = message.payload as WebRTCCandidatePayload;
      
      if (!this.webrtcManager) {
        useRoomStore.getState().handleError('WebRTC not initialized for network negotiation');
        return;
      }

      try {
        const peer = this.webrtcManager.getPeer(payload.clientId);
        if (peer) {
          await peer.handleICECandidate({
            candidate: payload.candidate,
            sdpMid: payload.sdpMid,
            sdpMLineIndex: payload.sdpMLineIndex
          });
        } else {
          throw new Error(`Peer connection not found for ${payload.clientId}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        useRoomStore.getState().handleError(`Failed to negotiate network connection: ${message}`);
      }
    });

    this.wsClient.on('renegotiate', async (message) => {
      const payload = message.payload as WebRTCRenegotiatePayload;
      
      if (!this.webrtcManager) {
        useRoomStore.getState().handleError('WebRTC not initialized for connection update');
        return;
      }

      try {
        const peer = this.webrtcManager.getPeer(payload.clientId);
        if (peer) {
          await peer.requestRenegotiation(payload.reason || 'Connection update required');
        } else {
          throw new Error(`Peer connection not found for ${payload.clientId}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        useRoomStore.getState().handleError(`Failed to update connection: ${message}`);
      }
    });

    // Handle waiting room requests (host only receives these)
    this.wsClient.on('waiting_request', (message) => {
      const payload = message.payload as ClientInfo;
      const waitingParticipant: Participant = {
        id: payload.clientId,
        username: payload.displayName,
        role: 'waiting',
      };
      
      useRoomStore.setState((state) => {
        const newWaiting = new Map(state.waitingParticipants);
        newWaiting.set(payload.clientId, waitingParticipant);
        return { waitingParticipants: newWaiting };
      });
    });

    // Handle screen share requests (host only receives these)
    this.wsClient.on('request_screenshare', (message) => {
      const payload = message.payload as ClientInfo;
      // Store screen share request for host to approve/deny
      // TODO: Add UI notification for hosts about pending screen share request
    });

    // Handle screen share approval (participant receives this)
    this.wsClient.on('accept_screenshare', () => {
      // Participant was approved to share screen
      // This signals the participant can now start screen sharing
      // TODO: Automatically trigger screen share or show success notification
    });

    // Handle screen share denial (participant receives this)
    this.wsClient.on('deny_screenshare', () => {
      // Participant's screen share request was denied
      useRoomStore.getState().handleError('Screen share request denied by host');
    });

    this.wsClient.onConnectionChange?.((connectionState) => {
      useRoomStore.getState().updateConnectionState({
        wsConnected: connectionState === 'connected',
        wsReconnecting: connectionState === 'reconnecting',
      });
    });

    this.wsClient.onError((error) => {
      useRoomStore.getState().handleError(`Connection error: ${error.message}`);
    });
  }
}
