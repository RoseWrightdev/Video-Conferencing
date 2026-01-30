use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};
use tracing::{error, info};
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

use crate::id_types::{RoomId, UserId};
use crate::media_setup::MediaSetup;
use crate::metrics::{SFU_ACTIVE_PEERS, SFU_ACTIVE_ROOMS};
use crate::pb;
use crate::pb::sfu::sfu_service_server::SfuService;
use crate::pb::sfu::{
    CreateSessionRequest, CreateSessionResponse, DeleteSessionRequest, DeleteSessionResponse,
    ListenRequest, SfuEvent, SignalMessage, SignalResponse,
};
use crate::peer_manager::Peer;
use crate::room_manager::RoomManager;
use crate::track_handler;
use crate::types::{PeerMap, TrackMap}; // Used in code as pb::signaling

// The Server State
/// Implementation of the SFU Service state.
/// Holds references to all active peers, tracks, and the room manager.
#[derive(Clone)]
pub struct MySfu {
    /// Thread-safe map of active peers, keyed by `(RoomId, UserId)`.
    pub peers: PeerMap,
    /// Thread-safe map of active broadcasters, keyed by `(RoomId, UserId, StreamId, TrackId)`.
    pub tracks: TrackMap,
    /// Manages room membership logic (which users are in which room).
    pub room_manager: Arc<RoomManager>,
    /// gRPC client for the Captioning/Stream Processor service.
    /// Used to forward audio chunks for transcription.
    pub cc_client: Option<
        crate::pb::stream_processor::captioning_service_client::CaptioningServiceClient<
            tonic::transport::Channel,
        >,
    >,
}

impl MySfu {
    /// Internal logic for creating a new SFU session.
    ///
    /// 1. Initializes a new `RTCPeerConnection`.
    /// 2. Configures the media engine and transceivers.
    /// 3. Registers event handlers (ICE, connection state, on_track).
    /// 4. Subscribes the new peer to existing tracks in the room.
    /// 5. Generates and sets a local SDP offer.
    /// 6. Returns the SDP offer to the client.
    pub async fn create_session_internal(
        &self,
        request: Request<CreateSessionRequest>,
    ) -> Result<Response<CreateSessionResponse>, Status> {
        let req = request.into_inner();
        
        if req.room_id.is_empty() || req.user_id.is_empty() {
             return Err(Status::invalid_argument(
                "room_id and user_id must not be empty",
            ));
        }

        let room_id = RoomId::from(req.room_id);
        let user_id = UserId::from(req.user_id);

        info!(room = %room_id, user = %user_id, "CreateSession called");

        // 1. Configure WebRTC Engine
        let api = MediaSetup::create_webrtc_api();

        // 2. Configure ICE (STUN servers)
        let config = MediaSetup::get_rtc_config();

        // 3. Create the Peer Connection
        let pc = api
            .new_peer_connection(config)
            .await
            .map_err(|e| Status::internal(format!("Failed to create peer connection: {}", e)))?;

        // 4. Add Transceiver to RECEIVE Video/Audio from this client
        MediaSetup::configure_media_engine(&pc).await?;

        // Inspect PC state
        let user_id_ice_state = user_id.clone();
        pc.on_ice_connection_state_change(Box::new(move |s: RTCIceConnectionState| {
            info!(user_id = %user_id_ice_state, state = %s, "[SFU] ICE Connection State changed");
            Box::pin(async {})
        }));

        let user_id_pc_state = user_id.clone();
        pc.on_peer_connection_state_change(Box::new(move |s: RTCPeerConnectionState| {
            info!(user_id = %user_id_pc_state, state = %s, "[SFU] Peer Connection State changed");
            Box::pin(async {})
        }));

        let peer = Peer::new(Arc::new(pc), user_id.clone(), room_id.clone());

        // Register ICE candidate handler
        peer.register_ice_candidate_handler();

        let peer_pc = peer.pc.clone();

        // 5. Initial Sync: Subscribe to EXISTING tracks from other peers
        MediaSetup::subscribe_to_existing_tracks(&peer, user_id.as_ref(), room_id.as_ref(), &self.tracks).await;

        // Setup OnTrack Handler: Where THIS client sends media to us
        track_handler::attach_track_handler(
            &peer_pc,
            Arc::new(track_handler::TrackHandlerContext {
                peers: self.peers.clone(),
                tracks: self.tracks.clone(),
                room_manager: self.room_manager.clone(),
                cc_client: self.cc_client.clone(),
                user_id: user_id.clone(),
                room_id: room_id.clone(),
            }),
        );

        // 6. Save to Map
        let session_key = (room_id.clone(), user_id.clone());
        self.peers.insert(session_key.clone(), peer);

        // 7. Add to RoomManager & Update Metrics
        SFU_ACTIVE_PEERS.inc();
        if self.room_manager.add_user(room_id.clone(), user_id.clone()) {
            SFU_ACTIVE_ROOMS.inc();
        }

        // 8. Create Offer for THIS client
        let offer = peer_pc
            .create_offer(None)
            .await
            .map_err(|e| Status::internal(format!("Failed to create offer: {}", e)))?;

        let mut gather_complete = peer_pc.gathering_complete_promise().await;
        peer_pc
            .set_local_description(offer)
            .await
            .map_err(|e| Status::internal(format!("Failed to set local description: {}", e)))?;

        use webrtc::ice_transport::ice_gathering_state::RTCIceGatheringState;
        if peer_pc.ice_gathering_state() != RTCIceGatheringState::Complete {
            info!(session = ?session_key, "[SFU] Waiting for initial ICE gathering");
            let timeout_res = tokio::time::timeout(
                tokio::time::Duration::from_millis(1500),
                gather_complete.recv(),
            )
            .await;

            if timeout_res.is_err() {
                tracing::warn!(session = ?session_key, "ICE gathering timed out");
                return Err(Status::unavailable("ICE gathering timed out, please retry"));
            }
        }

        let local_desc = peer_pc.local_description().await.unwrap_or_default();
        let sdp = local_desc.sdp;

        info!(session = ?session_key, "Session created. Initial SDP Offer (Wait completed)");

        Ok(Response::new(CreateSessionResponse { sdp_offer: sdp }))
    }

