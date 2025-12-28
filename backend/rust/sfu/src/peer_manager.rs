use crate::pb::sfu::SfuEvent;
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use webrtc::peer_connection::RTCPeerConnection;

// Peer wraps the WebRTC Connection
pub struct Peer {
    pub pc: Arc<RTCPeerConnection>,
    pub user_id: String,
    pub room_id: String,
    // Channel to send events (TrackAdded, Renegotiation) to Go -> Frontend
    pub event_tx: crate::types::SharedEventSender,
    // Map from StreamID (in this peer's PC) to Source UserID
    pub track_mapping: Arc<DashMap<String, String>>,
    // Ensure only one negotiation happens at a time per peer
    pub signaling_lock: Arc<Mutex<()>>,
}

impl Peer {
    pub fn new(pc: Arc<RTCPeerConnection>, user_id: String, room_id: String) -> Self {
        Self {
            pc,
            user_id,
            room_id,
            event_tx: Arc::new(Mutex::new(None)),
            track_mapping: Arc::new(DashMap::new()),
            signaling_lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn register_ice_candidate_handler(&self) {
        let event_tx_clone = self.event_tx.clone();
        let user_id_ice_candidate = self.user_id.clone();

        // We assume `pc` is already Arc, so we can clone it if needed, but here we access it via &self.pc
        self.pc.on_ice_candidate(Box::new(
            move |c: Option<webrtc::ice_transport::ice_candidate::RTCIceCandidate>| {
                let event_tx_inner = event_tx_clone.clone();
                let user_id_inner = user_id_ice_candidate.clone();
                Box::pin(async move {
                    if let Some(candidate) = c {
                        tracing::info!(user_id = %user_id_inner, "[SFU] Generated ICE candidate");
                        let candidate_json =
                            serde_json::to_string(&candidate.to_json().unwrap()).unwrap();
                        let mut tx_lock = event_tx_inner.lock().await;
                        if let Some(tx) = tx_lock.as_mut() {
                            let _ = tx
                                .send(Ok(SfuEvent {
                                    payload: Some(
                                        crate::pb::sfu::sfu_event::Payload::IceCandidate(
                                            candidate_json,
                                        ),
                                    ),
                                }))
                                .await;
                        }
                    }
                })
            },
        ));
    }
}
