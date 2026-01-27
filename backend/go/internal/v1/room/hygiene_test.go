package room

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

// Fix Unbounded Rooms
func TestUnboundedRooms_Limit(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(ctx, "test-room", nil, mockBus, nil)
	r.ownerID = "user-0" // Ensure we have an owner so new clients aren't promoted

	// Add 100 participants (Allowed)
	for i := 0; i < 100; i++ {
		client := newMockClient(fmt.Sprintf("user-%d", i), "User", types.RoleTypeParticipant)
		r.AddParticipant(ctx, client)
	}

	assert.Equal(t, 100, len(r.clients))

	// Add 101st participant (Should be rejected/ignored or return error)
	// Currently AddParticipant doesn't return error, so we might need to change signature
	// or check if it was added. For now, let's assume we want to prevent addition.
	droppedClient := newMockClient("user-101", "User", types.RoleTypeParticipant)
	r.AddParticipant(ctx, droppedClient)

	// Assert: Count should still be 100
	assert.Equal(t, 100, len(r.clients), "Room should be capped at 100 participants")

	// Also check HandleClientConnect
	r.HandleClientConnect(droppedClient)
	// Should not be in clients or waiting
	assert.NotContains(t, r.clients, droppedClient.GetID())
}

// Fix Chat History Memory
func TestChatHistory_MemoryLimit(t *testing.T) {
	ctx := context.Background()
	mockBus := &MockBusService{}
	r := NewRoom(ctx, "test-room", nil, mockBus, nil)

	// Add a large-ish message
	largeContent := strings.Repeat("A", 1024) // 1KB

	// We want to test the 1MB limit.
	// Let's set a smaller limit for testing if possible, or just spam.
	// We can't easily change the constant in the test if it's hardcoded.
	// But we can check if we can modify the room struct if we add a field.
	// Let's assume we implement `maxChatHistoryBytes` in Room struct.

	r.maxChatHistoryLength = 1000 // Increase count limit to hit bytes limit first

	// Add 1500 messages of 1KB = 1.5MB
	// Should truncate to ~1MB (approx 1000 messages)
	for i := 0; i < 1500; i++ {
		r.AddChat(types.ChatInfo{
			ChatID:      types.ChatID(fmt.Sprintf("%d", i)),
			ChatContent: types.ChatContent(largeContent),
		})
	}

	// Calculate total size
	var totalSize int
	for e := r.chatHistory.Front(); e != nil; e = e.Next() {
		c := e.Value.(types.ChatInfo)
		totalSize += len(string(c.ChatContent))
	}

	// Assert total size is <= 1MB + buffer (one message size)
	// We'll set the expectation that it enforces ~1MB
	assert.LessOrEqual(t, totalSize, 1024*1024+2048, "Chat history should be capped at ~1MB")

	// And verify we don't have all 1500 messages
	assert.Less(t, r.chatHistory.Len(), 1500, "Should have pruned messages to fit size limit")
}
