import { WebSocketClient } from './websockets';
import { SFUClient } from './webrtc';
import { createLogger } from './logger';
import { WebSocketMessage, RoomStateEvent, ParticipantInfo } from '@/types/proto/signaling';
import { Participant, ChatMessage } from '@/store/types';

const logger = createLogger('RoomClient');

export interface RoomClientState {
    participants: Map<string, Participant>;
    waitingParticipants: Map<string, Participant>;
    messages: ChatMessage[];
    isJoined: boolean;
    isWaitingRoom: boolean;
    isHost: boolean;
    currentUserId: string | null;
    error: string | null;
}

export class RoomClient {
    public ws: WebSocketClient | null = null;
    public sfu: SFUClient | null = null;

    // Authoritative State
    private participants: Map<string, Participant> = new Map();
    private waitingParticipants: Map<string, Participant> = new Map();
    private streamToUserMap: Map<string, string> = new Map();
    private userToStreamMap: Map<string, MediaStream> = new Map();
    private pendingStreams: Map<string, MediaStream> = new Map();
    private messages: ChatMessage[] = [];
    private currentUserId: string | null = null; // Stored locally for logic checks

    private onStateChange: (state: Partial<RoomClientState>) => void;
    private onMediaTrackAdded: (userId: string, stream: MediaStream) => void;

    constructor(
        onStateChange: (state: Partial<RoomClientState>) => void,
        onMediaTrackAdded: (userId: string, stream: MediaStream) => void
    ) {
        this.onStateChange = onStateChange;
        this.onMediaTrackAdded = onMediaTrackAdded;
    }

    public async connect(roomId: string, username: string, token: string) {
        logger.info('Connecting to Room', { roomId, username });

        const wsUrl = `ws://localhost:8080/ws/hub/${roomId}?username=${encodeURIComponent(username)}`;
        const ws = new WebSocketClient(wsUrl, token);
        this.ws = ws;

        // Setup SFU Client
        this.sfu = new SFUClient(ws, (stream, track) => {
            this.handleRemoteTrack(stream, track);
        });

        // Setup WebSocket Handlers
        ws.onMessage((msg) => this.handleMessage(msg, roomId, username, token));

        try {
            await ws.connect();

            // Race Condition Check: If this.ws has changed (new connect call), abort
            if (this.ws !== ws) {
                logger.warn('Connection replaced by newer attempt, aborting join');
                ws.disconnect();
                return;
            }

            logger.info('WebSocket Connected');

            // Send Join Request
            ws.send({
                join: {
                    token,
                    roomId,
                    displayName: username
                }
            });
        } catch (e) {
            logger.error('Failed to connect', e);
            this.onStateChange({ error: `Connection failed: ${e}` });
        }
    }

    public disconnect() {
        this.sfu?.close();
        this.sfu = null;
        this.ws?.disconnect();
        this.ws = null;
        this.participants.clear();
        this.waitingParticipants.clear();
        this.streamToUserMap.clear();
        this.userToStreamMap.clear();
        this.pendingStreams.clear();
    }

    public setLocalStream(userId: string, stream: MediaStream | null) {
        if (stream) {
            this.userToStreamMap.set(userId, stream);
        } else {
            this.userToStreamMap.delete(userId);
        }

        const p = this.participants.get(userId);
        if (p) {
            p.stream = stream || undefined;
            this.participants.set(userId, p);
            // Updating internal map ensures next state emission includes stream (or lack thereof)
            const newParticipants = new Map(this.participants);
            this.onStateChange({ participants: newParticipants });
        }
    }

    // --- Event Handlers ---

    private handleMessage(msg: WebSocketMessage, roomId: string, username: string, token: string) {
        const messageType = Object.keys(msg).find(key => (msg as any)[key] !== undefined) as keyof WebSocketMessage;

        switch (messageType) {
            case 'joinResponse':
                if (msg.joinResponse) this.handleJoinResponse(msg.joinResponse);
                break;
            case 'roomState':
                if (msg.roomState) this.handleRoomState(msg.roomState);
                break;
            case 'trackAdded':
                if (msg.trackAdded) this.handleTrackAdded(msg.trackAdded);
                break;
            case 'chatEvent':
                if (msg.chatEvent) {
                    const chat = msg.chatEvent;
                    const newMsg: ChatMessage = {
                        id: chat.id,
                        participantId: chat.senderId,
                        username: chat.senderName,
                        content: chat.content,
                        timestamp: new Date(Number(chat.timestamp)),
                        type: chat.isPrivate ? 'private' : 'text',
                    };
                    this.handleChatEvent(newMsg);
                }
                break;
            case 'recentChats':
                if (msg.recentChats) {
                    msg.recentChats.chats.forEach(chat => {
                        const newMsg: ChatMessage = {
                            id: chat.id,
                            participantId: chat.senderId,
                            username: chat.senderName,
                            content: chat.content,
                            timestamp: new Date(Number(chat.timestamp)),
                            type: chat.isPrivate ? 'private' : 'text',
                        };
                        this.handleChatEvent(newMsg);
                    });
                }
                break;
            case 'mediaStateChanged':
                if (msg.mediaStateChanged) {
                    this.updateParticipantState(msg.mediaStateChanged.userId, {
                        isAudioEnabled: msg.mediaStateChanged.isAudioEnabled,
                        isVideoEnabled: msg.mediaStateChanged.isVideoEnabled
                    });
                }
                break;
            case 'screenShareChanged':
                if (msg.screenShareChanged) {
                    this.updateParticipantState(msg.screenShareChanged.userId, {
                        isScreenSharing: msg.screenShareChanged.isSharing
                    });
                }
                break;
            case 'handUpdate':
                if (msg.handUpdate) {
                    this.updateParticipantState(msg.handUpdate.userId, {
                        isHandRaised: msg.handUpdate.isRaised
                    });
                }
                break;
            case 'waitingRoomNotification':
                break;
            case 'adminEvent':
                if (msg.adminEvent) {
                    if (msg.adminEvent.action === 'kicked') {
                        this.onStateChange({ error: `You were kicked: ${msg.adminEvent.reason}` });
                        this.disconnect();
                    }
                }
                break;
            case 'error':
                if (msg.error) {
                    this.onStateChange({ error: msg.error.message });
                }
                break;
            default:
                if (msg.signalEvent) {
                    // Ignored here, handled by SFUClient listener
                }
                break;
        }
    }

