/// WebSocketMessage is the top-level envelope for all messages exchanged
/// between the Client (Frontend) and the Signaling Server (Go Backend) over WebSocket.
/// It uses a `oneof` field to handle different types of events efficiently.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct WebSocketMessage {
    #[prost(
        oneof = "web_socket_message::Payload",
        tags = "1, 2, 3, 4, 5, 6, 7, 20, 21, 8, 9, 22, 23, 24, 25, 10, 11, 12, 13, 14, 15, 16, 17, 18, 26, 27"
    )]
    pub payload: ::core::option::Option<web_socket_message::Payload>,
}
/// Nested message and enum types in `WebSocketMessage`.
pub mod web_socket_message {
    #[allow(clippy::derive_partial_eq_without_eq)]
    #[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Payload {
        /// --- Connection & Auth ---
        /// Request to join a room. Sent by Client immediately after connection.
        #[prost(message, tag = "1")]
        Join(super::JoinRequest),
        /// Response to a join request. Sent by Server.
        #[prost(message, tag = "2")]
        JoinResponse(super::JoinResponse),
        /// Request to reconnect to an existing session (handling temporary disconnects).
        #[prost(message, tag = "3")]
        Reconnect(super::ReconnectRequest),
        /// --- Media Controls (Self) ---
        /// Request to toggle local audio/video mute state.
        #[prost(message, tag = "4")]
        ToggleMedia(super::ToggleMediaRequest),
        /// Broadcast event indicating a participant's media state has changed.
        #[prost(message, tag = "5")]
        MediaStateChanged(super::MediaStateEvent),
        /// --- Screen Share ---
        /// Request to start/stop screen sharing.
        #[prost(message, tag = "6")]
        ScreenShare(super::ScreenShareRequest),
        /// Broadcast event indicating a participant is sharing their screen.
        #[prost(message, tag = "7")]
        ScreenShareChanged(super::ScreenShareEvent),
        /// Permission Flow (for moderated rooms or guests)
        /// Request permission to share screen.
        #[prost(message, tag = "20")]
        RequestScreenSharePermission(super::RequestScreenSharePermission),
        /// Response to a permission request.
        #[prost(message, tag = "21")]
        ScreenSharePermissionEvent(super::ScreenSharePermissionEvent),
        /// --- Chat ---
        /// Send a chat message.
        #[prost(message, tag = "8")]
        Chat(super::ChatRequest),
        /// Broadcast event for a new chat message.
        #[prost(message, tag = "9")]
        ChatEvent(super::ChatEvent),
        /// Chat History & Deletion
        /// Request recent chat history (e.g., on join).
        #[prost(message, tag = "22")]
        GetRecentChats(super::GetRecentChatsRequest),
        /// Response containing list of recent chats.
        #[prost(message, tag = "23")]
        RecentChats(super::RecentChatsEvent),
        /// Request to delete a specific chat message (e.g., by admin or author).
        #[prost(message, tag = "24")]
        DeleteChat(super::DeleteChatRequest),
        /// Broadcast event indicating a chat message was deleted.
        #[prost(message, tag = "25")]
        DeleteChatEvent(super::DeleteChatEvent),
        /// --- Hand Raising ---
        /// Request to raise/lower hand.
        #[prost(message, tag = "10")]
        ToggleHand(super::ToggleHandRequest),
        /// Broadcast event indicating a participant's hand state changed.
        #[prost(message, tag = "11")]
        HandUpdate(super::HandUpdateEvent),
        /// --- Waiting Room (Host Only) ---
        /// Event notifying host of a user in the waiting room.
        #[prost(message, tag = "12")]
        WaitingRoomNotification(super::WaitingRoomEvent),
        /// Host action to approve/reject a user.
        #[prost(message, tag = "13")]
        AdminAction(super::AdminActionRequest),
        /// Event notifying a user of an admin decision (e.g., "You have been kicked").
        #[prost(message, tag = "14")]
        AdminEvent(super::AdminActionEvent),
        /// --- WebRTC Signaling ---
        /// Encapsulates SDP and ICE messages to/from the SFU.
        #[prost(message, tag = "15")]
        Signal(super::SignalRequest),
        #[prost(message, tag = "16")]
        SignalEvent(super::SignalEvent),
        /// --- State Sync ---
        /// Full snapshot of the room state (participants, waiting users).
        #[prost(message, tag = "17")]
        RoomState(super::RoomStateEvent),
        /// Error notification.
        #[prost(message, tag = "18")]
        Error(super::ErrorEvent),
        /// --- Stream Mapping ---
        /// Notification that a remote track is available for subscription.
        /// Notification that a remote track is available for subscription.
        #[prost(message, tag = "26")]
        TrackAdded(super::TrackAddedEvent),
        /// Real-time caption event.
        #[prost(message, tag = "27")]
        Caption(super::CaptionEvent),
    }
}
/// JoinRequest is sent by the client to authenticate and join a specific room.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct JoinRequest {
    /// JWT token for authentication (optional if room is public)
    #[prost(string, tag = "1")]
    pub token: ::prost::alloc::string::String,
    /// The ID of the room to join
    #[prost(string, tag = "2")]
    pub room_id: ::prost::alloc::string::String,
    /// The name the user wishes to display
    #[prost(string, tag = "3")]
    pub display_name: ::prost::alloc::string::String,
}
/// JoinResponse acknowledges the JoinRequest.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct JoinResponse {
    #[prost(bool, tag = "1")]
    pub success: bool,
    /// The unique ID assigned to this session
    #[prost(string, tag = "2")]
    pub user_id: ::prost::alloc::string::String,
    /// The current state of the room (participants, etc.)
    #[prost(message, optional, tag = "3")]
    pub initial_state: ::core::option::Option<RoomStateEvent>,
    /// Whether the user has host privileges
    #[prost(bool, tag = "4")]
    pub is_host: bool,
}
/// ReconnectRequest attempts to resume a previous session.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ReconnectRequest {
    #[prost(string, tag = "1")]
    pub token: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub previous_session_id: ::prost::alloc::string::String,
}
/// ToggleMediaRequest signals a user's intent to mute/unmute audio or video.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ToggleMediaRequest {
    /// "audio" or "video"
    #[prost(string, tag = "1")]
    pub kind: ::prost::alloc::string::String,
    /// true = unmuted, false = muted
    #[prost(bool, tag = "2")]
    pub is_enabled: bool,
}
/// MediaStateEvent broadcasts a change in a user's media state to the room.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct MediaStateEvent {
    #[prost(string, tag = "1")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(bool, tag = "2")]
    pub is_audio_enabled: bool,
    #[prost(bool, tag = "3")]
    pub is_video_enabled: bool,
}
/// ToggleHandRequest signals a user's intent to raise/lower their virtual hand.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ToggleHandRequest {
    #[prost(bool, tag = "1")]
    pub is_raised: bool,
}
/// HandUpdateEvent broadcasts a change in a user's hand state.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct HandUpdateEvent {
    #[prost(string, tag = "1")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(bool, tag = "2")]
    pub is_raised: bool,
}
/// ScreenShareRequest signals intent to start/stop screen sharing.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ScreenShareRequest {
    #[prost(bool, tag = "1")]
    pub is_sharing: bool,
}
/// ScreenShareEvent broadcasts a change in screen sharing status.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ScreenShareEvent {
    #[prost(string, tag = "1")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(bool, tag = "2")]
    pub is_sharing: bool,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RequestScreenSharePermission {}
