package room

import (
	"container/list"
	"context"
	"encoding/json"
	"fmt"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"go.uber.org/zap"
)

// --- Participant Management ---

func (r *Room) addParticipantLocked(ctx context.Context, client types.ClientInterface) {
	// Fix Unbounded Rooms
	if r.participantCount >= MaxParticipants {
		logging.Warn(ctx, "Room is full, rejecting participant", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))
		// Optionally send a specific error message if protocol allowed
		client.SendProto(&pb.WebSocketMessage{
			Payload: &pb.WebSocketMessage_JoinResponse{
				JoinResponse: &pb.JoinResponse{
					Success: false,
					// Potentially add ErrorReason field to Proto in future
				},
			},
		})
		// Force disconnect
		go client.Disconnect()
		return
	}

	logging.Info(ctx, "Adding Participant", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))

	client.SetRole(types.RoleTypeParticipant)
	// We can't store drawOrderElement in the interface easily without adding it to the interface.
	// For now, we'll use a hack or just accept that draw order might be slightly less efficient
	// if we have to search. But actually, the interface could have Get/SetDrawOrderElement.
	// Let's assume the interface doesn't have it for now and see if we can live without it or add it.
	r.clientDrawOrderQueue.PushBack(client)
	r.clients[client.GetID()] = client
	r.participantCount++

	if r.bus != nil {
		clientInfo := types.ClientInfo{ClientID: client.GetID(), DisplayName: client.GetDisplayName()}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:participants", r.ID)
		if err := r.bus.SetAdd(ctx, key, string(data)); err != nil {
			logging.Error(ctx, "Redis error", zap.Error(err))
		}
	}
}

func (r *Room) addParticipant(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addParticipantLocked(ctx, client)
}

func (r *Room) deleteParticipantLocked(ctx context.Context, client types.ClientInterface) {
	logging.Info(ctx, "Deleting Participant", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))

	// Linear search in draw order queue since we removed the element pointer from Client
	for e := r.clientDrawOrderQueue.Front(); e != nil; e = e.Next() {
		if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
			r.clientDrawOrderQueue.Remove(e)
			r.participantCount--
			break
		}
	}

	if r.bus != nil {
		clientInfo := types.ClientInfo{ClientID: client.GetID(), DisplayName: client.GetDisplayName()}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:participants", r.ID)
		if err := r.bus.SetRem(ctx, key, string(data)); err != nil {
			logging.Error(ctx, "Redis error: failed to remove participant", zap.String("room", string(r.ID)), zap.String("key", key), zap.Error(err))
		}
	}
}

func (r *Room) deleteParticipant(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleteParticipantLocked(ctx, client)
}

func (r *Room) addHostLocked(ctx context.Context, client types.ClientInterface) {
	if r.participantCount >= MaxParticipants {
		logging.Warn(ctx, "Room is full, rejecting host", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))
		// Force disconnect
		go client.Disconnect()
		return
	}

	logging.Info(ctx, "Adding Host", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))

	client.SetRole(types.RoleTypeHost)
	r.clientDrawOrderQueue.PushBack(client)
	r.clients[client.GetID()] = client
	r.participantCount++

	if r.bus != nil {
		clientInfo := types.ClientInfo{ClientID: client.GetID(), DisplayName: client.GetDisplayName()}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:hosts", r.ID)
		if err := r.bus.SetAdd(ctx, key, string(data)); err != nil {
			logging.Error(ctx, "Redis error: failed to add host", zap.String("room", string(r.ID)), zap.String("key", key), zap.Error(err))
		}
	}
}

func (r *Room) addHost(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addHostLocked(ctx, client)
}

func (r *Room) deleteHostLocked(ctx context.Context, client types.ClientInterface) {
	logging.Info(ctx, "Deleting Host", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))

	for e := r.clientDrawOrderQueue.Front(); e != nil; e = e.Next() {
		if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
			r.clientDrawOrderQueue.Remove(e)
			r.participantCount--
			break
		}
	}

	if r.bus != nil {
		clientInfo := types.ClientInfo{ClientID: client.GetID(), DisplayName: client.GetDisplayName()}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:hosts", r.ID)
		if err := r.bus.SetRem(ctx, key, string(data)); err != nil {
			logging.Error(ctx, "Redis error: failed to remove host", zap.String("room", string(r.ID)), zap.String("key", key), zap.Error(err))
		}
	}
}

func (r *Room) deleteHost(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleteHostLocked(ctx, client)
}

// --- Waiting Room ---

func (r *Room) addWaitingLocked(client types.ClientInterface) {
	if r.participantCount >= MaxParticipants {
		logging.Warn(context.Background(), "Room is full, rejecting waiting user", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))
		// Force disconnect
		go client.Disconnect()
		return
	}

	logging.Info(context.Background(), "Adding Waiting User", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))

	client.SetRole(types.RoleTypeWaiting)
	r.waitingDrawOrderStack.PushFront(client)
	r.clients[client.GetID()] = client
}

func (r *Room) addWaiting(client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addWaitingLocked(client)
}

