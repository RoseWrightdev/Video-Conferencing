package session

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

func (r *Room) HandleToggleMedia(ctx context.Context, client *Client, req *pb.ToggleMediaRequest) {
	r.mu.Lock()
	defer r.mu.Unlock()

	switch req.Kind {
	case "audio":
		r.toggleAudio(client, req.IsEnabled) // Calls room_methods.go
	case "video":
		r.toggleVideo(client, req.IsEnabled) // Calls room_methods.go
	}

	// 2. Broadcast Update
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_MediaStateChanged{
			MediaStateChanged: &pb.MediaStateEvent{
				UserId:         string(client.ID),
				IsAudioEnabled: r.unmuted[client.ID] != nil,
				IsVideoEnabled: r.cameraOn[client.ID] != nil,
			},
		},
	}
	r.Broadcast(msg)
}

func (r *Room) HandleToggleHand(ctx context.Context, client *Client, req *pb.ToggleHandRequest) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// [FIX] Use the helper method to maintain queue order
	r.raiseHand(client, req.IsRaised)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_HandUpdate{
			HandUpdate: &pb.HandUpdateEvent{
				UserId:   string(client.ID),
				IsRaised: req.IsRaised,
			},
		},
	}
	r.Broadcast(msg)
}

func (r *Room) HandleChat(ctx context.Context, client *Client, chatReq *pb.ChatRequest) {
	// 1. Create the Event
	event := &pb.ChatEvent{
		Id:         fmt.Sprintf("%d", time.Now().UnixNano()),
		SenderId:   string(client.ID),
		SenderName: string(client.DisplayName),
		Content:    chatReq.Content,
		Timestamp:  time.Now().UnixMilli(),
		IsPrivate:  chatReq.TargetId != "",
	}

	// 2. Store in History using the "unused" method
	if !event.IsPrivate {
		chatInfo := ChatInfo{
			ClientInfo:  ClientInfo{ClientId: client.ID, DisplayName: client.DisplayName},
			ChatId:      ChatId(event.Id),
			Timestamp:   Timestamp(event.Timestamp),
			ChatContent: ChatContent(event.Content),
		}
		r.addChat(chatInfo)
	}

	// 3. Broadcast
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{
			ChatEvent: event,
		},
	}

	if event.IsPrivate {
		// todo (Optional logic for DM)
	} else {
		r.Broadcast(msg)
	}
}

func (r *Room) HandleScreenShare(ctx context.Context, client *Client, req *pb.ScreenShareRequest) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.toggleScreenshare(client, req.IsSharing)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ScreenShareChanged{
			ScreenShareChanged: &pb.ScreenShareEvent{
				UserId:    string(client.ID),
				IsSharing: req.IsSharing,
			},
		},
	}
	r.Broadcast(msg)
}

func (r *Room) HandleGetRecentChats(ctx context.Context, client *Client) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	// Use internal method from methods.go
	internalChats := r.getRecentChats(ChatInfo{})

	var protoChats []*pb.ChatEvent
	for _, msg := range internalChats {
		protoChats = append(protoChats, &pb.ChatEvent{
			Id:         string(msg.ChatId),
			SenderId:   string(msg.ClientId),
			SenderName: string(msg.DisplayName),
			Content:    string(msg.ChatContent),
			Timestamp:  int64(msg.Timestamp),
		})
	}

client.sendProto(&pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_RecentChats_{
			RecentChats_: &pb.RecentChatsEvent{
				Chats: protoChats,
			},
		},
	})
}

// 3. Delete Chat Handler
func (r *Room) HandleDeleteChat(ctx context.Context, client *Client, req *pb.DeleteChatRequest) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Permission: Must be Host OR the Participant who sent it
	// (Simple check: allow Hosts and Participants. Strict ownership check would require looking up the msg)
	if !HasPermission(client.Role, HasParticipantPermission()) {
		return
	}

	// Delete from memory
	r.deleteChat(ChatInfo{ChatId: ChatId(req.ChatId)})

	// Broadcast Deletion
	r.Broadcast(&pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_DeleteChatEvent{
			DeleteChatEvent: &pb.DeleteChatEvent{
				ChatId: req.ChatId,
			},
		},
	})
}

// 4. Request Screen Share Permission
func (r *Room) HandleRequestScreenSharePermission(ctx context.Context, client *Client) {
	// Notify all Hosts that "User X wants to share"
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ScreenSharePermissionEvent{
			ScreenSharePermissionEvent: &pb.ScreenSharePermissionEvent{
				UserId:      string(client.ID),
				DisplayName: string(client.DisplayName),
				IsGranted:   false, // False = "Requesting"
			},
		},
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	// Send only to Hosts
	for _, host := range r.hosts {
		host.sendProto(msg)
	}
}

func (r *Room) HandleAdminAction(ctx context.Context, client *Client, adminReq *pb.AdminActionRequest) {
	// 1. SECURITY CHECK: Must be Host
	if !HasPermission(client.Role, HasHostPermission()) {
		slog.Warn("Unauthorized admin action attempt", "clientId", client.ID)
		return
	}

	targetId := ClientIdType(adminReq.TargetUserId)

	r.mu.Lock()
	defer r.mu.Unlock()

	switch adminReq.Action {
	case "kick":
		// Find the target (could be participant, host, or waiting)
		var target *Client
		if c, ok := r.participants[targetId]; ok {
			target = c
		}
		if c, ok := r.hosts[targetId]; ok {
			target = c
		}
		if c, ok := r.waiting[targetId]; ok {
			target = c
		}

		if target != nil {
			// Notify them they are kicked
			kickMsg := &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_AdminEvent{
					AdminEvent: &pb.AdminActionEvent{
						Action: "kicked",
						Reason: "Host removed you",
					},
				},
			}
			target.sendProto(kickMsg)

			// Actually disconnect them
			go r.disconnectClient(ctx, target)
		}

	case "approve":
		if target, ok := r.waiting[targetId]; ok {
			// [FIX] Use helpers to move properly
			r.deleteWaiting(target)       // Remove from waiting queue
			r.addParticipant(ctx, target) // Add to participant queue + Redis

			// Notify User
			joinMsg := &pb.WebSocketMessage{
				Payload: &pb.WebSocketMessage_JoinResponse{
					JoinResponse: &pb.JoinResponse{
						Success: true,
						UserId:  string(target.ID),
						IsHost:  false,
					},
				},
			}
			target.sendProto(joinMsg)

			// Start Video
			go r.CreateSFUSession(ctx, target)

			// Update everyone else
			go r.BroadcastRoomState(ctx)
		}

	case "mute":
		// Logic to update state
		if target, ok := r.participants[targetId]; ok {
			delete(r.unmuted, target.ID)
			// Send update to room
			go r.BroadcastRoomState(ctx)
		}

	case "unmute":
		if target, ok := r.participants[targetId]; ok {
			r.unmuted[target.ID] = target
			go r.BroadcastRoomState(ctx)
		}
	}
}
