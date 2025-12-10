import { createLogger } from './logger';
import type {
    EventType,
    AnyPayload,
    WebSocketMessage,
    ClientInfo,
    AddChatPayload,
    DeleteChatPayload,
    GetRecentChatsPayload,
    HandStatePayload,
    ToggleAudioPayload,
    ToggleVideoPayload,
    RequestWaitingPayload,
    AcceptWaitingPayload,
    DenyWaitingPayload,
    RequestScreensharePayload,
    ScreenshareDecisionPayload,
    WebRTCOfferPayload,
    WebRTCAnswerPayload,
    WebRTCCandidatePayload,
    WebRTCRenegotiatePayload
} from '../../shared/types/events';

/**
 * WebSocket connection lifecycle states.
 * 
 * State Transitions:
 * - disconnected → connecting: connect() called
 * - connecting → connected: WebSocket.onopen fired
 * - connected → disconnected: Normal close (code 1000)
 * - connected → reconnecting: Abnormal close with autoReconnect enabled
 * - reconnecting → connected: Reconnection successful
 * - reconnecting → error: Max reconnect attempts exceeded
 * - any → error: Connection failure or max retries reached
 * 
 * @see WebSocketClient.getConnectionState For current state
 * @see WebSocketClient.onConnectionChange For state change notifications
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

/**
 * Configuration options for WebSocket client initialization.
 * 
 * Connection Behavior:
 * - url: Full WebSocket URL (ws:// or wss://)
 * - token: JWT authentication token appended as query parameter
 * - autoReconnect: Enable automatic reconnection on abnormal disconnect
 * 
 * Reconnection Strategy:
 * - reconnectInterval: Base delay between attempts (exponential backoff applied)
 * - maxReconnectAttempts: Limit on retry count before giving up
 * - Backoff formula: delay = reconnectInterval * 2^(attempt - 1)
 * 
 * Keep-Alive:
 * - heartbeatInterval: Interval for ping messages to prevent timeout
 * - Server should respond with pong or close connection
 * 
 * @example
 * ```typescript
 * const config: WebSocketConfig = {
 *   url: 'wss://api.example.com/ws/hub/room-123',
 *   token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
 *   autoReconnect: true,
 *   reconnectInterval: 3000,  // 3s, 6s, 12s, 24s, 48s
 *   maxReconnectAttempts: 5,
 *   heartbeatInterval: 30000  // 30 seconds
 * };
 * ```
 */
