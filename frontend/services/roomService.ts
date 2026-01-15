
export interface WebRTCManager {
    addPeer(peerId: string): Promise<void>;
}

export class RoomService {
    private webrtcManager: WebRTCManager;

    private queue: Promise<void> = Promise.resolve();

    constructor(webrtcManager: WebRTCManager) {
        this.webrtcManager = webrtcManager;
    }

    async joinParticipant(peerId: string): Promise<void> {
        // Queue the addPeer call to ensure sequential execution
        const operation = this.queue.then(() => this.webrtcManager.addPeer(peerId));

        // Update the queue pointer, catching errors so the queue doesn't stall on failure
        this.queue = operation.catch(() => {
            // Log error but allow queue to continue
            console.error(`Error adding peer ${peerId}`);
        });

        return operation;
    }
}
