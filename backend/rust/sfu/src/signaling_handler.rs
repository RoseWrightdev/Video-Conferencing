use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};
use webrtc::ice_transport::ice_gathering_state::RTCIceGatheringState;
use webrtc::peer_connection::RTCPeerConnection;

use crate::pb::{
    self,
    sfu::{sfu_event::Payload as EventPayload, SfuEvent},
};

pub async fn perform_renegotiation(
    peer_pc: Arc<RTCPeerConnection>,
    event_tx: crate::types::SharedEventSender,
    user_id: String,
    signaling_lock: Arc<Mutex<()>>,
    track_mapping_event: Option<pb::signaling::TrackAddedEvent>,
) {
    let _guard = signaling_lock.lock().await;

    // A. Add track mapping if provided
    if let Some(event) = track_mapping_event {
        let mut tx_lock = event_tx.lock().await;
        if let Some(tx) = tx_lock.as_mut() {
            let _ = tx
                .send(Ok(SfuEvent {
                    payload: Some(EventPayload::TrackEvent(event)),
                }))
                .await;
            println!("[SFU] TrackAdded event sent to channel for {}", user_id);
        }
    }

    // B. Create Offer
    let offer = match peer_pc.create_offer(None).await {
        Ok(o) => o,
        Err(e) => {
            error!(user_id = %user_id, error = %e, "Failed to create offer");
            return;
        }
    };

    let mut gather_complete = peer_pc.gathering_complete_promise().await;

    if let Err(e) = peer_pc.set_local_description(offer).await {
        error!(user_id = %user_id, error = %e, "Failed to set local desc");
        return;
    }

    if peer_pc.ice_gathering_state() != RTCIceGatheringState::Complete {
        info!(user_id = %user_id, "[SFU] Waiting for ICE gathering");
        let _ = tokio::time::timeout(
            tokio::time::Duration::from_millis(1500),
            gather_complete.recv(),
        )
        .await;
    }

    // C. Send Offer
    let local_desc = peer_pc.local_description().await.unwrap_or_default();
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
