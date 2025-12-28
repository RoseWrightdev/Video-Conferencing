use std::sync::Arc;
use tokio::sync::Mutex;
use dashmap::DashMap;
use tokio::sync::mpsc;
use tonic::Status;
use webrtc::peer_connection::RTCPeerConnection;
use crate::pb::sfu::SfuEvent;

// Peer wraps the WebRTC Connection
pub struct Peer {
    pub pc: Arc<RTCPeerConnection>,
    pub user_id: String,
    pub room_id: String,
    // Channel to send events (TrackAdded, Renegotiation) to Go -> Frontend
    pub event_tx: Arc<Mutex<Option<mpsc::Sender<Result<SfuEvent, Status>>>>>,
    // Map from StreamID (in this peer's PC) to Source UserID
    pub track_mapping: Arc<DashMap<String, String>>,
    // Ensure only one negotiation happens at a time per peer
    pub signaling_lock: Arc<Mutex<()>>,
}

impl Peer {
    pub fn new(
        pc: Arc<RTCPeerConnection>,
        user_id: String,
        room_id: String,
    ) -> Self {
        Self {
            pc,
            user_id,
            room_id,
            event_tx: Arc::new(Mutex::new(None)),
            track_mapping: Arc::new(DashMap::new()),
            signaling_lock: Arc::new(Mutex::new(())),
        }
    }
}