    /// Internal logic for establishing a server-side event stream.
    ///
    /// The client connects to this endpoint to receive asynchronous events from the SFU,
    /// such as `TrackAddedEvent`, negotiation requests, or captions.
    pub async fn listen_events_internal(
        &self,
        request: Request<ListenRequest>,
    ) -> Result<Response<ReceiverStream<Result<SfuEvent, Status>>>, Status> {
        let req = request.into_inner();
        
        if req.room_id.is_empty() || req.user_id.is_empty() {
             return Err(Status::invalid_argument(
                "room_id and user_id must not be empty",
            ));
        }

        let session_key = (RoomId::from(req.room_id.clone()), UserId::from(req.user_id.clone()));
        // Note: we need req.room_id (String) for comparisons if tracks keys are strong types?
        // Wait, tracks keys ARE strong types. So we need strong types for comparisons.

        info!(?session_key, "ListenEvents called");

        let (tx, rx) = mpsc::channel(100);

        if let Some(peer) = self.peers.get(&session_key) {
            let mut event_tx = peer.event_tx.lock().await;
            *event_tx = Some(tx.clone());

            // Send initial mappings for existing tracks that THIS peer is subscribed to
            let mapping = peer.track_mapping.clone();
            for mapping_entry in mapping.iter() {
                let stream_id = mapping_entry.key();
                let source_user_id = mapping_entry.value();

                let mut track_kind = "video".to_string();
                // Find the broadcaster to get the correct kind
                    for track_entry in self.tracks.iter() {
                    let (t_room, t_user, t_stream, _t_track) = track_entry.key();
                    if t_room.as_ref() == req.room_id && t_user == source_user_id && t_stream == stream_id {
                        track_kind = track_entry.value().kind.clone();
                        break;
                    }
                }

                let event = SfuEvent {
                    payload: Some(pb::sfu::sfu_event::Payload::TrackEvent(
                        pb::signaling::TrackAddedEvent {
                            user_id: source_user_id.to_string(),
                            stream_id: stream_id.to_string(),
                            track_kind,
                        },
                    )),
                };
                let _ = tx.send(Ok(event)).await;
            }
        } else {
            return Err(Status::not_found("Session not found"));
        }

        Ok(Response::new(ReceiverStream::new(rx)))
    }

