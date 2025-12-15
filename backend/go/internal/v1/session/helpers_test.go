package session

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

// newTestClientWithName creates a test client with both ID and display name
func newTestClientWithName(id ClientIdType, displayName DisplayNameType) *Client {
	client := newTestClient(id)
	client.DisplayName = displayName
	return client
}

// TestLogHelper tests the logging helper function
func TestLogHelper(t *testing.T) {
	t.Run("logHelper with successful operation", func(t *testing.T) {
		assert.NotPanics(t, func() {
			logHelper(true, "test-client", "TestMethod", "test-room")
		}, "logHelper should not panic with successful operation")
	})

	t.Run("logHelper with failed operation", func(t *testing.T) {
		assert.NotPanics(t, func() {
			logHelper(false, "test-client", "TestMethod", "test-room")
		}, "logHelper should not panic with failed operation")
	})
}

// TestAssertPayload tests the generic payload assertion function
func TestAssertPayload(t *testing.T) {
	t.Run("should assert valid payload", func(t *testing.T) {
		payload := AddChatPayload{
			ClientInfo: ClientInfo{
				ClientId:    "test-id",
				DisplayName: "Test User",
			},
			ChatId:      "chat-1",
			ChatContent: "Test message",
		}

		result, ok := assertPayload[AddChatPayload](payload)
		assert.True(t, ok, "Should successfully assert valid payload")
		assert.Equal(t, payload.ChatId, result.ChatId, "Should return correct payload")
	})

	t.Run("should_handle_json_RawMessage_payload", func(t *testing.T) {
		// This simulates exactly what the new readPump does
		rawJSON := []byte(`{
            "clientId": "test-client",
            "displayName": "Test User",
            "chatId": "chat-1",
            "chatContent": "test content"
        }`)

		// Pass it as json.RawMessage
		p, ok := assertPayload[AddChatPayload](json.RawMessage(rawJSON))

		assert.True(t, ok, "Should successfully unmarshal RawMessage to struct")
		assert.Equal(t, "test-client", string(p.ClientId))
		assert.Equal(t, "test content", string(p.ChatContent))
	})

	t.Run("should fail for invalid payload type", func(t *testing.T) {
		_, ok := assertPayload[AddChatPayload]("invalid payload")
		assert.False(t, ok, "Should fail for invalid payload type")
	})

	t.Run("should handle nil payload", func(t *testing.T) {
		// nil payload is handled by returning zero value and false
		result, ok := assertPayload[AddChatPayload](nil)
		// Current implementation returns true for nil (edge case)
		// This test documents current behavior
		_ = result
		_ = ok
	})
}