    private handleChatEvent(message: ChatMessage) {
        if (!this.messages) this.messages = [];
        this.messages.push(message);
        this.onStateChange({ messages: [...this.messages] });
    }

    private updateParticipantState(userId: string, updates: Partial<Participant>) {
        const p = this.participants.get(userId);
        if (p) {
            const updated = { ...p, ...updates };
            this.participants.set(userId, updated);

            // Need to update the Map in the state
            const newParticipants = new Map(this.participants);
            this.onStateChange({ participants: newParticipants });
        }
    }

    private handleJoinResponse(response: any) {
        if (response.success) {
            this.currentUserId = response.userId;
            this.onStateChange({
                isJoined: true,
                currentUserId: response.userId,
                isHost: response.isHost
            });
            // Initial State
            if (response.initialState) {
                this.handleRoomState(response.initialState);
            }
        } else {
            this.onStateChange({ error: 'Failed to join room' });
        }
    }

    private handleRoomState(state: RoomStateEvent) {
        const newParticipants = new Map<string, Participant>();
        let amInWaitingRoom = false;

        // Process Participants
        state.participants.forEach((p: ParticipantInfo) => {
            // Check if we already have a stream for this user (from previous state or early track event)
            const existingStream = this.userToStreamMap.get(p.id);

            newParticipants.set(p.id, {
                id: p.id,
                username: p.displayName,
                role: p.isHost ? 'host' : 'participant',
                stream: existingStream
            });

            // Sync state flags
            const part = newParticipants.get(p.id)!;
            part.isAudioEnabled = p.isAudioEnabled;
            part.isVideoEnabled = p.isVideoEnabled;
            part.isScreenSharing = p.isScreenSharing;
            part.isHandRaised = p.isHandRaised;

            // Update internal map
            this.participants.set(p.id, part);
        });

        // Process Waiting
        const newWaiting = new Map<string, Participant>();
        state.waitingUsers?.forEach((w: ParticipantInfo) => {
            if (!newParticipants.has(w.id)) {
                newWaiting.set(w.id, {
                    id: w.id,
                    username: w.displayName,
                    role: 'waiting'
                });

                if (this.currentUserId && w.id === this.currentUserId) {
                    amInWaitingRoom = true;
                }
            }
        });

        this.waitingParticipants = newWaiting;

        // Dispatch Update
        this.onStateChange({
            participants: newParticipants,
            waitingParticipants: newWaiting,
            isWaitingRoom: amInWaitingRoom
        });
    }

    private handleTrackAdded(event: { userId: string, streamId: string }) {
        logger.info('Track Added Event', event);
        this.streamToUserMap.set(event.streamId, event.userId);

        // Check if we have the stream pending
        if (this.pendingStreams.has(event.streamId)) {
            const stream = this.pendingStreams.get(event.streamId)!;
            this.assignStreamToUser(event.userId, stream);
            this.pendingStreams.delete(event.streamId);
        }
    }

    private handleRemoteTrack(stream: MediaStream, track: MediaStreamTrack) {
        const userId = this.streamToUserMap.get(stream.id);
        if (userId) {
            this.assignStreamToUser(userId, stream);
        } else {
            logger.warn('Received track for unknown user', { streamId: stream.id });
            this.pendingStreams.set(stream.id, stream);
        }
    }

    private assignStreamToUser(userId: string, stream: MediaStream) {
        let targetStream = this.userToStreamMap.get(userId);
        if (!targetStream) {
            targetStream = new MediaStream();
            this.userToStreamMap.set(userId, targetStream);
        }

        stream.getTracks().forEach(t => {
            if (!targetStream!.getTracks().some(existing => existing.id === t.id)) {
                targetStream!.addTrack(t);
            }
        });

        // Notify Slice
        this.onMediaTrackAdded(userId, targetStream);

        // Update internal participants map to keep it in sync (optional but good for consistency)
        const p = this.participants.get(userId);
        if (p) {
            p.stream = targetStream;
            this.participants.set(userId, p);
        }
    }

    // --- Actions ---
    public toggleAudio(enabled: boolean) {
        this.ws?.send({ toggleMedia: { kind: 'audio', isEnabled: enabled } });
    }

    public toggleVideo(enabled: boolean) {
        this.ws?.send({ toggleMedia: { kind: 'video', isEnabled: enabled } });
    }

    public sendChatMessage(content: string, type: 'text' | 'private' = 'text', targetId?: string) {
        this.ws?.send({
            chat: {
                content,
                targetId: targetId || ''
            }
        });
    }

    public approveParticipant(userId: string) {
        this.ws?.send({
            adminAction: {
                action: 'approve',
                targetUserId: userId
            }
        });
    }

    public kickParticipant(userId: string) {
        this.ws?.send({
            adminAction: {
                action: 'kick',
                targetUserId: userId
            }
        });
    }

    public toggleHand(raised: boolean) {
        this.ws?.send({
            toggleHand: {
                isRaised: raised
            }
        });
    }
}
