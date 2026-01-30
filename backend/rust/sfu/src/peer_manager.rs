use crate::id_types::{RoomId, UserId};
use crate::pb::sfu::SfuEvent;
use crate::types::SharedEventSender;
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use webrtc::peer_connection::RTCPeerConnection;

/// Represents a connected peer
pub struct Peer {
    pub pc: Arc<RTCPeerConnection>,
    pub user_id: UserId,
    pub room_id: RoomId,
    pub event_tx: SharedEventSender,
    pub signaling_lock: Arc<Mutex<()>>,
    /// Maps StreamID -> SourceUserID for tracks this peer is subscribed to
    pub track_mapping: crate::types::PeerTrackMapping,
}

impl Peer {
    pub fn new(pc: Arc<RTCPeerConnection>, user_id: UserId, room_id: RoomId) -> Self {
        Peer {
            pc,
            user_id,
            room_id,
            event_tx: Arc::new(Mutex::new(None)),
            signaling_lock: Arc::new(Mutex::new(())),
            track_mapping: Arc::new(DashMap::new()),
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

#[cfg(test)]
mod tests {
    use super::*;
    use webrtc::api::APIBuilder;
    use webrtc::peer_connection::configuration::RTCConfiguration;

    #[tokio::test]
    async fn test_peer_creation() {
        let api = APIBuilder::new().build();
        let pc = api.new_peer_connection(RTCConfiguration::default()).await.unwrap();
        let pc = Arc::new(pc);
        
        let user_id = UserId::from("u1");
        let room_id = RoomId::from("r1");

        let peer = Peer::new(pc.clone(), user_id.clone(), room_id.clone());

        assert_eq!(peer.user_id, user_id);
        assert_eq!(peer.room_id, room_id);
        // Ensure maps are initialized
        assert!(peer.track_mapping.is_empty());
    }
}
