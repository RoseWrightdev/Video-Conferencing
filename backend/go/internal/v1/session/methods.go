package session

import (
	"container/list"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
)

// --- Participant Management ---

func (r *Room) addParticipantLocked(ctx context.Context, client *Client) {
	slog.Info("Adding Participant", "room", r.ID, "clientId", client.ID)

	client.Role = RoleTypeParticipant
	element := r.clientDrawOrderQueue.PushBack(client)
	client.drawOrderElement = element
	r.clients[client.ID] = client

	if r.bus != nil {
		clientInfo := ClientInfo{ClientId: client.ID, DisplayName: client.DisplayName}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:participants", r.ID)
		if err := r.bus.SetAdd(ctx, key, string(data)); err != nil {
			slog.Error("Redis error", "err", err)
		}
	}
}

func (r *Room) addParticipant(ctx context.Context, client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addParticipantLocked(ctx, client)
}

func (r *Room) deleteParticipantLocked(ctx context.Context, client *Client) {
	slog.Info("Deleting Participant", "room", r.ID, "clientId", client.ID)
	// delete(r.participants, client.ID) // No longer needed
	if client.drawOrderElement != nil {
		r.clientDrawOrderQueue.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}

	if r.bus != nil {
		clientInfo := ClientInfo{ClientId: client.ID, DisplayName: client.DisplayName}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:participants", r.ID)
		r.bus.SetRem(ctx, key, string(data))
	}
}

func (r *Room) deleteParticipant(ctx context.Context, client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleteParticipantLocked(ctx, client)
}

func (r *Room) addHostLocked(ctx context.Context, client *Client) {
	slog.Info("Adding Host", "room", r.ID, "clientId", client.ID)

	client.Role = RoleTypeHost
	element := r.clientDrawOrderQueue.PushBack(client)
	client.drawOrderElement = element
	r.clients[client.ID] = client

	if r.bus != nil {
		clientInfo := ClientInfo{ClientId: client.ID, DisplayName: client.DisplayName}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:hosts", r.ID)
		r.bus.SetAdd(ctx, key, string(data))
	}
}

func (r *Room) addHost(ctx context.Context, client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addHostLocked(ctx, client)
}

func (r *Room) deleteHostLocked(ctx context.Context, client *Client) {
	slog.Info("Deleting Host", "room", r.ID, "clientId", client.ID)
	// delete(r.hosts, client.ID)
	if client.drawOrderElement != nil {
		r.clientDrawOrderQueue.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}

	if r.bus != nil {
		clientInfo := ClientInfo{ClientId: client.ID, DisplayName: client.DisplayName}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:hosts", r.ID)
		r.bus.SetRem(ctx, key, string(data))
	}
}

func (r *Room) deleteHost(ctx context.Context, client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleteHostLocked(ctx, client)
}

// --- Waiting Room ---

func (r *Room) addWaitingLocked(client *Client) {
	slog.Info("Adding Waiting User", "room", r.ID, "clientId", client.ID)

	client.Role = RoleTypeWaiting
	element := r.waitingDrawOrderStack.PushFront(client)
	client.drawOrderElement = element
	r.clients[client.ID] = client
}

func (r *Room) addWaiting(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.addWaitingLocked(client)
}

func (r *Room) deleteWaitingLocked(client *Client) {
	slog.Info("Deleting Waiting User", "room", r.ID, "clientId", client.ID)
	// delete(r.waiting, client.ID)
	if client.drawOrderElement != nil {
		r.waitingDrawOrderStack.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}
}

func (r *Room) deleteWaiting(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleteWaitingLocked(client)
}

// --- Chat Management ---

func (r *Room) addChat(chat ChatInfo) {
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

func (r *Room) getRecentChatsLocked() []ChatInfo {
	if r.chatHistory == nil {
		return []ChatInfo{}
	}

	// Convert linked list to slice
	messages := make([]ChatInfo, 0, r.chatHistory.Len())
	for e := r.chatHistory.Front(); e != nil; e = e.Next() {
		if chatMsg, ok := e.Value.(ChatInfo); ok {
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

func (r *Room) getRecentChats() []ChatInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.getRecentChatsLocked()
}

func (r *Room) deleteChatLocked(payload DeleteChatPayload) {
	if r.chatHistory == nil {
		return
	}

	// Linear search to find and remove message
	for e := r.chatHistory.Front(); e != nil; e = e.Next() {
		if chatMsg, ok := e.Value.(ChatInfo); ok {
			if chatMsg.ChatId == payload.ChatId {
				r.chatHistory.Remove(e)
				return
			}
		}
	}
}

func (r *Room) deleteChat(payload DeleteChatPayload) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.deleteChatLocked(payload)
}

// --- State Toggles ---

func (r *Room) toggleAudio(client *Client, enabled bool) {
	client.mu.Lock()
	client.IsAudioEnabled = enabled
	client.mu.Unlock()
}

func (r *Room) toggleVideo(client *Client, enabled bool) {
	client.mu.Lock()
	client.IsVideoEnabled = enabled
	client.mu.Unlock()
}

func (r *Room) toggleScreenshare(client *Client, enabled bool) {
	client.mu.Lock()
	client.IsScreenSharing = enabled
	client.mu.Unlock()

	if enabled {
		if client.drawOrderElement == nil {
			client.drawOrderElement = r.clientDrawOrderQueue.PushBack(client)
		}
	} else {
		// Do we remove from draw order? Original code didn't for disable?
		// Original: delete(r.sharingScreen).
		// Original: "if enabled ... PushBack".
		// It did NOT remove from draw order on disable?
		// Actually typical sharing screen logic implies they might still be a participant.
	}
}

func (r *Room) raiseHand(client *Client, raised bool) {
	client.mu.Lock()
	client.IsHandRaised = raised
	client.mu.Unlock()

	if raised {
		if client.drawOrderElement == nil {
			client.drawOrderElement = r.handDrawOrderQueue.PushBack(client)
		}
	} else {
		// Original removed from raisingHand map.
	}
}

// --- Cleanup ---

func (r *Room) disconnectClientLocked(ctx context.Context, client *Client) {
	// Clean up SFU session if it exists
	if r.sfu != nil {
		if err := r.sfu.DeleteSession(ctx, string(client.ID), string(r.ID)); err != nil {
			slog.Warn("Failed to delete SFU session on disconnect", "clientId", client.ID, "error", err)
		}
	}

	r.deleteHostLocked(ctx, client)
	r.deleteParticipantLocked(ctx, client)
	r.deleteWaitingLocked(client)

	// Remove from Single Source of Truth
	delete(r.clients, client.ID)

	// Mark client as closed BEFORE closing the channel
	client.mu.Lock()
	client.closed = true
	client.mu.Unlock()

	// Use sync.Once to ensure channel is only closed once
	client.closeOnce.Do(func() {
		close(client.send)
		close(client.prioritySend)
	})

	if client.drawOrderElement != nil {
		r.handDrawOrderQueue.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}
}

func (r *Room) disconnectClient(ctx context.Context, client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.disconnectClientLocked(ctx, client)
}
