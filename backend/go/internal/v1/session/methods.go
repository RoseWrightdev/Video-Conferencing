package session

import (
	"container/list"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

// --- Participant Management ---

func (r *Room) addParticipant(ctx context.Context, client *Client) {
	client.Role = RoleTypeParticipant
	element := r.clientDrawOrderQueue.PushBack(client)
	client.drawOrderElement = element
	r.participants[client.ID] = client

	if r.bus != nil {
		clientInfo := ClientInfo{ClientId: client.ID, DisplayName: client.DisplayName}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:participants", r.ID)
		if err := r.bus.SetAdd(ctx, key, string(data)); err != nil {
			slog.Error("Redis error", "err", err)
		}
	}
}

func (r *Room) deleteParticipant(ctx context.Context, client *Client) {
	delete(r.participants, client.ID)
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

func (r *Room) addHost(ctx context.Context, client *Client) {
	client.Role = RoleTypeHost
	element := r.clientDrawOrderQueue.PushBack(client)
	client.drawOrderElement = element
	r.hosts[client.ID] = client

	if r.bus != nil {
		clientInfo := ClientInfo{ClientId: client.ID, DisplayName: client.DisplayName}
		data, _ := json.Marshal(clientInfo)
		key := fmt.Sprintf("room:%s:hosts", r.ID)
		r.bus.SetAdd(ctx, key, string(data))
	}
}

func (r *Room) deleteHost(ctx context.Context, client *Client) {
	delete(r.hosts, client.ID)
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

// --- Waiting Room ---

func (r *Room) addWaiting(client *Client) {
	client.Role = RoleTypeWaiting
	element := r.waitingDrawOrderStack.PushFront(client)
	client.drawOrderElement = element
	r.waiting[client.ID] = client
}

func (r *Room) deleteWaiting(client *Client) {
	delete(r.waiting, client.ID)
	if client.drawOrderElement != nil {
		r.waitingDrawOrderStack.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}
}

// --- Chat Management ---

func (r *Room) addChat(chat ChatInfo) {
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

func (r *Room) getRecentChats() []ChatInfo {
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

func (r *Room) deleteChat(payload DeleteChatPayload) {
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

// --- State Toggles ---

func (r *Room) toggleAudio(client *Client, enabled bool) {
	if enabled {
		r.unmuted[client.ID] = client
	} else {
		delete(r.unmuted, client.ID)
	}
}

func (r *Room) toggleVideo(client *Client, enabled bool) {
	if enabled {
		r.cameraOn[client.ID] = client
	} else {
		delete(r.cameraOn, client.ID)
	}
}

func (r *Room) toggleScreenshare(client *Client, enabled bool) {
	if enabled {
		r.sharingScreen[client.ID] = client
		if client.drawOrderElement == nil {
			client.drawOrderElement = r.clientDrawOrderQueue.PushBack(client)
		}
	} else {
		delete(r.sharingScreen, client.ID)
	}
}

func (r *Room) raiseHand(client *Client, raised bool) {
	if raised {
		r.raisingHand[client.ID] = client
		if client.drawOrderElement == nil {
			client.drawOrderElement = r.handDrawOrderQueue.PushBack(client)
		}
	} else {
		delete(r.raisingHand, client.ID)
	}
}

// --- Cleanup ---

func (r *Room) disconnectClient(ctx context.Context, client *Client) {
	r.deleteHost(ctx, client)
	r.deleteParticipant(ctx, client)
	r.deleteWaiting(client)

	delete(r.raisingHand, client.ID)
	delete(r.sharingScreen, client.ID)
	delete(r.unmuted, client.ID)
	delete(r.cameraOn, client.ID)
	close(client.send)

	if client.drawOrderElement != nil {
		r.handDrawOrderQueue.Remove(client.drawOrderElement)
		client.drawOrderElement = nil
	}
}

// --- Proto Helpers ---

func (r *Room) BuildRoomStateProto(ctx context.Context) *pb.RoomStateEvent {
	var pbParticipants []*pb.ParticipantInfo

	makeProto := func(id string, name string, isHost bool) *pb.ParticipantInfo {
		cid := ClientIdType(id)
		return &pb.ParticipantInfo{
			Id:              id,
			DisplayName:     name,
			IsHost:          isHost,
			IsAudioEnabled:  r.unmuted[cid] != nil,
			IsVideoEnabled:  r.cameraOn[cid] != nil,
			IsScreenSharing: r.sharingScreen[cid] != nil,
			IsHandRaised:    r.raisingHand[cid] != nil,
		}
	}

	// 1. Fetch Hosts (Redis + Local)
	hosts := r.getLocalHosts()
	for _, h := range hosts {
		pbParticipants = append(pbParticipants, makeProto(string(h.ClientId), string(h.DisplayName), true))
	}

	// 2. Fetch Participants (Redis + Local)
	parts := r.getLocalParticipants()
	for _, p := range parts {
		pbParticipants = append(pbParticipants, makeProto(string(p.ClientId), string(p.DisplayName), false))
	}

	return &pb.RoomStateEvent{
		Participants: pbParticipants,
	}
}

func (r *Room) getLocalHosts() []ClientInfo {
	list := []ClientInfo{}
	for _, c := range r.hosts {
		list = append(list, ClientInfo{ClientId: c.ID, DisplayName: c.DisplayName})
	}
	return list
}

func (r *Room) getLocalParticipants() []ClientInfo {
	list := []ClientInfo{}
	for _, c := range r.participants {
		list = append(list, ClientInfo{ClientId: c.ID, DisplayName: c.DisplayName})
	}
	return list
}