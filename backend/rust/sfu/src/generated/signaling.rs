/// The Master Envelope
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct WebSocketMessage {
    #[prost(
        oneof = "web_socket_message::Payload",
        tags = "1, 2, 3, 4, 5, 6, 7, 20, 21, 8, 9, 22, 23, 24, 25, 10, 11, 12, 13, 14, 15, 16, 17, 18, 26"
    )]
    pub payload: ::core::option::Option<web_socket_message::Payload>,
}
/// Nested message and enum types in `WebSocketMessage`.
pub mod web_socket_message {
    #[allow(clippy::derive_partial_eq_without_eq)]
    #[derive(Clone, PartialEq, ::prost::Oneof)]
    pub enum Payload {
        /// --- Connection & Auth ---
        #[prost(message, tag = "1")]
        Join(super::JoinRequest),
        #[prost(message, tag = "2")]
        JoinResponse(super::JoinResponse),
        #[prost(message, tag = "3")]
        Reconnect(super::ReconnectRequest),
        /// --- Media Controls (Self) ---
        #[prost(message, tag = "4")]
        ToggleMedia(super::ToggleMediaRequest),
        #[prost(message, tag = "5")]
        MediaStateChanged(super::MediaStateEvent),
        /// --- Screen Share ---
        #[prost(message, tag = "6")]
        ScreenShare(super::ScreenShareRequest),
        #[prost(message, tag = "7")]
        ScreenShareChanged(super::ScreenShareEvent),
        /// Permission Flow
        #[prost(message, tag = "20")]
        RequestScreenSharePermission(super::RequestScreenSharePermission),
        #[prost(message, tag = "21")]
        ScreenSharePermissionEvent(super::ScreenSharePermissionEvent),
        /// --- Chat ---
        #[prost(message, tag = "8")]
        Chat(super::ChatRequest),
        #[prost(message, tag = "9")]
        ChatEvent(super::ChatEvent),
        /// Chat History & Deletion
        #[prost(message, tag = "22")]
        GetRecentChats(super::GetRecentChatsRequest),
        #[prost(message, tag = "23")]
        RecentChats(super::RecentChatsEvent),
        #[prost(message, tag = "24")]
        DeleteChat(super::DeleteChatRequest),
        #[prost(message, tag = "25")]
        DeleteChatEvent(super::DeleteChatEvent),
        /// --- Hand Raising ---
        #[prost(message, tag = "10")]
        ToggleHand(super::ToggleHandRequest),
        #[prost(message, tag = "11")]
        HandUpdate(super::HandUpdateEvent),
        /// --- Waiting Room (Host Only) ---
        #[prost(message, tag = "12")]
        WaitingRoomNotification(super::WaitingRoomEvent),
        #[prost(message, tag = "13")]
        AdminAction(super::AdminActionRequest),
        #[prost(message, tag = "14")]
        AdminEvent(super::AdminActionEvent),
        /// --- WebRTC Signaling ---
        #[prost(message, tag = "15")]
        Signal(super::SignalRequest),
        #[prost(message, tag = "16")]
        SignalEvent(super::SignalEvent),
        /// --- State Sync ---
        #[prost(message, tag = "17")]
        RoomState(super::RoomStateEvent),
        #[prost(message, tag = "18")]
        Error(super::ErrorEvent),
        /// --- Stream Mapping ---
        #[prost(message, tag = "26")]
        TrackAdded(super::TrackAddedEvent),
    }
}
/// ---------------------------------------------------------
/// 1. Auth & Connection
/// ---------------------------------------------------------
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct JoinRequest {
    #[prost(string, tag = "1")]
    pub token: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub room_id: ::prost::alloc::string::String,
    #[prost(string, tag = "3")]
    pub display_name: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct JoinResponse {
    #[prost(bool, tag = "1")]
    pub success: bool,
    #[prost(string, tag = "2")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(message, optional, tag = "3")]
    pub initial_state: ::core::option::Option<RoomStateEvent>,
    #[prost(bool, tag = "4")]
    pub is_host: bool,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ReconnectRequest {
    #[prost(string, tag = "1")]
    pub token: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub previous_session_id: ::prost::alloc::string::String,
}
/// ---------------------------------------------------------
/// 2. Media State (Mute/Video/Hand)
/// ---------------------------------------------------------
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ToggleMediaRequest {
    /// "audio" or "video"
    #[prost(string, tag = "1")]
    pub kind: ::prost::alloc::string::String,
    #[prost(bool, tag = "2")]
    pub is_enabled: bool,
}
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
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ToggleHandRequest {
    #[prost(bool, tag = "1")]
    pub is_raised: bool,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct HandUpdateEvent {
    #[prost(string, tag = "1")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(bool, tag = "2")]
    pub is_raised: bool,
}
/// ---------------------------------------------------------
/// 3. Screen Share
/// ---------------------------------------------------------
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ScreenShareRequest {
    #[prost(bool, tag = "1")]
    pub is_sharing: bool,
}
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
/// ---------------------------------------------------------
/// 4. Chat
/// ---------------------------------------------------------
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct ChatRequest {
    #[prost(string, tag = "1")]
    pub content: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub target_id: ::prost::alloc::string::String,
}
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
/// ---------------------------------------------------------
/// 5. Admin / Waiting Room
/// ---------------------------------------------------------
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
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AdminActionRequest {
    #[prost(string, tag = "1")]
    pub target_user_id: ::prost::alloc::string::String,
    /// Actions: "approve", "reject", "kick", "mute", "unmute", "mute_all", "approve_screenshare", "reject_screenshare"
    #[prost(string, tag = "2")]
    pub action: ::prost::alloc::string::String,
}
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct AdminActionEvent {
    #[prost(string, tag = "1")]
    pub action: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub reason: ::prost::alloc::string::String,
}
/// ---------------------------------------------------------
/// 6. WebRTC Tunnel (Forwarded to Rust)
/// ---------------------------------------------------------
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
/// ---------------------------------------------------------
/// 7. Global State
/// ---------------------------------------------------------
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct RoomStateEvent {
    #[prost(message, repeated, tag = "1")]
    pub participants: ::prost::alloc::vec::Vec<ParticipantInfo>,
    #[prost(message, repeated, tag = "2")]
    pub waiting_users: ::prost::alloc::vec::Vec<ParticipantInfo>,
}
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
/// ---------------------------------------------------------
/// 8. Stream Mapping
/// ---------------------------------------------------------
#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct TrackAddedEvent {
    #[prost(string, tag = "1")]
    pub user_id: ::prost::alloc::string::String,
    #[prost(string, tag = "2")]
    pub stream_id: ::prost::alloc::string::String,
    /// "video" or "audio"
    #[prost(string, tag = "3")]
    pub track_kind: ::prost::alloc::string::String,
}
