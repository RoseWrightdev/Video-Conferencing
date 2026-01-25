import { createLogger } from './logger';
import { WebSocketMessage } from '@/types/proto/signaling'; // Adjust path if needed

export type MessageHandler = (message: WebSocketMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private logger = createLogger('WebSocket');
  private handlers: MessageHandler[] = [];
  private isExplicitDisconnect = false;

  constructor(
    private url: string,
    private token: string
  ) { }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Reset explicit disconnect flag on new connection
      this.isExplicitDisconnect = false;

      // 1. Pass Token via Sec-WebSocket-Protocol header to avoid URL logging
      // Note: We use 'access_token' as the primary protocol to avoid issues with long JWTs
      // being returned as the selected protocol by the server.
      const wsUrl = new URL(this.url);

      // The server will verify the token (2nd item) but select 'access_token' (1st item)
      // as the negotiated protocol.
      this.ws = new WebSocket(wsUrl.toString(), ['access_token', this.token]);
      this.ws.binaryType = 'arraybuffer'; // CRITICAL: Receive bytes, not strings

      this.ws.onopen = () => {
        this.logger.info('Connected');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          // 2. Decode Binary Protobuf
          const data = new Uint8Array(event.data);
          const message = WebSocketMessage.decode(data);

          // 3. Broadcast to all listeners (Store, SFUClient)
          this.logMessageSummary(message);
          this.handlers.forEach(h => h(message));
        } catch (e) {
          this.logger.error('Failed to decode message', e);
        }
      };

      this.ws.onerror = (e) => {
        // If we intentionally disconnected (e.g. React Strict Mode cleanup), suppress the error
        if (this.isExplicitDisconnect) return;

        this.logger.error('WebSocket Error', e);
        reject(e);
      };

      this.ws.onclose = () => {
        if (!this.isExplicitDisconnect) {
          this.logger.warn('Disconnected');
        } else {
          this.logger.info('Disconnected (Explicit)');
        }
        // Add your reconnection logic here (removed for brevity)
      };
    });
  }

  send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      // 4. Encode to Binary
      const bytes = WebSocketMessage.encode(message).finish();
      this.ws.send(bytes);
    } else {
      this.logger.warn('Socket not open, dropping message');
    }
  }

  private logMessageSummary(msg: WebSocketMessage) {
    if (msg.signalEvent) {
      const s = msg.signalEvent;
      if (s.sdpOffer) {
        this.logger.info(`Signal: SDP Offer (len=${s.sdpOffer.length})`);
      } else if (s.sdpAnswer) {
        this.logger.info(`Signal: SDP Answer (len=${s.sdpAnswer.length})`);
      } else if (s.iceCandidate) {
        this.logger.debug('Signal: ICE Candidate');
      } else {
        this.logger.info('Signal: Unknown, details hidden');
      }
    } else {
      // Find the key that is set to identify the message type
      const type = Object.keys(msg).find(key =>
        msg[key as keyof WebSocketMessage] !== undefined &&
        key !== 'toJSON' &&
        key !== 'constructor'
      );
      this.logger.debug(`Received: ${type || 'Unknown Message'}`);
    }
  }

  // Allow multiple listeners (Store for Chat, SFU for Video)
  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  disconnect() {
    this.isExplicitDisconnect = true;
    this.ws?.close();
  }
}