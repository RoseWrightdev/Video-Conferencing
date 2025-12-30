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
    isKicked?: boolean;
    currentUserId: string | null;
    error: string | null;
    isInitialState?: boolean;
    // Derived state sets for UI efficiency
    raisingHandParticipants?: Set<string>;
    unmutedParticipants?: Set<string>;
    cameraOnParticipants?: Set<string>;
    sharingScreenParticipants?: Set<string>;
}

export class RoomClient {
    public ws: WebSocketClient | null = null;
    public sfu: SFUClient | null = null;

    // Authoritative State
    private participants: Map<string, Participant> = new Map();
    private waitingParticipants: Map<string, Participant> = new Map();

    // streamToUserMap maps Stream ID -> User ID. This differs from participants map (User ID -> Stream).
    // It is primarily used to lookup user when a track/stream event arrives with only StreamID.
    private streamToUserMap: Map<string, string> = new Map();

    // We keep a reference to the streams to ensure they aren't garbage collected if that were an issue,
    // but primarily the participants map is now the source of truth for "User has this stream".
    // We can remove userToStreamMap if we just check participants, but keeping it for quick lookup is fine
    // as long as we keep it in sync. Let's simplifiy: Source of truth = participants.
    // However, handleRoomState wipes participants map. We need to remember streams.
    // So we need a persistent map of streams that survives handleRoomState updates.
    private activeStreams: Map<string, MediaStream> = new Map(); // UserId -> Stream

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
        // Enforce cleanup of any existing connection before starting a new one
        if (this.ws || this.sfu) {
            logger.warn('Cleaning up existing connection before new connect', { roomId, username });
            this.disconnect();
        }

        logger.info('Connecting to Room', { roomId, username });

        const baseUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';
        const wsUrl = `${baseUrl}/ws/hub/${roomId}?username=${encodeURIComponent(username)}`;
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
            // If connection was replaced or explicitly disconnected, ignore the error
            if (this.ws !== ws) {
                logger.warn('Ignoring connection error from superseded/disconnected client', e);
                return;
            }

