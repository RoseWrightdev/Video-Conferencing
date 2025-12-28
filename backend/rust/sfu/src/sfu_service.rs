use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};
use tracing::{error, info};
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

use crate::media_setup::MediaSetup;
use crate::pb;
use crate::pb::sfu::sfu_service_server::SfuService;
use crate::pb::sfu::{
    CreateSessionRequest, CreateSessionResponse, DeleteSessionRequest, DeleteSessionResponse,
    ListenRequest, SfuEvent, SignalMessage, SignalResponse,
};
use crate::peer_manager::Peer;
use crate::track_handler;
use crate::types::{PeerMap, TrackMap}; // Used in code as pb::signaling

// The Server State
pub struct MySfu {
    // Thread-safe map: (RoomID, UserID) -> Peer
    pub peers: PeerMap,
    // Map: (RoomID, UserID, StreamID, TrackID) -> Broadcaster
    pub tracks: TrackMap,
}

#[tonic::async_trait]
impl SfuService for MySfu {
    async fn create_session(
        &self,
        request: Request<CreateSessionRequest>,
    ) -> Result<Response<CreateSessionResponse>, Status> {
        let req = request.into_inner();
        let room_id = req.room_id.clone();
        let user_id = req.user_id.clone();

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
        MediaSetup::subscribe_to_existing_tracks(&peer, &user_id, &room_id, &self.tracks).await;

        // Setup OnTrack Handler: Where THIS client sends media to us
        track_handler::attach_track_handler(
            &peer_pc,
            user_id.clone(),
            room_id.clone(),
            self.peers.clone(),
            self.tracks.clone(),
        );

        // 6. Save to Map
        let session_key = (room_id.clone(), user_id.clone());
        self.peers.insert(session_key.clone(), peer);

        // 7. Create Offer for THIS client
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
            let _ = tokio::time::timeout(
                tokio::time::Duration::from_millis(1500),
                gather_complete.recv(),
            )
            .await;
        }

        let local_desc = peer_pc.local_description().await.unwrap_or_default();
        let sdp = local_desc.sdp;

        info!(session = ?session_key, "Session created. Initial SDP Offer (Wait completed)");

        Ok(Response::new(CreateSessionResponse { sdp_offer: sdp }))
    }

    async fn listen_events(
        &self,
        request: Request<ListenRequest>,
    ) -> Result<Response<Self::ListenEventsStream>, Status> {
        let req = request.into_inner();
        let session_key = (req.room_id.clone(), req.user_id.clone());

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
                    if t_room == &req.room_id && t_user == source_user_id && t_stream == stream_id {
                        track_kind = track_entry.value().kind.clone();
                        break;
                    }
                }

                let event = SfuEvent {
                    payload: Some(pb::sfu::sfu_event::Payload::TrackEvent(
                        pb::signaling::TrackAddedEvent {
                            user_id: source_user_id.clone(),
                            stream_id: stream_id.clone(),
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

    type ListenEventsStream = ReceiverStream<Result<SfuEvent, Status>>;

    async fn handle_signal(
        &self,
        request: Request<SignalMessage>,
    ) -> Result<Response<SignalResponse>, Status> {
        let req = request.into_inner();
        let session_key = (req.room_id.clone(), req.user_id.clone());

        let peer = match self.peers.get(&session_key) {
            Some(p) => p,
            None => return Err(Status::not_found("Session not found")),
        };
        let pc = &peer.pc;

        if let Some(payload) = req.payload {
            match payload {
                pb::sfu::signal_message::Payload::SdpAnswer(sdp) => {
                    info!(session = ?session_key, "Applying SDP Answer");
                    let desc = RTCSessionDescription::answer(sdp).unwrap();
                    pc.set_remote_description(desc).await.map_err(|e| {
                        Status::internal(format!("Failed to set remote description: {}", e))
                    })?;
                }
                pb::sfu::signal_message::Payload::IceCandidate(candidate_str) => {
                    info!(session = ?session_key, candidate = %candidate_str, "Applying ICE Candidate");
                    let candidate: RTCIceCandidateInit = match serde_json::from_str(&candidate_str)
                    {
                        Ok(c) => c,
                        Err(e) => {
                            error!(session = ?session_key, error = %e, "Failed to parse ICE candidate");
                            return Err(Status::internal(format!(
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
                    let desc = RTCSessionDescription::offer(sdp).unwrap();
                    pc.set_remote_description(desc).await.map_err(|e| {
                        error!(session = ?session_key, error = %e, "Failed to set remote description");
                        Status::internal(format!("Failed to set remote description: {}", e))
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
        let session_key = (req.room_id.clone(), req.user_id.clone());
        if let Some((_, peer)) = self.peers.remove(&session_key) {
            info!(?session_key, "Deleting session and closing PeerConnection");
            let _ = peer.pc.close().await;

            // Cleanup: Remove any broadcast tracks belonging to this user
            let mut tracks_to_remove = Vec::new();
            for entry in self.tracks.iter() {
                let (t_room, t_user, _, _) = entry.key();

                if t_room == &req.room_id && t_user == &req.user_id {
                    tracks_to_remove.push(entry.key().clone());
                }
            }

            for key in tracks_to_remove {
                info!(?key, "[SFU] Removing broadcast track");
                self.tracks.remove(&key);
            }
        }
        Ok(Response::new(DeleteSessionResponse { success: true }))
    }
}