func (r *Room) deleteWaitingLocked(client types.ClientInterface) {
	logging.Info(context.Background(), "Deleting Waiting User", zap.String("room", string(r.ID)), zap.String("clientId", string(client.GetID())))

	for e := r.waitingDrawOrderStack.Front(); e != nil; e = e.Next() {
		if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
			r.waitingDrawOrderStack.Remove(e)
			break
		}
	}
}

func (r *Room) deleteWaiting(client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleteWaitingLocked(client)
}

// --- Chat Management ---

func (r *Room) addChat(chat types.ChatInfo) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.chatHistory == nil {
		r.chatHistory = list.New()
	}
	// Fix Chat History Memory
	msgSize := len(string(chat.ChatContent))

	r.chatHistory.PushBack(chat)
	r.currentChatHistoryBytes += msgSize

	// Prune by count
	if r.maxChatHistoryLength > 0 {
		for r.chatHistory.Len() > r.maxChatHistoryLength {
			e := r.chatHistory.Front()
			if c, ok := e.Value.(types.ChatInfo); ok {
				r.currentChatHistoryBytes -= len(string(c.ChatContent))
			}
			r.chatHistory.Remove(e)
		}
	}

	// Prune by size
	if r.maxChatHistoryBytes > 0 {
		for r.currentChatHistoryBytes > r.maxChatHistoryBytes {
			e := r.chatHistory.Front()
			if e == nil {
				break
			}
			if c, ok := e.Value.(types.ChatInfo); ok {
				r.currentChatHistoryBytes -= len(string(c.ChatContent))
			}
			r.chatHistory.Remove(e)
		}
	}
}

func (r *Room) getRecentChatsLocked() []types.ChatInfo {
	if r.chatHistory == nil {
		return []types.ChatInfo{}
	}

	// Convert linked list to slice
	messages := make([]types.ChatInfo, 0, r.chatHistory.Len())
	for e := r.chatHistory.Front(); e != nil; e = e.Next() {
		if chatMsg, ok := e.Value.(types.ChatInfo); ok {
			messages = append(messages, chatMsg)
		}
	}

	// Return last 50 messages
	limit := 50
	if len(messages) > limit {
		return messages[len(messages)-limit:]
	}
	return messages
}

func (r *Room) getRecentChats() []types.ChatInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.getRecentChatsLocked()
}

func (r *Room) deleteChatLocked(payload types.DeleteChatPayload) {
	if r.chatHistory == nil {
		return
	}

	// Linear search to find and remove message
	for e := r.chatHistory.Front(); e != nil; e = e.Next() {
		if chatMsg, ok := e.Value.(types.ChatInfo); ok {
			if chatMsg.ChatID == payload.ChatID {
				r.currentChatHistoryBytes -= len(string(chatMsg.ChatContent))
				r.chatHistory.Remove(e)
				return
			}
		}
	}
}

func (r *Room) deleteChat(payload types.DeleteChatPayload) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleteChatLocked(payload)
}

// --- State Toggles ---

// These are handled by the handlers calling methods on the client directly if possible,
// or we can have methods here that take the interface.

func (r *Room) toggleAudio(client types.ClientInterface, enabled bool) {
	client.SetIsAudioEnabled(enabled)
}

func (r *Room) toggleVideo(client types.ClientInterface, enabled bool) {
	client.SetIsVideoEnabled(enabled)
}

func (r *Room) toggleScreenshare(client types.ClientInterface, enabled bool) {
	client.SetIsScreenSharing(enabled)
	if enabled {
		found := false
		for e := r.clientDrawOrderQueue.Front(); e != nil; e = e.Next() {
			if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
				found = true
				break
			}
		}
		if !found {
			r.clientDrawOrderQueue.PushBack(client)
		}
	}
}

func (r *Room) raiseHand(client types.ClientInterface, raised bool) {
	client.SetIsHandRaised(raised)
	if raised {
		found := false
		for e := r.handDrawOrderQueue.Front(); e != nil; e = e.Next() {
			if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
				found = true
				break
			}
		}
		if !found {
			r.handDrawOrderQueue.PushBack(client)
		}
	} else {
		for e := r.handDrawOrderQueue.Front(); e != nil; e = e.Next() {
			if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
				r.handDrawOrderQueue.Remove(e)
				break
			}
		}
	}
}

// --- Cleanup ---

func (r *Room) disconnectClientLocked(ctx context.Context, client types.ClientInterface) {
	// Clean up SFU session if it exists
	if r.sfu != nil {
		if err := r.sfu.DeleteSession(ctx, string(client.GetID()), string(r.ID)); err != nil {
			logging.Warn(ctx, "Failed to delete SFU session on disconnect", zap.String("clientId", string(client.GetID())), zap.Error(err))
		}
	}

	r.deleteHostLocked(ctx, client)
	r.deleteParticipantLocked(ctx, client)
	r.deleteWaitingLocked(client)

	// Remove from Single Source of Truth
	delete(r.clients, client.GetID())

	// Underlying connection closing should be handled by the transport layer.
	// We might need a Disconnect() or Close() method in the interface if Room needs to trigger it.

	for e := r.handDrawOrderQueue.Front(); e != nil; e = e.Next() {
		if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
			r.handDrawOrderQueue.Remove(e)
			break
		}
	}
}

func (r *Room) disconnectClient(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.disconnectClientLocked(ctx, client)
}
