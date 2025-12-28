package session

import (
	"fmt"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
)

// Chat helper functions - pure business logic, fully testable

// buildChatEvent creates a ChatEvent from a ChatRequest and client info.
func buildChatEvent(client *Client, req *pb.ChatRequest) *pb.ChatEvent {
	return &pb.ChatEvent{
		Id:         fmt.Sprintf("%d", time.Now().UnixNano()),
		SenderId:   string(client.ID),
		SenderName: string(client.DisplayName),
		Content:    req.Content,
		Timestamp:  time.Now().UnixMilli(),
		IsPrivate:  req.TargetId != "",
	}
}

// shouldStoreChatInHistory determines if a chat event should be stored in the room's history.
func shouldStoreChatInHistory(event *pb.ChatEvent) bool {
	return !event.IsPrivate
}

// chatInfoFromEvent converts a pb.ChatEvent to the internal ChatInfo struct.
func chatInfoFromEvent(event *pb.ChatEvent) ChatInfo {
	return ChatInfo{
		ClientInfo: ClientInfo{
			ClientId:    ClientIdType(event.SenderId),
			DisplayName: DisplayNameType(event.SenderName),
		},
		ChatId:      ChatId(event.Id),
		Timestamp:   Timestamp(event.Timestamp),
		ChatContent: ChatContent(event.Content),
	}
}