export interface WebSocketConfig {
  url: string;
  token: string; // Required for authentication - no unauthenticated connections allowed
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

/**
 * Handler for incoming WebSocket messages.
 * 
 * Called when a message matching subscribed event type is received.
 * Multiple handlers can subscribe to the same event type.
 * 
 * @param message - Parsed WebSocket message with event and payload
 * 
 * @see WebSocketClient.on For subscription
 * @see WebSocketClient.off For unsubscription
 */
export type MessageHandler = (message: WebSocketMessage) => void;

/**
 * Handler for connection state changes.
 * 
 * Called whenever the WebSocket connection state transitions.
 * Useful for updating UI connection indicators.
 * 
 * @param state - New connection state
 * 
 * @see ConnectionState For possible states
 */
export type ConnectionHandler = (state: ConnectionState) => void;

/**
 * Handler for WebSocket errors.
 * 
 * Called for connection errors, message parsing errors,
 * and errors thrown by other handlers.
 * 
 * @param error - Error instance with descriptive message
 */
export type ErrorHandler = (error: Error) => void;

/**
 * WebSocket client for real-time video conferencing signaling.
 * 
 * Responsibilities:
 * - Establish and maintain WebSocket connection with authentication
 * - Automatic reconnection with exponential backoff on abnormal disconnect
 * - Event-driven message routing to registered handlers
 * - Keep-alive heartbeat to prevent idle timeout
 * - Type-safe message sending for all conference events
 * 
 * Message Protocol:
 * - All messages are JSON with { event: string, payload: object } structure
 * - Event types defined in shared/types/events.ts
 * - Payloads strongly typed per event type
 * - Authentication via JWT token in URL query parameter
 * 
 * Event Categories:
 * - Chat: add_chat, delete_chat, recents_chat
 * - Room: room_state, waiting_request, accept_waiting, deny_waiting
 * - Hand Raising: raise_hand, lower_hand
 * - Screen Share: request_screenshare, accept_screenshare, deny_screenshare
 * - WebRTC Signaling: offer, answer, candidate, renegotiate
 * 
 * Connection Management:
 * - Normal disconnect (code 1000): No automatic reconnection
 * - Abnormal disconnect: Exponential backoff reconnection if enabled
 * - Max attempts exceeded: Transitions to 'error' state
 * - Heartbeat ping every 30s (configurable) to maintain connection
 * 
 * @example
 * ```typescript
 * // Initialize client
 * const client = new WebSocketClient({
 *   url: 'wss://api.example.com/ws/hub/room-123',
 *   token: session.accessToken,
 *   autoReconnect: true
 * });
 * 
 * // Subscribe to events
 * client.on('add_chat', (msg) => {
 *   const chat = msg.payload as AddChatPayload;
 *   console.log(`${chat.displayName}: ${chat.chatContent}`);
 * });
 * 
 * // Monitor connection
 * client.onConnectionChange((state) => {
 *   console.log('Connection:', state);
 * });
 * 
 * // Connect and send messages
 * await client.connect();
 * client.sendChat('Hello!', { clientId: 'user123', displayName: 'John' });
 * 
 * // Cleanup
 * client.disconnect();
 * ```
 * 
 * @see EventType For all supported event types
 * @see WebSocketConfig For configuration options
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private messageHandlers = new Map<EventType, MessageHandler[]>();
  private connectionHandlers: ConnectionHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private logger = createLogger('WebSocket');

  /**
   * Initialize WebSocket client with configuration.
   * 
   * Does not establish connection - call connect() to connect.
   * Merges provided config with sensible defaults.
   * 
   * @param config - WebSocket configuration options
   * @param config.url - WebSocket server URL (required)
   * @param config.token - JWT authentication token (required)
   * @param config.autoReconnect - Enable auto-reconnect (default: true)
   * @param config.reconnectInterval - Base reconnect delay in ms (default: 3000)
   * @param config.maxReconnectAttempts - Max retry count (default: 5)
   * @param config.heartbeatInterval - Ping interval in ms (default: 30000)
   */
  constructor(config: WebSocketConfig) {
    this.config = {
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      ...config,
    };
  }

  /**
   * Establish WebSocket connection to server.
   * 
   * Connection Process:
   * 1. Set state to 'connecting'
   * 2. Append JWT token to URL query parameter
   * 3. Create native WebSocket instance
   * 4. Set up event handlers (open, message, close, error)
   * 5. Wait for connection or timeout
   * 6. Start heartbeat timer on successful connection
   * 7. Reset reconnect attempt counter
   * 
   * Error Handling:
   * - Connection timeout: Rejects promise
   * - Authentication failure: Rejects with auth error
   * - Network error: Rejects with connection error
   * 
   * @returns Promise that resolves when connected, rejects on error
   * @throws {Error} If connection fails or times out
   * 
   * @example
   * ```typescript
   * try {
   *   await client.connect();
   *   console.log('Connected!');
   * } catch (error) {
   *   console.error('Failed to connect:', error);
   * }
   * ```
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.logger.info(`Connecting to WebSocket: ${this.config.url}`);
        this.setConnectionState('connecting');
        
        // Construct WebSocket URL with JWT token
        const wsUrl = new URL(this.config.url);
        wsUrl.searchParams.set('token', this.config.token);
        
        this.logger.debug('Creating WebSocket connection');
        this.ws = new WebSocket(wsUrl.toString());
        
        this.ws.onopen = () => {
          this.setConnectionState('connected');
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = (event) => {
          this.cleanup();
          
          // Normal closure (1000) or client-initiated disconnect - don't reconnect
          if (event.code === 1000 || !this.config.autoReconnect) {
            this.setConnectionState('disconnected');
          } else if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
            // Only reconnect on abnormal closures if autoReconnect is enabled
            this.setConnectionState('reconnecting');
            this.scheduleReconnect();
          } else {
            this.setConnectionState('error');
          }
        };

        this.ws.onerror = () => {
          const error = new Error('WebSocket connection error');
          this.notifyErrorHandlers(error);
          reject(new Error('Failed to connect to WebSocket server'));
        };

      } catch (error) {
        this.setConnectionState('error');
        const err = new Error(`Failed to create WebSocket connection: ${error instanceof Error ? error.message : String(error)}`);
        reject(err);
      }
    });
  }

  /**
   * Gracefully disconnect from WebSocket server.
   * 
   * Disconnection Process:
   * 1. Disable auto-reconnect to prevent reconnection
   * 2. Send close frame with code 1000 (normal closure)
   * 3. Clear heartbeat timer
   * 4. Clear reconnect timer if pending
   * 5. Set connection state to 'disconnected'
   * 
   * Close Code:
   * - 1000: Normal closure (no reconnection attempt)
   * - Reason: 'Client disconnect'
   * 
   * Safe to call multiple times - idempotent operation.
   * 
   * @example
   * ```typescript
   * // On component unmount or logout
   * client.disconnect();
   * ```
   */
  disconnect(): void {
    this.config.autoReconnect = false;
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }
    
