package room

import (
	"fmt"
	"time"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
)

// buildChatEvent creates a ChatEvent from a ChatRequest and client info.
func buildChatEvent(client types.ClientInterface, req *pb.ChatRequest) *pb.ChatEvent {
	return &pb.ChatEvent{
		Id:         fmt.Sprintf("%d", time.Now().UnixNano()),
		SenderId:   string(client.GetID()),
		SenderName: string(client.GetDisplayName()),
		Content:    req.Content,
		Timestamp:  time.Now().UnixMilli(),
		IsPrivate:  req.TargetId != "",
	}
}

// shouldStoreChatInHistory determines if a chat event should be stored in the room's history.
func shouldStoreChatInHistory(event *pb.ChatEvent) bool {
	return !event.IsPrivate
}

// chatInfoFromEvent converts a pb.ChatEvent to the internal types.ChatInfo struct.
func chatInfoFromEvent(event *pb.ChatEvent) types.ChatInfo {
	return types.ChatInfo{
		ClientInfo: types.ClientInfo{
			ClientId:    types.ClientIdType(event.SenderId),
			DisplayName: types.DisplayNameType(event.SenderName),
		},
		ChatId:      types.ChatId(event.Id),
		Timestamp:   types.Timestamp(event.Timestamp),
		ChatContent: types.ChatContent(event.Content),
	}
}
