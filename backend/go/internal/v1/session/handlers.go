package session

import (
	"context"
	"log/slog"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

func (r *Room) HandleToggleMedia(ctx context.Context, client *Client, req *pb.ToggleMediaRequest) {
	r.mu.Lock()
	defer r.mu.Unlock()

	switch req.Kind {
	case "audio":
		r.toggleAudio(client, req.IsEnabled) // Calls methods.go
	case "video":
		r.toggleVideo(client, req.IsEnabled) // Calls methods.go
	}

	// 2. Broadcast Update
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_MediaStateChanged{
			MediaStateChanged: &pb.MediaStateEvent{
				UserId:         string(client.ID),
				IsAudioEnabled: client.IsAudioEnabled,
				IsVideoEnabled: client.IsVideoEnabled,
			},
		},
	}
	r.broadcastLocked(msg)
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
	r.broadcastLocked(msg)
}

func (r *Room) HandleChat(ctx context.Context, client *Client, chatReq *pb.ChatRequest) {
	// 1. Create the Event (business logic)
	event := buildChatEvent(client, chatReq)

	// 2. Store in History (business logic + state change)
	if shouldStoreChatInHistory(event) {
		r.addChat(chatInfoFromEvent(event))
	}

	// 3. Broadcast (I/O glue)
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
	r.broadcastLocked(msg)
}

func (r *Room) HandleGetRecentChats(ctx context.Context, client *Client) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	internalChats := r.getRecentChatsLocked()

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
	r.deleteChatLocked(ChatInfo{ChatId: ChatId(req.ChatId)})

	// Broadcast Deletion
	r.broadcastLocked(&pb.WebSocketMessage{
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
	for _, c := range r.clients {
		if c.Role == RoleTypeHost {
			c.sendProto(msg)
		}
	}
}

// HandleAdminAction processes admin actions (kick, approve, mute, unmute).
// This is thin I/O glue - business logic is in admin_helpers.go (testable).
func (r *Room) HandleAdminAction(ctx context.Context, client *Client, adminReq *pb.AdminActionRequest) {
	// Permission check (business logic)
	if err := validateAdminPermission(client.Role); err != nil {
		slog.Warn("Unauthorized admin action attempt", "clientId", client.ID, "error", err)
		return
	}

	targetId := ClientIdType(adminReq.TargetUserId)
	action := parseAdminAction(adminReq.Action)

	r.mu.Lock()
	defer r.mu.Unlock()

	// Find target (business logic)
	target, err := findTargetClient(r.clients, targetId)
	if err != nil && action != AdminActionKick {
		// Kick doesn't error on missing target - just no-op
		return
	}

	// Execute action (business logic + I/O glue)
	switch action {
	case AdminActionKick:
		if shouldKickClient(target) {
			target.sendProto(buildKickMessage()) // I/O
			target.conn.Close()                  // I/O - triggers readPump exit
		}

	case AdminActionApprove:
		if shouldApproveWaitingUser(target) {
			r.deleteWaitingLocked(target)                             // State change
			r.addParticipantLocked(ctx, target)                       // State change
			target.sendProto(buildApprovalMessage(string(target.ID))) // I/O
			go r.CreateSFUSession(ctx, target)                        // I/O
			go r.BroadcastRoomState(ctx)                              // I/O
		}

	case AdminActionMute:
		if shouldMuteClient(target) {
			r.toggleAudio(target, false) // State change
			go r.BroadcastRoomState(ctx) // I/O
		}

	case AdminActionUnmute:
		if shouldMuteClient(target) {
			r.toggleAudio(target, true)  // State change
			go r.BroadcastRoomState(ctx) // I/O
		}
	}
}