    /// Gracefully shutdown all active peer connections
    pub async fn shutdown(&self) {
        info!("Closing {} active peer connections", self.peers.len());

        // Collect all session keys
        let session_keys: Vec<_> = self.peers.iter().map(|entry| entry.key().clone()).collect();

        // Close each peer connection
        for session_key in session_keys {
            if let Some((_, peer)) = self.peers.remove(&session_key) {
                info!(?session_key, "Closing peer connection");

                // Close the peer connection
                if let Err(e) = peer.pc.close().await {
                    tracing::warn!(?session_key, error = %e, "Error closing peer connection");
                }
            }
        }

        // Clear all tracks
        self.tracks.clear();

        info!("All peer connections closed");
    }
}

#[tonic::async_trait]
impl SfuService for MySfu {
    async fn create_session(
        &self,
        request: Request<CreateSessionRequest>,
    ) -> Result<Response<CreateSessionResponse>, Status> {
        self.create_session_internal(request).await
    }

    async fn listen_events(
        &self,
        request: Request<ListenRequest>,
    ) -> Result<Response<Self::ListenEventsStream>, Status> {
        self.listen_events_internal(request).await
    }

    type ListenEventsStream = ReceiverStream<Result<SfuEvent, Status>>;

    async fn handle_signal(
        &self,
        request: Request<SignalMessage>,
    ) -> Result<Response<SignalResponse>, Status> {
        let req = request.into_inner();
        let session_key = (RoomId::from(req.room_id.clone()), UserId::from(req.user_id.clone()));

        let peer = match self.peers.get(&session_key) {
            Some(p) => p,
            None => return Err(Status::not_found("Session not found")),
        };
        let pc = &peer.pc;

        if let Some(payload) = req.payload {
            match payload {
                pb::sfu::signal_message::Payload::SdpAnswer(sdp) => {
                    info!(session = ?session_key, "Applying SDP Answer");
                    let desc = RTCSessionDescription::answer(sdp).map_err(|e| {
                        Status::invalid_argument(format!("Invalid SDP Answer: {}", e))
                    })?;
                    pc.set_remote_description(desc).await.map_err(|e| {
                        Status::invalid_argument(format!(
                            "Failed to set remote description (answer): {}",
                            e
                        ))
                    })?;
                }
                pb::sfu::signal_message::Payload::IceCandidate(candidate_str) => {
                    info!(session = ?session_key, candidate = %candidate_str, "Applying ICE Candidate");
                    let candidate: RTCIceCandidateInit = match serde_json::from_str(&candidate_str)
                    {
                        Ok(c) => c,
                        Err(e) => {
                            error!(session = ?session_key, error = %e, "Failed to parse ICE candidate");
                            return Err(Status::invalid_argument(format!(
                                "Failed to parse ICE candidate: {}",
                                e
                            )));
                        }
                    };

                    if let Err(e) = pc.add_ice_candidate(candidate).await {
                        error!(session = ?session_key, error = %e, "Failed to add ICE candidate");
                    }
                }
                pb::sfu::signal_message::Payload::SdpOffer(sdp) => {
                    info!(session = ?session_key, sdp_part = %sdp.chars().take(50).collect::<String>(), "Received SDP Offer");
                    let desc = RTCSessionDescription::offer(sdp).map_err(|e| {
                        Status::invalid_argument(format!("Invalid SDP Offer: {}", e))
                    })?;
                    pc.set_remote_description(desc).await.map_err(|e| {
                        error!(session = ?session_key, error = %e, "Failed to set remote description");
                        Status::invalid_argument(format!("Failed to set remote description (offer): {}", e))
                    })?;

                    let answer = pc
                        .create_answer(None)
                        .await
                        .map_err(|e| Status::internal(format!("Failed to create answer: {}", e)))?;

                    let mut gather_complete = pc.gathering_complete_promise().await;
                    pc.set_local_description(answer).await.map_err(|e| {
                        Status::internal(format!("Failed to set local description: {}", e))
                    })?;
                    let _ = gather_complete.recv().await;

                    let local_desc = pc.local_description().await.unwrap();
                    let mut sdp_answer = local_desc.sdp.clone();

                    // Fix DTLS Role Flip: Ensure SFU stays passive if the browser offers actpass
                    if sdp_answer.contains("a=setup:active") {
                        sdp_answer = sdp_answer.replace("a=setup:active", "a=setup:passive");
                        info!(session = ?session_key, "Modified Answer to setup:passive to prevent role flip");
                    }

                    info!(session = ?session_key, "Generated SDP Answer");

                    // Send Answer via Event Channel
                    let mut tx_lock = peer.event_tx.lock().await;
                    if let Some(tx) = tx_lock.as_mut() {
                        let event = SfuEvent {
                            payload: Some(pb::sfu::sfu_event::Payload::SdpAnswer(sdp_answer)),
                        };
                        let _ = tx.send(Ok(event)).await;
                    }
                }
            }
        }
        Ok(Response::new(SignalResponse { success: true }))
    }

