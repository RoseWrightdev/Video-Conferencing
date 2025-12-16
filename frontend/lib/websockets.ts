import { createLogger } from './logger';
import { WebSocketMessage } from '@/types/proto/signaling'; // Adjust path if needed

export type MessageHandler = (message: WebSocketMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private logger = createLogger('WebSocket');
  private handlers: MessageHandler[] = [];

  constructor(
    private url: string,
    private token: string
  ) { }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 1. Append Token to URL
      const wsUrl = new URL(this.url);
      wsUrl.searchParams.set('token', this.token);

      this.ws = new WebSocket(wsUrl.toString());
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
          this.handlers.forEach(h => h(message));
        } catch (e) {
          this.logger.error('Failed to decode message', e);
        }
      };

      this.ws.onerror = (e) => {
        this.logger.error('WebSocket Error', e);
        reject(e);
      };

      this.ws.onclose = () => {
        this.logger.warn('Disconnected');
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

  // Allow multiple listeners (Store for Chat, SFU for Video)
  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  disconnect() {
    this.ws?.close();
  }
}