/// ScreenSharePermissionEvent notifies a user if their request was granted/denied.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ScreenSharePermissionEvent {
    #[prost(string, tag = "1")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub display_name: ::prost::alloc::string::String,
    #[prost(bool, tag = "3")]
    pub is_granted: bool,
}
/// ChatRequest sends a text message to the room or a specific user.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ChatRequest {
    #[prost(string, tag = "1")]
    pub content: ::prost::alloc::string::String,
    /// Optional: If set, sends a private message
    #[prost(string, tag = "2")]
    pub target_id: ::prost::alloc::string::String,
}
/// ChatEvent delivers a chat message to clients.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ChatEvent {
    #[prost(string, tag = "1")]
    pub id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub sender_id: ::prost::alloc::string::String,
    #[prost(string, tag = "3")]
    pub sender_name: ::prost::alloc::string::String,
    #[prost(string, tag = "4")]
    pub content: ::prost::alloc::string::String,
    /// Unix timestamp
    #[prost(int64, tag = "5")]
    pub timestamp: i64,
    #[prost(bool, tag = "6")]
    pub is_private: bool,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct GetRecentChatsRequest {}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RecentChatsEvent {
    #[prost(message, repeated, tag = "1")]
    pub chats: ::prost::alloc::vec::Vec<ChatEvent>,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteChatRequest {
    #[prost(string, tag = "1")]
    pub chat_id: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct DeleteChatEvent {
    #[prost(string, tag = "1")]
    pub chat_id: ::prost::alloc::string::String,
}
/// WaitingRoomEvent notifies a Host that a user is waiting to join.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct WaitingRoomEvent {
    #[prost(string, tag = "1")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub display_name: ::prost::alloc::string::String,
    #[prost(string, tag = "3")]
    pub status: ::prost::alloc::string::String,
}
/// AdminActionRequest is sent by a Host to manage users/room.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AdminActionRequest {
    #[prost(string, tag = "1")]
    pub target_user_id: ::prost::alloc::string::String,
    /// Actions: "approve", "reject", "kick", "mute", "unmute", "mute_all", "approve_screenshare", "reject_screenshare"
    #[prost(string, tag = "2")]
    pub action: ::prost::alloc::string::String,
}
/// AdminActionEvent notifies a target user of an admin decision.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AdminActionEvent {
    #[prost(string, tag = "1")]
    pub action: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub reason: ::prost::alloc::string::String,
}
/// SignalRequest encapsulates WebRTC signaling messages from Client -> Backend.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SignalRequest {
    #[prost(oneof = "signal_request::Signal", tags = "1, 2, 3, 4")]
    pub signal: ::core::option::Option<signal_request::Signal>,
}
/// Nested message and enum types in `SignalRequest`.
pub mod signal_request {
    #[allow(clippy::derive_partial_eq_without_eq)]
    #[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Signal {
        #[prost(string, tag = "1")]
        SdpAnswer(::prost::alloc::string::String),
        #[prost(string, tag = "2")]
        IceCandidate(::prost::alloc::string::String),
        #[prost(bool, tag = "3")]
        Renegotiate(bool),
        #[prost(string, tag = "4")]
        SdpOffer(::prost::alloc::string::String),
    }
}
/// SignalEvent encapsulates WebRTC signaling messages from Backend -> Client.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct SignalEvent {
    #[prost(oneof = "signal_event::Signal", tags = "1, 2, 3")]
    pub signal: ::core::option::Option<signal_event::Signal>,
}
/// Nested message and enum types in `SignalEvent`.
pub mod signal_event {
    #[allow(clippy::derive_partial_eq_without_eq)]
    #[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Signal {
        #[prost(string, tag = "1")]
        SdpOffer(::prost::alloc::string::String),
        #[prost(string, tag = "2")]
        IceCandidate(::prost::alloc::string::String),
        #[prost(string, tag = "3")]
        SdpAnswer(::prost::alloc::string::String),
    }
}
/// RoomStateEvent provides a full snapshot of the room's participants.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RoomStateEvent {
    #[prost(message, repeated, tag = "1")]
    pub participants: ::prost::alloc::vec::Vec<ParticipantInfo>,
    #[prost(message, repeated, tag = "2")]
    pub waiting_users: ::prost::alloc::vec::Vec<ParticipantInfo>,
}
/// ParticipantInfo describes a single user in the room.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ParticipantInfo {
    #[prost(string, tag = "1")]
    pub id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub display_name: ::prost::alloc::string::String,
    #[prost(bool, tag = "3")]
    pub is_host: bool,
    #[prost(bool, tag = "4")]
    pub is_audio_enabled: bool,
    #[prost(bool, tag = "5")]
    pub is_video_enabled: bool,
    #[prost(bool, tag = "6")]
    pub is_screen_sharing: bool,
    #[prost(bool, tag = "7")]
    pub is_hand_raised: bool,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ErrorEvent {
    #[prost(string, tag = "1")]
    pub code: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub message: ::prost::alloc::string::String,
    #[prost(bool, tag = "3")]
    pub fatal: bool,
}
/// TrackAddedEvent informs clients that a new media track is available.
/// Clients typically use this to decide whether to subscribe.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct TrackAddedEvent {
    /// The user who owns the track
    #[prost(string, tag = "1")]
    pub user_id: ::prost::alloc::string::String,
    /// The WebRTC stream ID
    #[prost(string, tag = "2")]
    pub stream_id: ::prost::alloc::string::String,
    /// "video" or "audio"
    #[prost(string, tag = "3")]
    pub track_kind: ::prost::alloc::string::String,
}
/// CaptionEvent delivers real-time captions to clients.
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CaptionEvent {
    #[prost(string, tag = "1")]
    pub session_id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub text: ::prost::alloc::string::String,
    #[prost(bool, tag = "3")]
    pub is_final: bool,
    #[prost(double, tag = "4")]
    pub confidence: f64,
}
