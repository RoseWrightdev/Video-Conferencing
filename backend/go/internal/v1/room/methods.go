package room

import (
	"container/list"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
)

// --- Participant Management ---

func (r *Room) addParticipantLocked(ctx context.Context, client types.ClientInterface) {
	slog.Info("Adding Participant", "room", r.ID, "clientId", client.GetID())

	client.SetRole(types.RoleTypeParticipant)
	// We can't store drawOrderElement in the interface easily without adding it to the interface.
	// For now, we'll use a hack or just accept that draw order might be slightly less efficient
	// if we have to search. But actually, the interface could have Get/SetDrawOrderElement.
	// Let's assume the interface doesn't have it for now and see if we can live without it or add it.
	r.clientDrawOrderQueue.PushBack(client)
	r.clients[client.GetID()] = client

	if r.bus != nil {
		clientInfo := types.ClientInfo{ClientId: client.GetID(), DisplayName: client.GetDisplayName()}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:participants", r.ID)
		if err := r.bus.SetAdd(ctx, key, string(data)); err != nil {
			slog.Error("Redis error", "err", err)
		}
	}
}

func (r *Room) addParticipant(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addParticipantLocked(ctx, client)
}

func (r *Room) deleteParticipantLocked(ctx context.Context, client types.ClientInterface) {
	slog.Info("Deleting Participant", "room", r.ID, "clientId", client.GetID())

	// Linear search in draw order queue since we removed the element pointer from Client
	for e := r.clientDrawOrderQueue.Front(); e != nil; e = e.Next() {
		if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
			r.clientDrawOrderQueue.Remove(e)
			break
		}
	}

	if r.bus != nil {
		clientInfo := types.ClientInfo{ClientId: client.GetID(), DisplayName: client.GetDisplayName()}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:participants", r.ID)
		if err := r.bus.SetRem(ctx, key, string(data)); err != nil {
			slog.Error("Redis error: failed to remove participant", "room", r.ID, "key", key, "error", err)
		}
	}
}

func (r *Room) deleteParticipant(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleteParticipantLocked(ctx, client)
}

func (r *Room) addHostLocked(ctx context.Context, client types.ClientInterface) {
	slog.Info("Adding Host", "room", r.ID, "clientId", client.GetID())

	client.SetRole(types.RoleTypeHost)
	r.clientDrawOrderQueue.PushBack(client)
	r.clients[client.GetID()] = client

	if r.bus != nil {
		clientInfo := types.ClientInfo{ClientId: client.GetID(), DisplayName: client.GetDisplayName()}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:hosts", r.ID)
		if err := r.bus.SetAdd(ctx, key, string(data)); err != nil {
			slog.Error("Redis error: failed to add host", "room", r.ID, "key", key, "error", err)
		}
	}
}

func (r *Room) addHost(ctx context.Context, client types.ClientInterface) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addHostLocked(ctx, client)
}

func (r *Room) deleteHostLocked(ctx context.Context, client types.ClientInterface) {
	slog.Info("Deleting Host", "room", r.ID, "clientId", client.GetID())

	for e := r.clientDrawOrderQueue.Front(); e != nil; e = e.Next() {
		if c, ok := e.Value.(types.ClientInterface); ok && c.GetID() == client.GetID() {
			r.clientDrawOrderQueue.Remove(e)
			break
		}
	}

	if r.bus != nil {
		clientInfo := types.ClientInfo{ClientId: client.GetID(), DisplayName: client.GetDisplayName()}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:hosts", r.ID)
		if err := r.bus.SetRem(ctx, key, string(data)); err != nil {
			slog.Error("Redis error: failed to remove host", "room", r.ID, "key", key, "error", err)
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
	slog.Info("Adding Waiting User", "room", r.ID, "clientId", client.GetID())

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
	slog.Info("Deleting Waiting User", "room", r.ID, "clientId", client.GetID())

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
	r.chatHistory.PushBack(chat)

	if r.maxChatHistoryLength > 0 {
		for r.chatHistory.Len() > r.maxChatHistoryLength {
			r.chatHistory.Remove(r.chatHistory.Front())
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
			if chatMsg.ChatId == payload.ChatId {
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
			slog.Warn("Failed to delete SFU session on disconnect", "clientId", client.GetID(), "error", err)
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
