use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};
use webrtc::ice_transport::ice_gathering_state::RTCIceGatheringState;
use webrtc::peer_connection::RTCPeerConnection;

use crate::pb::{
    self,
    sfu::{sfu_event::Payload as EventPayload, SfuEvent},
};
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

/// Initiates a renegotiation sequence with the peer.
///
/// 1. Sends an optional `TrackAddedEvent` via signaling to notify the client of a new track.
/// 2. Creates a new SDP Offer reflecting the changes (e.g., added transceivers).
/// 3. Gathers ICE candidates (if not complete).
/// 4. Sends the new SDP Offer to the client to update the session.
pub async fn perform_renegotiation(
    peer_pc: Arc<RTCPeerConnection>,
    event_tx: crate::types::SharedEventSender,
    user_id: crate::id_types::UserId,
    signaling_lock: Arc<Mutex<()>>,
    track_mapping_event: Option<pb::signaling::TrackAddedEvent>,
) {
    let _guard = signaling_lock.lock().await;

    // A. Add track mapping if provided
    send_track_added_event(&event_tx, &user_id, track_mapping_event).await;

    // B. Create Offer
    if (create_and_gather_offer(&peer_pc, &user_id).await).is_some() {
        // C. Send Offer
        let local_desc = peer_pc.local_description().await.unwrap_or_default();
        send_renegotiation_offer(&event_tx, &user_id, local_desc).await;
    }
}

/// Sends a `TrackAddedEvent` protobuf message to the client.
async fn send_track_added_event(
    event_tx: &crate::types::SharedEventSender,
    user_id: &crate::id_types::UserId,
    track_mapping_event: Option<pb::signaling::TrackAddedEvent>,
) {
    if let Some(event) = track_mapping_event {
        let mut tx_lock = event_tx.lock().await;
        if let Some(tx) = tx_lock.as_mut() {
            let _ = tx
                .send(Ok(SfuEvent {
                    payload: Some(EventPayload::TrackEvent(event)),
                }))
                .await;
            info!(user_id = %user_id, "[SFU] TrackAdded event sent to channel");
        }
    }
}

/// Creates a local SDP offer, sets it as the local description, and waits for ICE gathering to complete (or timeout).
async fn create_and_gather_offer(
    peer_pc: &Arc<RTCPeerConnection>,
    user_id: &crate::id_types::UserId,
) -> Option<RTCSessionDescription> {
    let offer = match peer_pc.create_offer(None).await {
        Ok(o) => o,
        Err(e) => {
            error!(user_id = %user_id, error = %e, "Failed to create offer");
            return None;
        }
    };

    let mut gather_complete = peer_pc.gathering_complete_promise().await;

    if let Err(e) = peer_pc.set_local_description(offer.clone()).await {
        error!(user_id = %user_id, error = %e, "Failed to set local desc");
        return None;
    }

    if peer_pc.ice_gathering_state() != RTCIceGatheringState::Complete {
        info!(user_id = %user_id, "[SFU] Waiting for ICE gathering");
        let _ = tokio::time::timeout(
            tokio::time::Duration::from_millis(1500),
            gather_complete.recv(),
        )
        .await;
    }
    Some(offer)
}

/// Sends the generated SDP Offer to the client via the signaling channel.
async fn send_renegotiation_offer(
    event_tx: &crate::types::SharedEventSender,
    user_id: &crate::id_types::UserId,
    local_desc: RTCSessionDescription,
) {
    info!(user_id = %user_id, sdp_length = %local_desc.sdp.len(), "[SFU] Sending Renegotiation Offer");

    let mut tx_lock = event_tx.lock().await;
    if let Some(tx) = tx_lock.as_mut() {
        let _ = tx
            .send(Ok(SfuEvent {
                payload: Some(EventPayload::RenegotiateSdpOffer(local_desc.sdp)),
            }))
            .await;
        debug!(user_id = %user_id, "[SFU] Renegotiation message sent to channel");
    } else {
        warn!(user_id = %user_id, "[SFU] !! Event channel is CLOSED or None");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use webrtc::api::APIBuilder;
    use webrtc::peer_connection::configuration::RTCConfiguration;

    #[tokio::test]
    async fn test_perform_renegotiation_creates_offer() {
        let api = APIBuilder::new().build();
        let pc = Arc::new(
            api.new_peer_connection(RTCConfiguration::default())
                .await
                .unwrap(),
        );
        let event_tx = Arc::new(Mutex::new(Some(tokio::sync::mpsc::channel(10).0)));
        let signaling_lock = Arc::new(Mutex::new(()));

        perform_renegotiation(
            pc,
            event_tx,
            crate::id_types::UserId::from("user1"),
            signaling_lock,
            None,
        )
        .await;
    }

    #[tokio::test]
    async fn test_perform_renegotiation_with_track_event() {
        let api = APIBuilder::new().build();
        let pc = Arc::new(
            api.new_peer_connection(RTCConfiguration::default())
                .await
                .unwrap(),
        );
        let (tx, mut rx) = tokio::sync::mpsc::channel(10);
        let event_tx = Arc::new(Mutex::new(Some(tx)));
        let signaling_lock = Arc::new(Mutex::new(()));

        let track_event = Some(crate::pb::signaling::TrackAddedEvent {
            user_id: "u1".to_string(),
            stream_id: "s1".to_string(),
            track_kind: "video".to_string(),
        });

        perform_renegotiation(
            pc,
            event_tx,
            crate::id_types::UserId::from("user1"),
            signaling_lock,
            track_event,
        )
        .await;

        // consume the event
        let msg = rx.recv().await;
        assert!(msg.is_some());
    }

    #[tokio::test]
    async fn test_perform_renegotiation_closed_channel() {
        let api = APIBuilder::new().build();
        let pc = Arc::new(
            api.new_peer_connection(RTCConfiguration::default())
                .await
                .unwrap(),
        );
        // None channel
        let event_tx = Arc::new(Mutex::new(None));
        let signaling_lock = Arc::new(Mutex::new(()));

        perform_renegotiation(
            pc,
            event_tx,
            crate::id_types::UserId::from("user1"),
            signaling_lock,
            None,
        )
        .await;
    }
}
