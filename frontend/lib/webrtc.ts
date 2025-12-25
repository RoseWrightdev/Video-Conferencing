import { createLogger } from './logger';
import { WebSocketClient } from './websockets';
import { WebSocketMessage, SignalEvent } from '@/types/proto/signaling';

const logger = createLogger('SFUClient');

export class SFUClient {
  public pc: RTCPeerConnection;
  private ws: WebSocketClient;
  private onTrack: (stream: MediaStream, track: MediaStreamTrack) => void;
  private isJoining: boolean = false;
  public isConnected: boolean = false;

  constructor(
    ws: WebSocketClient,
    onTrack: (stream: MediaStream, track: MediaStreamTrack) => void
  ) {
    this.ws = ws;
    this.onTrack = onTrack;
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // 1. Handle Incoming Media (From Rust)
    this.pc.ontrack = (event) => {
      logger.info('Received Remote Track from SFU', {
        kind: event.track.kind,
        streamId: event.streams[0]?.id,
        trackId: event.track.id
      });
      this.onTrack(event.streams[0], event.track);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          iceCandidate: JSON.stringify(event.candidate)
        });
      }
    };

    // 2. Listen to Signaling
    this.ws.onMessage((msg) => {
      if (msg.signalEvent) {
        this.handleSignal(msg.signalEvent);
      }
    });

    // 3. Negotiation Needed
    this.pc.onnegotiationneeded = async () => {
      logger.info('Negotiation Needed - Creating Offer', { state: this.pc.signalingState });
      try {
        if (this.pc.signalingState !== 'stable') {
          logger.warn('Negotiation needed but state is not stable, skipping for now');
          return;
        }

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        // Wait for ICE gathering to complete if it's the first time or we have time
        // This ensures the Offer has candidates for faster connection
        if (this.pc.iceGatheringState !== 'complete') {
          logger.debug('Waiting for ICE gathering to complete...');
          await new Promise<void>((resolve) => {
            const check = () => {
              if (this.pc.iceGatheringState === 'complete') {
                this.pc.removeEventListener('icegatheringstatechange', check);
                resolve();
              }
            };
            this.pc.addEventListener('icegatheringstatechange', check);
            // Fallback timeout
            setTimeout(() => {
              this.pc.removeEventListener('icegatheringstatechange', check);
              resolve();
            }, 2000);
          });
        }

        const finalOffer = this.pc.localDescription;
        if (finalOffer) {
          logger.info('Sending Offer to SFU', { sdpLength: finalOffer.sdp.length });
          this.sendSignal({ sdpOffer: finalOffer.sdp });
        }
      } catch (e) {
        logger.error('Failed to create/send offer', e);
      }
    };

    this.pc.onconnectionstatechange = () => {
      logger.info('PeerConnection State Change', { state: this.pc.connectionState });
      this.isConnected = this.pc.connectionState === 'connected';
    };

    this.pc.oniceconnectionstatechange = () => {
      logger.info('ICE Connection State Change', { state: this.pc.iceConnectionState });
    };
  }

  private async handleSignal(event: SignalEvent) {
    if (this.pc.signalingState === 'closed') {
      logger.warn('Received signal for closed PC, ignoring');
      return;
    }

    try {
      if (event.sdpOffer) {
        logger.info('Received SFU Offer', { state: this.pc.signalingState });

        // Check for glare or instability
        if (this.pc.signalingState !== 'stable') {
          logger.warn('Received Offer but SignalingState is not stable', { state: this.pc.signalingState });
          // In a proper implementation, we might rollback or wait. 
          // For SFU, usually we are the answerer, so this shouldn't happen much unless we initiated renegotiation simultaneously.
          await Promise.all([
            this.pc.setLocalDescription({ type: 'rollback' }),
            this.pc.setRemoteDescription({ type: 'offer', sdp: event.sdpOffer })
          ]);
        } else {
          await this.pc.setRemoteDescription({ type: 'offer', sdp: event.sdpOffer });
        }

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        if (answer.sdp) {
          logger.info('Sending Answer to SFU', { sdpLength: answer.sdp.length });
          this.sendSignal({ sdpAnswer: answer.sdp });
        }

      } else if (event.iceCandidate) {
        logger.debug('Received SFU ICE Candidate');
        const candidate = JSON.parse(event.iceCandidate);
        await this.pc.addIceCandidate(candidate);
      } else if (event.sdpAnswer) {
        logger.info('Received SFU Answer');
        await this.pc.setRemoteDescription({
          type: 'answer',
          sdp: event.sdpAnswer
        });
      }
    } catch (e) {
      logger.error('Signaling Error', e);
    }
  }

  private sendSignal(payload: { sdpAnswer?: string, iceCandidate?: string, sdpOffer?: string }) {
    const msg: WebSocketMessage = {
      signal: {
        ...payload
      }
    };
    this.ws.send(msg);
  }

  async addTrack(track: MediaStreamTrack, stream: MediaStream) {
    logger.info('Adding Local Track', { kind: track.kind });
    // This will trigger onnegotiationneeded
    this.pc.addTrack(track, stream);
  }

  replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack) {
    const sender = this.pc.getSenders().find(s => s.track?.id === oldTrack.id);
    if (sender) {
      sender.replaceTrack(newTrack);
    }
  }

  close() {
    this.pc.getSenders().forEach(sender => {
      try { sender.track?.stop(); } catch (e) { }
    });
    this.pc.close();
  }
}