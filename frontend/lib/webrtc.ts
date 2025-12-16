import { createLogger } from './logger';
import { WebSocketClient } from './websockets';
import { WebSocketMessage, SignalEvent } from '@/types/proto/signaling';

const logger = createLogger('SFUClient');

export class SFUClient {
  private pc: RTCPeerConnection;

  constructor(
    private ws: WebSocketClient,
    private onTrack: (stream: MediaStream, track: MediaStreamTrack) => void
  ) {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // 1. Handle Incoming Media (From Rust)
    this.pc.ontrack = (event) => {
      logger.info('Received Remote Track', { kind: event.track.kind });
      // The SFU sends one stream per user usually, or mixes them.
      // For now, pass it up to the UI.
      this.onTrack(event.streams[0], event.track);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Send Candidate to Rust
        this.sendSignal({
          iceCandidate: JSON.stringify(event.candidate)
        });
      }
    };

    // 2. Listen to Signaling (From Go -> Rust -> Go -> Here)
    this.ws.onMessage((msg) => {
      // Check the 'oneof' field. Depending on ts-proto options, it might be nested.
      // We look for 'signalEvent' because that is field #16 in your proto.
      if (msg.signalEvent) {
        this.handleSignal(msg.signalEvent);
      }
    });
  }

  private async handleSignal(event: SignalEvent) {
    try {
      if (event.sdpOffer) {
        logger.info('Received SFU Offer');
        // A. Set Remote Description (Offer)
        await this.pc.setRemoteDescription({
          type: 'offer',
          sdp: event.sdpOffer
        });

        // B. Create Answer
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        // C. Send Answer back
        this.sendSignal({ sdpAnswer: answer.sdp });

      } else if (event.iceCandidate) {
        // D. Add ICE Candidate
        const candidate = JSON.parse(event.iceCandidate);
        await this.pc.addIceCandidate(candidate);
      }
    } catch (e) {
      logger.error('Signaling Error', e);
    }
  }

  private sendSignal(payload: { sdpAnswer?: string, iceCandidate?: string }) {
    // Construct the nested Protobuf message
    const msg: WebSocketMessage = {
      signal: {
        ...payload
      }
    };
    this.ws.send(msg);
  }

  // --- API for UI ---

  addTrack(track: MediaStreamTrack, stream: MediaStream) {
    logger.info('Adding Local Track', { kind: track.kind });
    this.pc.addTrack(track, stream);
  }

  replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack) {
    const sender = this.pc.getSenders().find(s => s.track?.id === oldTrack.id);
    if (sender) {
      sender.replaceTrack(newTrack);
    }
  }

  close() {
    // Stop all transceivers/senders
    this.pc.getSenders().forEach(sender => {
      try { sender.track?.stop(); } catch (e) { }
    });
    this.pc.close();
  }
}