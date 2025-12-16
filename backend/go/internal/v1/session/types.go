// Package session provides the core types and functionality for managing real-time video conferencing sessions.
// This package implements a WebSocket-based system for handling video calls, chat, screen sharing,
// and participant management with role-based permissions.
//
// The main components include:
//   - Room: Manages the state of a video conference session
//   - Client: Represents a connected user with WebSocket communication
//   - Hub: Manages multiple rooms and handles WebSocket upgrades
//   - Event handlers: Process different types of user actions
//   - Permission system: Controls access to different features based on user roles
//
// Roles supported:
//   - Host: Full control over the room, can accept/deny participants and manage settings
//   - Participant: Can participate in video calls, chat, and raise hands
//   - Screenshare: Special role for users currently sharing their screen
//   - Waiting: Users waiting for admission to the room
package session

import "errors"

// RoleType defines the different roles a client can have in a video conference session.
// Each role has different permissions and capabilities within the room.
type RoleType string

// ClientIdType represents a unique identifier for a client connection.
// This is typically derived from the JWT token's subject field.
type ClientIdType string

// RoomIdType represents a unique identifier for a video conference room.
// Rooms are created dynamically when the first client connects.
type RoomIdType string

// ChatId represents a unique identifier for a chat message within a room.
type ChatId string

// ChatIndex represents the chronological position of a chat message.
// This is used for ordering and referencing messages.
type ChatIndex int

// ChatContent represents the actual text content of a chat message.
// Content is validated to ensure it meets length and content requirements.
type ChatContent string

// ToggleAudioPayload contains information about a client's audio state.
type ToggleAudioPayload struct {
	ClientInfo
	Enabled bool `json:"enabled"` // true if audio is unmuted, false if muted
}

// ToggleVideoPayload contains information about a client's video state.
type ToggleVideoPayload struct {
	ClientInfo
	Enabled bool `json:"enabled"` // true if camera is on, false if off
}

// ToggleScreensharePayload contains information about a client's screen share state.
type ToggleScreensharePayload struct {
	ClientInfo
	Enabled bool `json:"enabled"` // true if screen sharing is active, false if stopped
}

// DisplayNameType represents the human-readable name for a client.
// This is typically extracted from the JWT token or user profile.
type DisplayNameType string

// Event represents the type of WebSocket message being sent or received.
// Events determine which handler function processes the message.
type Event string

// Timestamp represents a Unix timestamp for when an event occurred.
type Timestamp int64

// ClientInfo contains the basic identifying information for a client.
// This struct is embedded in many other payload types to identify the actor.
type ClientInfo struct {
	ClientId    ClientIdType    `json:"clientId"`    // Unique identifier for the client
	DisplayName DisplayNameType `json:"displayName"` // Human-readable name for display in UI
}

// Role type constants define the hierarchy and permissions within a video conference room.
// The permission system is designed with escalating privileges:
// waiting < participant < screenshare < host
const (
	RoleTypeWaiting     RoleType = "waiting"     // Users waiting for admission to the room
	RoleTypeParticipant RoleType = "participant" // Active participants in the video call
	RoleTypeScreenshare RoleType = "screenshare" // Participants currently sharing their screen
	RoleTypeHost        RoleType = "host"        // Room administrators with full control
)

// Event type constants define all possible WebSocket message types that can be sent or received.
// These events drive the entire real-time communication system.
const (
	// Chat-related events
	EventAddChat        Event = "add_chat"     // Send a new chat message to the room
	EventDeleteChat     Event = "delete_chat"  // Remove a chat message from the room
	EventGetRecentChats Event = "recents_chat" // Request recent chat history

	// Hand raising events for participant management
	EventRaiseHand Event = "raise_hand" // Participant requests to speak
	EventLowerHand Event = "lower_hand" // Participant stops requesting to speak

	// Waiting room management events
	EventRequestWaiting Event = "waiting_request" // Client requests to join the room
	EventAcceptWaiting  Event = "accept_waiting"  // Host admits a waiting client
	EventDenyWaiting    Event = "deny_waiting"    // Host denies a waiting client

	// Connection lifecycle events
	EventConnect    Event = "connect"    // Client establishes connection to room
	EventDisconnect Event = "disconnect" // Client leaves the room
	EventPing       Event = "ping"       // Heartbeat to keep connection alive
	EventRoomState  Event = "room_state" // Full room state broadcast to clients

	// Screen sharing events
	EventRequestScreenshare Event = "request_screenshare" // Request permission to share screen
	EventAcceptScreenshare  Event = "accept_screenshare"  // Host grants screen sharing permission
	EventDenyScreenshare    Event = "deny_screenshare"    // Host denies screen sharing permission

	// Media control events
	EventToggleAudio       Event = "toggle_audio"       // Toggle microphone on/off
	EventToggleVideo       Event = "toggle_video"       // Toggle camera on/off
	EventToggleScreenshare Event = "toggle_screenshare" // Toggle screen sharing on/off

	// WebRTC signaling events for peer-to-peer connection establishment
	EventOffer       Event = "offer"       // WebRTC offer for establishing peer connection
	EventAnswer      Event = "answer"      // WebRTC answer responding to an offer
	EventCandidate   Event = "candidate"   // ICE candidate for connectivity establishment
	EventRenegotiate Event = "renegotiate" // Request to renegotiate connection (for adding/removing streams)
)

// Message is the top-level structure for all WebSocket communication.
// Every message sent or received follows this format, with the Event determining
// how the Payload should be interpreted and handled.
type Message struct {
	Event   Event `json:"event"`   // The type of message being sent
	Payload any   `json:"payload"` // The data associated with this event
}

// --- Payload Type Aliases ---
// These type aliases provide semantic meaning to ClientInfo when used in different contexts.
// Each represents the payload structure for the corresponding event type.

