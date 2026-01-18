package room

import (
	"context"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"go.uber.org/zap"
)

// HandleToggleMedia processes a request to toggle audio or video.
func (r *Room) HandleToggleMedia(_ context.Context, client types.ClientInterface, req *pb.ToggleMediaRequest) {
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
				UserId:         string(client.GetID()),
				IsAudioEnabled: client.GetIsAudioEnabled(),
				IsVideoEnabled: client.GetIsVideoEnabled(),
			},
		},
	}
	r.broadcastLocked(msg)
}

// HandleToggleHand processes a request to toggle a user's raised hand status.
func (r *Room) HandleToggleHand(_ context.Context, client types.ClientInterface, req *pb.ToggleHandRequest) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// [FIX] Use the helper method to maintain queue order
	r.raiseHand(client, req.IsRaised)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_HandUpdate{
			HandUpdate: &pb.HandUpdateEvent{
				UserId:   string(client.GetID()),
				IsRaised: req.IsRaised,
			},
		},
	}
	r.broadcastLocked(msg)
}

// HandleChat processes a new chat message.
func (r *Room) HandleChat(_ context.Context, client types.ClientInterface, chatReq *pb.ChatRequest) {
	// 1. Create the Event (business logic)
	event := buildChatEvent(client, chatReq)

	// 2. Store in History (business logic + state change)
	if shouldStoreChatInHistory(event) {
		r.addChat(chatInfoFromEvent(event))
	}

	// 3. Broadcast (I/O glue)
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ChatEvent{ChatEvent: event},
	}

	r.Broadcast(msg)
}

// HandleScreenShare processes a request to start or stop screen sharing.
func (r *Room) HandleScreenShare(_ context.Context, client types.ClientInterface, req *pb.ScreenShareRequest) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.toggleScreenshare(client, req.IsSharing)

	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ScreenShareChanged{
			ScreenShareChanged: &pb.ScreenShareEvent{
				UserId:    string(client.GetID()),
				IsSharing: req.IsSharing,
			},
		},
	}
	r.broadcastLocked(msg)
}

// HandleGetRecentChats sends recent chat history to the requesting client.
func (r *Room) HandleGetRecentChats(_ context.Context, client types.ClientInterface) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	internalChats := r.getRecentChatsLocked()

	var protoChats []*pb.ChatEvent
	for _, msg := range internalChats {
		protoChats = append(protoChats, &pb.ChatEvent{
			Id:         string(msg.ChatID),
			SenderId:   string(msg.ClientID),
			SenderName: string(msg.DisplayName),
			Content:    string(msg.ChatContent),
			Timestamp:  int64(msg.Timestamp),
		})
	}

	client.SendProto(&pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_RecentChats_{
			RecentChats_: &pb.RecentChatsEvent{
				Chats: protoChats,
			},
		},
	})
}

// HandleDeleteChat handles a request to delete a chat message.
// 3. Delete Chat Handler
func (r *Room) HandleDeleteChat(_ context.Context, client types.ClientInterface, req *pb.DeleteChatRequest) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Permission: Must be Host OR the Participant who sent it
	if !HasPermission(client.GetRole(), HasParticipantPermission()) {
		return
	}

	if req.ChatId == "" {
		return
	}

	// Delete from memory
	r.deleteChatLocked(types.ChatInfo{ChatID: types.ChatID(req.ChatId)})

	// Broadcast Deletion
	r.broadcastLocked(&pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_DeleteChatEvent{
			DeleteChatEvent: &pb.DeleteChatEvent{
				ChatId: req.ChatId,
			},
		},
	})
}

// HandleRequestScreenSharePermission handles a request to ask for screen share permission.
// 4. Request Screen Share Permission
func (r *Room) HandleRequestScreenSharePermission(_ context.Context, client types.ClientInterface) {
	// Notify all Hosts that "User X wants to share"
	msg := &pb.WebSocketMessage{
		Payload: &pb.WebSocketMessage_ScreenSharePermissionEvent{
			ScreenSharePermissionEvent: &pb.ScreenSharePermissionEvent{
				UserId:      string(client.GetID()),
				DisplayName: string(client.GetDisplayName()),
				IsGranted:   false, // False = "Requesting"
			},
		},
	}

	r.mu.RLock()
	defer r.mu.RUnlock()

	// Send only to Hosts
	for _, c := range r.clients {
		if c.GetRole() == types.RoleTypeHost {
			c.SendProto(msg)
		}
	}
}

// HandleAdminAction processes admin actions (kick, approve, mute, unmute).
func (r *Room) HandleAdminAction(ctx context.Context, client types.ClientInterface, adminReq *pb.AdminActionRequest) {
	// Permission check (business logic)
	if err := validateAdminPermission(client.GetRole()); err != nil {
		logging.Warn(ctx, "Unauthorized admin action attempt", zap.String("clientId", string(client.GetID())), zap.Error(err))
		return
	}

	targetID := types.ClientIDType(adminReq.TargetUserId)
	action := parseAdminAction(adminReq.Action)

	r.mu.Lock()
	defer r.mu.Unlock()

	// Find target (business logic)
	target, err := findTargetClient(r.clients, targetID)
	if err != nil && action != AdminActionKick {
		// Kick doesn't error on missing target - just no-op
		return
	}

	// Execute action (business logic + I/O glue)
	switch action {
	case AdminActionKick:
		if shouldKickClient(target) {
			target.SendProto(buildKickMessage()) // I/O
			target.Disconnect()                  // I/O - triggers readPump exit
		}

	case AdminActionApprove:
		if shouldApproveWaitingUser(target) {
			r.deleteWaitingLocked(target)                                  // State change
			r.addParticipantLocked(ctx, target)                            // State change
			target.SendProto(buildApprovalMessage(string(target.GetID()))) // I/O
			r.wg.Add(1)
			go func() {
				defer r.wg.Done()
				if err := r.CreateSFUSession(ctx, target); err != nil {
					logging.Error(ctx, "Failed to create SFU session", zap.String("room", string(r.GetID())), zap.String("userId", string(target.GetID())), zap.Error(err))
				}
			}()
			r.wg.Add(1)
			go func() {
				defer r.wg.Done()
				r.BroadcastRoomState(ctx)
			}()
		}

	case AdminActionMute:
		if shouldMuteClient(target) {
			r.toggleAudio(target, false) // State change
			r.wg.Add(1)
			go func() {
				defer r.wg.Done()
				r.BroadcastRoomState(ctx)
			}()
		}

	case AdminActionUnmute:
		if shouldMuteClient(target) {
			r.toggleAudio(target, true) // State change
			r.wg.Add(1)
			go func() {
				defer r.wg.Done()
				r.BroadcastRoomState(ctx)
			}()
		}

	case AdminActionTransferOwnership:
		// Target must be a participant or host
		if target != nil && (target.GetRole() == types.RoleTypeParticipant || target.GetRole() == types.RoleTypeHost) {
			logging.Info(ctx, "Transferring room ownership", zap.String("room", string(r.ID)), zap.String("oldOwner", string(r.ownerID)), zap.String("newOwner", string(target.GetID())))
			r.ownerID = target.GetID()

			// Ensure new owner is a host
			if target.GetRole() != types.RoleTypeHost {
				r.addHostLocked(ctx, target)
			}

			// Notify everyone about the change
			msg := buildTransferOwnershipMessage(string(target.GetID()))
			r.broadcastLocked(msg)

			// Broadcast state to sync roles
			r.broadcastRoomStateLocked(ctx)
		}
	}
}
