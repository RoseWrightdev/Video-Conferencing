import type {
    EventType,
    AnyPayload,
    WebSocketMessage,
    ClientInfo,
    AddChatPayload,
    DeleteChatPayload,
    GetRecentChatsPayload,
    HandStatePayload,
    RequestWaitingPayload,
    WaitingRoomDecisionPayload,
    RequestScreensharePayload,
    ScreenshareDecisionPayload,
    WebRTCOfferPayload,
    WebRTCAnswerPayload,
    WebRTCCandidatePayload,
    WebRTCRenegotiatePayload
} from '../../shared/types/events';

/** WebSocket connection states */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

/** WebSocket client configuration */
export interface WebSocketConfig {
  url: string;
  token?: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

/** Event handler function types */
export type MessageHandler = (message: WebSocketMessage) => void;
export type ConnectionHandler = (state: ConnectionState) => void;
export type ErrorHandler = (error: Error) => void;

/**
 * WebSocket client for real-time video conferencing
 * 
 * @example
 * ```typescript
 * const client = new WebSocketClient({ url: 'wss://api.example.com/ws', token: 'jwt' });
 * await client.connect();
 * client.sendChat('Hello!', { clientId: 'user123', displayName: 'John' });
 * ```
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

  /** Initialize WebSocket client */
  constructor(config: WebSocketConfig) {
    this.config = {
      token: '',
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      ...config,
    };
  }

  /** Establish WebSocket connection */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.setConnectionState('connecting');
        
        // Construct WebSocket URL with JWT token
        const wsUrl = new URL(this.config.url);
        if (this.config.token) {
          wsUrl.searchParams.set('token', this.config.token);
        }
        
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

  /** Gracefully disconnect from WebSocket server */
  disconnect(): void {
    this.config.autoReconnect = false;
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }
    
    this.cleanup();
    this.setConnectionState('disconnected');
  }

  /** Send message to WebSocket server */
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

  /** Send chat message to room */
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

  /** Request recent chat history */
  requestChatHistory(clientInfo: ClientInfo): void {
    const payload: GetRecentChatsPayload = clientInfo;
    this.send('recents_chat', payload);
  }

  /** Raise hand to request speaking */
  raiseHand(clientInfo: ClientInfo): void {
    const payload: HandStatePayload = clientInfo;
    this.send('raise_hand', payload);
  }

  /** Lower raised hand */
  lowerHand(clientInfo: ClientInfo): void {
    const payload: HandStatePayload = clientInfo;
    this.send('lower_hand', payload);
  }

  /** Request to join from waiting room */
  requestWaiting(clientInfo: ClientInfo): void {
    const payload: RequestWaitingPayload = clientInfo;
    this.send('waiting_request', payload);
  }

  /** Accept waiting user (host only) */
  acceptWaiting(targetClient: ClientInfo, hostInfo: ClientInfo): void {
    const payload: WaitingRoomDecisionPayload = { ...hostInfo, clientId: targetClient.clientId };
    this.send('accept_waiting', payload);
  }

  /** Deny waiting user (host only) */
  denyWaiting(targetClient: ClientInfo, hostInfo: ClientInfo): void {
    const payload: WaitingRoomDecisionPayload = { ...hostInfo, clientId: targetClient.clientId };
    this.send('deny_waiting', payload);
  }

  /** Request screen sharing permission */
  requestScreenShare(clientInfo: ClientInfo): void {
    const payload: RequestScreensharePayload = clientInfo;
    this.send('request_screenshare', payload);
  }

  /** Accept screen sharing request (host only) */
  acceptScreenShare(targetClient: ClientInfo, hostInfo: ClientInfo): void {
    const payload: ScreenshareDecisionPayload = { ...hostInfo, clientId: targetClient.clientId };
    this.send('accept_screenshare', payload);
  }

  /** Deny screen sharing request (host only) */
  denyScreenShare(targetClient: ClientInfo, hostInfo: ClientInfo): void {
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

  /** Subscribe to WebSocket message events */
  on(event: EventType, handler: MessageHandler): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event)!.push(handler);
  }

  /** Unsubscribe from WebSocket message events */
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

  /** Get current connection state */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /** Check if WebSocket is connected */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Private methods

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      // Notify specific event handlers
      const handlers = this.messageHandlers.get(message.event);
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
    const delay = this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);    
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

/** Factory function to create WebSocket clients */
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