            logger.error('Failed to connect', e);
            this.onStateChange({ error: `Connection failed: ${e}` });
            // Clean up if connection failed
            this.disconnect();
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
        this.activeStreams.clear();
    }

    /**
     * Helper to broadcast participant state updates with all derived sets.
     * This ensures the UI sets (raisingHand, unmuted, etc.) are always in sync with the Map.
     */
    private emitParticipantState() {
        const newParticipants = new Map(this.participants);

        const raisingHandParticipants = new Set<string>();
        const unmutedParticipants = new Set<string>();
        const cameraOnParticipants = new Set<string>();
        const sharingScreenParticipants = new Set<string>();

        newParticipants.forEach(p => {
            if (p.isHandRaised) raisingHandParticipants.add(p.id);
            if (p.isAudioEnabled) unmutedParticipants.add(p.id);
            if (p.isVideoEnabled) cameraOnParticipants.add(p.id);
            if (p.isScreenSharing) sharingScreenParticipants.add(p.id);
        });

        this.onStateChange({
            participants: newParticipants,
            raisingHandParticipants,
            unmutedParticipants,
            cameraOnParticipants,
            sharingScreenParticipants
        });
    }

    public setLocalStream(userId: string, stream: MediaStream | null) {
        if (stream) {
            this.activeStreams.set(userId, stream);
        } else {
            this.activeStreams.delete(userId);
        }

        const p = this.participants.get(userId);
        if (p) {
            p.stream = stream || undefined;
            this.participants.set(userId, p);

            // Emit update with derived sets
            this.emitParticipantState();
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
                    logger.debug('Received mediaStateChanged', msg.mediaStateChanged);
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
                    if (msg.adminEvent.action === 'kicked' || msg.adminEvent.action === 'kick') {
                        this.onStateChange({
                            error: `You were kicked: ${msg.adminEvent.reason}`,
                            isKicked: true
                        });
                        this.disconnect();
                    } else if (msg.adminEvent.action === 'room_closed') {
                        this.onStateChange({ error: `The room has been closed by the host.` });
                        this.disconnect();
                    } else if (msg.adminEvent.action === 'ownership_transferred') {
                        const newOwnerId = msg.adminEvent.reason;
                        const isMe = newOwnerId === this.currentUserId;
                        if (isMe) {
                            // Local host status might be updated by roomState broadcast, 
                            // but we can proactively alert the user.
                            logger.info('You are now the host');
                            this.onStateChange({ isHost: true });
                        }
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
            // Ensure stream is consistent with our local map (source of truth for streams)
            const localStreamRef = this.activeStreams.get(userId);

            // If we have a stream locally but it's not on the participant object, attach it
            if (localStreamRef && !p.stream) {
                p.stream = localStreamRef;
                logger.debug(`[RoomClient] updateParticipantState: Restored missing stream for ${userId}`);
            }

            if (p.stream && !updates.stream) {
                logger.debug(`[RoomClient] updateParticipantState checking stream for ${userId}: Stream ${p.stream.id} preserved.`);
            } else if (!p.stream && !updates.stream) {
                // Check one last time before warning
                if (localStreamRef) {
                    p.stream = localStreamRef;
                } else {
                    logger.warn(`[RoomClient] updateParticipantState: Participant ${userId} has NO stream before update!`);
                }
            }

            const updated = { ...p, ...updates };
            // Ensure the stream is definitely on the updated object if we have it
            if (localStreamRef && !updated.stream) {
                updated.stream = localStreamRef;
            }

            this.participants.set(userId, updated);

            // Emit robust update
            this.emitParticipantState();
        } else {
            logger.warn(`[RoomClient] updateParticipantState: User ${userId} not found in map.`);
        }
    }

    private handleJoinResponse(response: any) {
        if (response.success) {
            this.currentUserId = response.userId;
            // Check if we are actually in the waiting room (race condition fix: roomState arrived before joinResponse)
            const amInWaitingRoom = this.waitingParticipants.has(response.userId);

            this.onStateChange({
                isJoined: !amInWaitingRoom, // Only 'joined' if we aren't in the waiting room
                currentUserId: response.userId,
                isHost: response.isHost,
                isWaitingRoom: amInWaitingRoom
            });
            // Initial State
            if (response.initialState) {
                this.handleRoomState(response.initialState, true);
            }
        } else {
            this.onStateChange({ error: 'Failed to join room' });
        }
    }

    private handleRoomState(state: RoomStateEvent, isInitial = false) {
        const newParticipants = new Map<string, Participant>();
        let amInWaitingRoom = false;

        // Process Participants
        state.participants.forEach((p: ParticipantInfo) => {
            // Check if we already have a stream for this user (from previous state or early track event)
            const existingStream = this.activeStreams.get(p.id);

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

        // Calculate Sets for Initial Emit
        const raisingHandParticipants = new Set<string>();
        const unmutedParticipants = new Set<string>();
        const cameraOnParticipants = new Set<string>();
        const sharingScreenParticipants = new Set<string>();

        this.participants.forEach(p => {
            if (p.isHandRaised) raisingHandParticipants.add(p.id);
            if (p.isAudioEnabled) unmutedParticipants.add(p.id);
            if (p.isVideoEnabled) cameraOnParticipants.add(p.id);
            if (p.isScreenSharing) sharingScreenParticipants.add(p.id);
        });

        this.onStateChange({
            participants: newParticipants,
            waitingParticipants: newWaiting,
            isWaitingRoom: amInWaitingRoom,
            isInitialState: isInitial,
            raisingHandParticipants,
            unmutedParticipants,
            cameraOnParticipants,
            sharingScreenParticipants
        });
    }

    private handleTrackAdded(event: { userId: string, streamId: string, trackKind: string }) {
        logger.info('Track Added Event', event);
        this.streamToUserMap.set(event.streamId, event.userId);
    }

    private handleRemoteTrack(stream: MediaStream, track: MediaStreamTrack) {
        // 1. Strict match only
        const userId = this.streamToUserMap.get(stream.id);
        if (userId) {
            this.assignStreamToUser(userId, stream);
            return;
        }

        // 2. Strict ID match failed
        logger.warn('Received track for unknown or unmapped stream ID. Dropping.', {
            streamId: stream.id,
            trackKind: track.kind
        });
    }

    private assignStreamToUser(userId: string, stream: MediaStream) {
        // [REFRACTOR] Use the stream directly. Do NOT create new MediaStream().
        // This avoids unnecessary object creation and lets us track the native stream's events.

        logger.info('Assigned stream to user', { userId, tracks: stream.getTracks().length, streamId: stream.id });

        const currentStream = this.activeStreams.get(userId);
        if (currentStream && currentStream.id !== stream.id) {
            // Logic to handle stream *replacement* (e.g. screen share switching or re-negotiation leading to new stream ID)
            // Stop old tracks if they aren't in the new stream?
            // Actually, WebRTC usually reuses stream ID for same transceiver, but if it changes:
            logger.info(`Replacing old stream ${currentStream.id} with new stream ${stream.id} for user ${userId}`);
        }

        this.activeStreams.set(userId, stream);
        this.onMediaTrackAdded(userId, stream);

        // Update internal participants map to keep it in sync
        const p = this.participants.get(userId);
        if (p) {
            p.stream = stream;

            // Self-Healing: If we received a video track, ensure isVideoEnabled is true
            if (stream.getVideoTracks().length > 0 && !p.isVideoEnabled) {
                logger.info(`[RoomClient] Self-healing: Enabling video for ${userId} because video track was received.`);
                p.isVideoEnabled = true;
            }

            this.participants.set(userId, p);

            // Broadcast state update
            const newParticipants = new Map(this.participants);
            this.onStateChange({ participants: newParticipants });
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

    public transferOwnership(userId: string) {
        this.ws?.send({
            adminAction: {
                action: 'transfer_ownership',
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