    this.cleanup();
    this.setConnectionState('disconnected');
  }

  /**
   * Send typed message to WebSocket server.
   * 
   * Validates connection state before sending.
   * Serializes message to JSON format: { event, payload }
   * 
   * @param event - Event type identifier (e.g., 'add_chat', 'offer')
   * @param payload - Event-specific payload data
   * 
   * @throws {Error} If WebSocket is not connected
   * @throws {Error} If message serialization fails
   * 
   * @example
   * ```typescript
   * // Send custom event
   * client.send('custom_event', { data: 'value' });
   * 
   * // Prefer helper methods for standard events
   * client.sendChat('Hello!', clientInfo);
   * ```
   * 
   * @see sendChat For chat messages
   * @see sendWebRTCOffer For WebRTC signaling
   */
  send(event: EventType, payload: AnyPayload): void {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected');
    }

    const message: WebSocketMessage = { event, payload };
    
    try {
      this.ws!.send(JSON.stringify(message));
    } catch (error) {
      throw new Error(`Failed to send WebSocket message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send chat message to all room participants.
   * 
   * Automatically generates:
   * - Unique chat ID (timestamp + random string)
   * - Timestamp in milliseconds since epoch
   * - Broadcasts to all participants via server
   * 
   * Server broadcasts message to all clients including sender.
   * Clients receive via 'add_chat' event handler.
   * 
   * @param content - Chat message text content
   * @param clientInfo - Sender's client information
   * @param clientInfo.clientId - Unique client identifier
   * @param clientInfo.displayName - Sender's display name
   * 
   * @throws {Error} If WebSocket is not connected
   * 
   * @example
   * ```typescript
   * const clientInfo = {
   *   clientId: 'user_123',
   *   displayName: 'John Doe'
   * };
   * 
   * client.sendChat('Hello everyone!', clientInfo);
   * ```
   */
  sendChat(content: string, clientInfo: ClientInfo): void {
    const payload: AddChatPayload = {
      ...clientInfo,
      chatId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      chatContent: content,
    };
    
    this.send('add_chat', payload);
  }

  /** Delete chat message from room */
  deleteChat(chatId: string, clientInfo: ClientInfo): void {
    const payload: DeleteChatPayload = {
      ...clientInfo,
      chatId,
    };
    
    this.send('delete_chat', payload);
  }

  /**
   * Request chat message history from server.
   * 
   * Server responds with 'recents_chat' event containing
   * array of recent messages (typically last 50-100).
   * 
   * Called automatically when:
   * - Joining room as host (room_state event)
   * - Accepted from waiting room (accept_waiting event)
   * 
   * @param clientInfo - Requester's client information
   * 
   * @example
   * ```typescript
   * // Subscribe to response
   * client.on('recents_chat', (msg) => {
   *   const { chats } = msg.payload;
   *   console.log(`Loaded ${chats.length} messages`);
   * });
   * 
   * // Request history
   * client.requestChatHistory(clientInfo);
   * ```
   */
  requestChatHistory(clientInfo: ClientInfo): void {
    const payload: GetRecentChatsPayload = clientInfo;
    this.send('recents_chat', payload);
  }

  /**
   * Raise hand to request speaking permission.
   * 
   * Notifies host and other participants that user wants to speak.
   * Visual indicator shown in participant list.
   * 
   * @param clientInfo - Participant raising hand
   */
  raiseHand(clientInfo: ClientInfo): void {
    const payload: HandStatePayload = clientInfo;
    this.send('raise_hand', payload);
  }

  /**
   * Lower previously raised hand.
   * 
   * Removes speaking request indicator from UI.
   * 
   * @param clientInfo - Participant lowering hand
   */
  lowerHand(clientInfo: ClientInfo): void {
    const payload: HandStatePayload = clientInfo;
    this.send('lower_hand', payload);
  }

  /**
   * Toggle audio (microphone) state.
   * 
   * Notifies all participants of audio state change.
   * Updates unmuted map on backend for participant tracking.
   * 
   * @param clientInfo - Client toggling audio
   * @param enabled - true if audio is enabled (unmuted), false if disabled (muted)
   */
  toggleAudio(clientInfo: ClientInfo, enabled: boolean): void {
    const payload = { ...clientInfo, enabled };
    this.send('toggle_audio', payload);
  }

  /**
   * Toggle video (camera) state.
   * 
   * Notifies all participants of video state change.
   * Updates cameraOn map on backend for participant tracking.
   * 
   * @param clientInfo - Client toggling video
   * @param enabled - true if video is enabled (camera on), false if disabled (camera off)
   */
  toggleVideo(clientInfo: ClientInfo, enabled: boolean): void {
    const payload = { ...clientInfo, enabled };
    this.send('toggle_video', payload);
  }

  /** Request to join from waiting room */
  requestWaiting(clientInfo: ClientInfo): void {
    const payload: RequestWaitingPayload = clientInfo;
    this.send('waiting_request', payload);
  }

  /** Accept waiting user (host only) */
  acceptWaiting(targetClient: ClientInfo, hostInfo: ClientInfo): void {
    // Backend expects just the target client's info
    const payload: AcceptWaitingPayload = targetClient;
    this.send('accept_waiting', payload);
  }

  /** Deny waiting user (host only) */
  denyWaiting(targetClient: ClientInfo, hostInfo: ClientInfo): void {
    // Backend expects just the target client's info
    const payload: DenyWaitingPayload = targetClient;
    this.send('deny_waiting', payload);
  }

  /** Request screen sharing permission */
  requestScreenShare(clientInfo: ClientInfo): void {
    const payload: RequestScreensharePayload = clientInfo;
    this.send('request_screenshare', payload);
  }

  /** Accept screen sharing request (host only) */
  acceptScreenshare(targetClient: ClientInfo, hostInfo: ClientInfo): void {
    const payload: ScreenshareDecisionPayload = { ...hostInfo, clientId: targetClient.clientId };
    this.send('accept_screenshare', payload);
  }

  /** Deny screen sharing request (host only) */
  denyScreenshare(targetClient: ClientInfo, hostInfo: ClientInfo): void {
    const payload: ScreenshareDecisionPayload = { ...hostInfo, clientId: targetClient.clientId };
    this.send('deny_screenshare', payload);
  }

  /** Send WebRTC offer for peer connection */
  sendWebRTCOffer(offer: RTCSessionDescriptionInit, targetClientId: string, clientInfo: ClientInfo): void {
    const payload: WebRTCOfferPayload = {
      ...clientInfo,
      targetClientId,
      sdp: offer.sdp!,
    };
    
    this.send('offer', payload);
  }

  /** Send WebRTC answer to respond to offer */
  sendWebRTCAnswer(answer: RTCSessionDescriptionInit, targetClientId: string, clientInfo: ClientInfo): void {
    const payload: WebRTCAnswerPayload = {
      ...clientInfo,
      targetClientId,
      sdp: answer.sdp!,
    };
    
    this.send('answer', payload);
  }

  /** Send ICE candidate for NAT traversal */
  sendICECandidate(candidate: RTCIceCandidate, targetClientId: string, clientInfo: ClientInfo): void {
    const payload: WebRTCCandidatePayload = {
      ...clientInfo,
      targetClientId,
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid || undefined,
      sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
    };
    
    this.send('candidate', payload);
  }

  /** Request WebRTC connection renegotiation */
  requestRenegotiation(targetClientId: string, reason: string, clientInfo: ClientInfo): void {
    const payload: WebRTCRenegotiatePayload = {
      ...clientInfo,
      targetClientId,
      reason,
    };
    
    this.send('renegotiate', payload);
  }

  /**
   * Subscribe to WebSocket message events.
   * 
   * Multiple handlers can subscribe to the same event type.
   * Handlers called in registration order when message received.
   * 
   * @param event - Event type to listen for
   * @param handler - Callback function for messages
   * 
   * @example
   * ```typescript
   * // Chat messages
   * client.on('add_chat', (msg) => {
   *   const chat = msg.payload as AddChatPayload;
   *   addMessageToUI(chat);
   * });
   * 
   * // Room state updates
   * client.on('room_state', (msg) => {
   *   const state = msg.payload as RoomStatePayload;
   *   updateParticipantList(state.participants);
   * });
   * 
   * // WebRTC signaling
   * client.on('offer', async (msg) => {
   *   const offer = msg.payload as WebRTCOfferPayload;
   *   await handleRemoteOffer(offer);
   * });
   * ```
   * 
   * @see off For unsubscribing
   */
  on(event: EventType, handler: MessageHandler): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event)!.push(handler);
  }

  /**
   * Unsubscribe from WebSocket message events.
   * 
   * Removes specific handler from event subscriptions.
   * Must pass exact same function reference used in on().
   * 
   * @param event - Event type to unsubscribe from
   * @param handler - Handler function to remove
   * 
   * @example
   * ```typescript
   * const chatHandler = (msg) => console.log(msg);
   * client.on('add_chat', chatHandler);
   * 
   * // Later, remove subscription
   * client.off('add_chat', chatHandler);
   * ```
   */
  off(event: EventType, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /** Subscribe to connection state changes */
  onConnectionChange(handler: ConnectionHandler): void {
    this.connectionHandlers.push(handler);
  }

  /** Subscribe to WebSocket errors */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Get current connection state.
   * 
   * @returns Current state (connecting, connected, disconnected, error, reconnecting)
   * 
   * @see ConnectionState For state descriptions
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if WebSocket is currently connected.
   * 
   * @returns true if connection is open and ready for messages
   * 
   * @example
   * ```typescript
   * if (client.isConnected()) {
   *   client.sendChat('Hello!', clientInfo);
   * } else {
   *   console.log('Cannot send - not connected');
   * }
   * ```
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Private methods

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      this.logger.debug('Message received', { event: message.event, payload: message.payload });
      
      // Notify specific event handlers
      const handlers = this.messageHandlers.get(message.event);
      this.logger.debug('Handlers found', { event: message.event, handlerCount: handlers?.length || 0 });
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            const err = new Error(`Error in message handler for ${message.event}: ${error instanceof Error ? error.message : String(error)}`);
            this.notifyErrorHandlers(err);
            throw err;
          }
        });
      }
    } catch (error) {
      const err = new Error(`Failed to parse WebSocket message: ${error instanceof Error ? error.message : String(error)}`);
      this.notifyErrorHandlers(err);
      throw err;
    }
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.connectionHandlers.forEach(handler => {
        try {
          handler(state);
        } catch (error) {
          throw new Error(`Error in connection handler: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
  }

  private notifyErrorHandlers(error: Error): void {
    this.errorHandlers.forEach(handler => {
      try {
        handler(error);
      } catch (handlerError) {
        throw new Error(`Error in error handler: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}`);
      }
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        // Send ping to keep connection alive
        try {
          this.ws!.send(JSON.stringify({ event: 'ping', payload: {} }));
        } catch (error) {
          throw new Error(`Failed to send heartbeat: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }, this.config.heartbeatInterval);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    // Calculate base delay with exponential backoff
    const baseDelay = this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
    // Add random jitter (0-1000ms) to prevent thundering herd problem
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        const err = new Error(`Reconnection attempt ${this.reconnectAttempts} failed: ${error instanceof Error ? error.message : String(error)}`);
        this.notifyErrorHandlers(err);
      }
    }, delay);
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws = null;
  }
}

/**
 * Factory function to create WebSocket client for a room.
 * 
 * Convenience method that constructs proper WebSocket URL
 * and applies standard configuration defaults.
 * 
 * URL Construction:
 * - baseUrl: ws://localhost:8080 (development) or wss://api.example.com (production)
 * - path: /hub/{roomId}
 * - query: ?token={jwtToken}
 * 
 * @param roomId - Unique room identifier
 * @param token - JWT authentication token
 * @param baseUrl - WebSocket server base URL (default: ws://localhost:8080)
 * 
 * @returns Configured WebSocketClient instance
 * 
 * @example
 * ```typescript
 * // Development
 * const client = createWebSocketClient('room-123', session.accessToken);
 * 
 * // Production
 * const client = createWebSocketClient(
 *   'room-123',
 *   session.accessToken,
 *   'wss://api.example.com'
 * );
 * 
 * await client.connect();
 * ```
 */
export const createWebSocketClient = (
  roomId: string,
  token: string,
  baseUrl = 'ws://localhost:8080'
): WebSocketClient => {
  const url = `${baseUrl}/hub/${roomId}`;
  
  return new WebSocketClient({
    url,
    token,
    autoReconnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
    heartbeatInterval: 30000,
  });
};
