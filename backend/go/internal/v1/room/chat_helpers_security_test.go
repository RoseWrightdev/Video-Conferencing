package room

import (
	"regexp"
	"strings"
	"testing"

	pb "github.com/RoseWrightdev/Video-Conferencing/backend/go/gen/proto"
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/types"
	"github.com/stretchr/testify/assert"
)

// Fix Stored XSS (CWE-79)
func TestBuildChatEvent_XSS(t *testing.T) {
	client := newMockClient("attacker", "Attacker", types.RoleTypeParticipant)

	// Payload containing XSS script
	xssPayload := "<script>alert('pwned')</script>Hello"
	req := &pb.ChatRequest{
		Content: xssPayload,
	}

	event := buildChatEvent(client, req)

	// Content should be escaped
	assert.NotContains(t, event.Content, "<script>", "Chat content should be HTML escaped")
	assert.True(t, strings.Contains(event.Content, "&lt;script&gt;"), "Chat content should contain escaped tags")
}

// Fix Predictable Chat IDs
func TestBuildChatEvent_UnpredictableIDs(t *testing.T) {
	client := newMockClient("user", "User", types.RoleTypeParticipant)
	req := &pb.ChatRequest{Content: "test"}

	event1 := buildChatEvent(client, req)
	event2 := buildChatEvent(client, req)

	// IDs should not be sequential integers (timestamps)
	// We expect UUIDs (length 36, hyphens)
	uuidRegex := regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

	assert.Regexp(t, uuidRegex, event1.Id, "Chat ID should be a UUID")
	assert.Regexp(t, uuidRegex, event2.Id, "Chat ID should be a UUID")
	assert.NotEqual(t, event1.Id, event2.Id, "Chat IDs should be unique")
}