    async fn delete_session(
        &self,
        request: Request<DeleteSessionRequest>,
    ) -> Result<Response<DeleteSessionResponse>, Status> {
        let req = request.into_inner();
        let session_key = (RoomId::from(req.room_id.clone()), UserId::from(req.user_id.clone()));
        if let Some((_, peer)) = self.peers.remove(&session_key) {
            info!(?session_key, "Deleting session and closing PeerConnection");
            let _ = peer.pc.close().await;

            // Cleanup: Remove any broadcast tracks belonging to this user
            let mut tracks_to_remove = Vec::new();
            for entry in self.tracks.iter() {
                let (t_room, t_user, _, _) = entry.key();

                // Comparison with request strings
                if t_room.as_ref() == req.room_id && t_user.as_ref() == req.user_id {
                    tracks_to_remove.push(entry.key().clone());
                }
            }

            for key in tracks_to_remove {
                info!(?key, "[SFU] Removing broadcast track");
                self.tracks.remove(&key);
            }

            // Remove from RoomManager & Update Metrics
            SFU_ACTIVE_PEERS.dec();
            if self.room_manager.remove_user(&session_key.0, &session_key.1) {
                SFU_ACTIVE_ROOMS.dec();
            }
        }
        Ok(Response::new(DeleteSessionResponse { success: true }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pb::sfu::sfu_service_server::SfuService;
    use dashmap::DashMap; // Ensure trait is in scope

    fn create_test_sfu() -> MySfu {
        MySfu {
            peers: Arc::new(DashMap::new()),
            tracks: Arc::new(DashMap::new()),
            room_manager: Arc::new(RoomManager::new()),
            cc_client: None,
        }
    }

    #[tokio::test]
    async fn test_create_session_missing_args() {
        let sfu = create_test_sfu();
        let req = Request::new(CreateSessionRequest {
            room_id: "".to_string(),
            user_id: "user1".to_string(),
        });
        let res = sfu.create_session(req).await;
        assert!(res.is_err());
        assert_eq!(res.unwrap_err().code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn test_create_session_success() {
        let sfu = create_test_sfu();
        let req = Request::new(CreateSessionRequest {
            room_id: "room1".to_string(),
            user_id: "user1".to_string(),
        });
        let res = sfu.create_session(req).await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn test_listen_events_missing_args() {
        let sfu = create_test_sfu();
        let req = Request::new(ListenRequest {
            room_id: "".to_string(),
            user_id: "user1".to_string(),
        });
        let res = sfu.listen_events(req).await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_listen_events_session_not_found() {
        let sfu = create_test_sfu();
        let req = Request::new(ListenRequest {
            room_id: "room1".to_string(),
            user_id: "user1".to_string(),
        });
        let res = sfu.listen_events(req).await;
        assert!(res.is_err());
        assert_eq!(res.unwrap_err().code(), tonic::Code::NotFound);
    }

    #[tokio::test]
    async fn test_delete_session() {
        let sfu = create_test_sfu();

        let req = Request::new(CreateSessionRequest {
            room_id: "room1".to_string(),
            user_id: "user1".to_string(),
        });
        let _ = sfu.create_session(req).await.unwrap();

        let req_del = Request::new(DeleteSessionRequest {
            room_id: "room1".to_string(),
            user_id: "user1".to_string(),
        });
        let res = sfu.delete_session(req_del).await;
        assert!(res.is_ok());
        assert_eq!(sfu.peers.len(), 0);
    }
}