// Hand raising payloads
type RaiseHandPayload = ClientInfo // Payload for requesting to speak
type LowerHandPayload = ClientInfo // Payload for stopping request to speak

// Waiting room management payloads
type AcceptWaitingPayload = ClientInfo  // Payload for admitting a waiting client
type DenyWaitingPayload = ClientInfo    // Payload for denying a waiting client
type RequestWaitingPayload = ClientInfo // Payload for requesting room admission

// Connection lifecycle payloads
type ParticipantJoinedPayload = ClientInfo // Broadcast when someone joins
type ParticipantLeftPayload = ClientInfo   // Broadcast when someone leaves
type ClientDisconnectPayload = ClientInfo  // Broadcast when someone disconnects

// Screen sharing payloads
type RequestScreensharePayload = ClientInfo // Payload for requesting screen share permission
type AcceptScreensharePayload = ClientInfo  // Payload for granting screen share permission
type DenyScreensharePayload = ClientInfo    // Payload for denying screen share permission

// RoomStatePayload contains a comprehensive snapshot of the current room state.
// This is typically sent to clients when they join or when significant changes occur.
type RoomStatePayload struct {
	ClientInfo                 // Information about the requesting client
	RoomID        RoomIdType   `json:"roomId"`                  // Unique identifier for this room
	Hosts         []ClientInfo `json:"hosts"`                   // All clients with host privileges
	Participants  []ClientInfo `json:"participants"`            // All active participants in the call
	HandsRaised   []ClientInfo `json:"handsRaised"`             // Participants currently requesting to speak
	WaitingUsers  []ClientInfo `json:"waitingUsers"`            // Clients waiting for admission
	SharingScreen []ClientInfo `json:"sharingScreen,omitempty"` // Clients currently sharing screen
	Unmuted       []ClientInfo `json:"unmuted,omitempty"`       // Participants with audio enabled
	CameraOn      []ClientInfo `json:"cameraOn,omitempty"`      // Participants with video enabled
}

// ChatInfo represents a complete chat message with all associated metadata.
// This structure is used for storing, transmitting, and validating chat messages.
type ChatInfo struct {
	ClientInfo              // Who sent the message
	ChatId      ChatId      `json:"chatId"`      // Unique identifier for this message
	Timestamp   Timestamp   `json:"timestamp"`   // When the message was sent
	ChatContent ChatContent `json:"chatContent"` // The actual message content
}

// Validate performs comprehensive validation on a ChatInfo payload.
// This method ensures that chat messages meet all requirements before being
// processed and stored in the room's chat history.
//
// Validation rules:
//   - Chat content cannot be empty
//   - Chat content cannot exceed 1000 characters
//   - Client ID must be present and non-empty
//   - Display name must be present and non-empty
//
// Returns an error if any validation rule is violated.
func (c ChatInfo) ValidateChat() error {
	if len(string(c.ChatContent)) == 0 {
		return errors.New("chat content cannot be empty")
	}
	if len(string(c.ChatContent)) > 1000 {
		return errors.New("chat content cannot exceed 1000 characters")
	}
	if string(c.ClientId) == "" {
		return errors.New("client ID cannot be empty")
	}
	if string(c.DisplayName) == "" {
		return errors.New("display name cannot be empty")
	}
	return nil
}

// Chat-related payload type aliases
// These provide semantic meaning when ChatInfo is used in different contexts.
type AddChatPayload = ChatInfo        // Payload for adding a new chat message
type DeleteChatPayload = ChatInfo     // Payload for deleting an existing message
type GetRecentChatsPayload = ChatInfo // Payload for requesting recent chat history

// --- WebRTC Signaling Payloads ---

// WebRTCOfferPayload contains the SDP offer for establishing a peer-to-peer connection.
// This is sent by the initiating peer to start the WebRTC negotiation process.
type WebRTCOfferPayload struct {
	ClientInfo                  // Information about the client sending the offer
	TargetClientId ClientIdType `json:"targetClientId"` // ID of the client to establish connection with
	SDP            string       `json:"sdp"`            // Session Description Protocol offer
	Type           string       `json:"type"`           // Always "offer" for offer payloads
}

// WebRTCAnswerPayload contains the SDP answer responding to a WebRTC offer.
// This is sent by the receiving peer to complete the initial connection handshake.
type WebRTCAnswerPayload struct {
	ClientInfo                  // Information about the client sending the answer
	TargetClientId ClientIdType `json:"targetClientId"` // ID of the client who sent the original offer
	SDP            string       `json:"sdp"`            // Session Description Protocol answer
	Type           string       `json:"type"`           // Always "answer" for answer payloads
}

// WebRTCCandidatePayload contains ICE candidate information for connectivity.
// These are exchanged throughout the connection process to find the best path
// for peer-to-peer communication (handling NAT traversal, firewalls, etc.).
type WebRTCCandidatePayload struct {
	ClientInfo                  // Information about the client sending the candidate
	TargetClientId ClientIdType `json:"targetClientId"` // ID of the client to send candidate to
	Candidate      string       `json:"candidate"`      // ICE candidate string
	SDPMid         *string      `json:"sdpMid"`         // Media stream identification
	SDPMLineIndex  *int         `json:"sdpMLineIndex"`  // Media line index in SDP
}

// WebRTCRenegotiatePayload signals the need to renegotiate the peer connection.
// This is used when streams are added/removed (e.g., turning camera on/off, screen sharing).
type WebRTCRenegotiatePayload struct {
	ClientInfo                  // Information about the client requesting renegotiation
	TargetClientId ClientIdType `json:"targetClientId"` // ID of the client to renegotiate with
	Reason         string       `json:"reason"`         // Reason for renegotiation (optional, for debugging)
}
