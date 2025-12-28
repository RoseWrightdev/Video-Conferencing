use std::sync::Arc;
use tokio::sync::Mutex;
use dashmap::DashMap;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{transport::Server, Request, Response, Status};
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;
use webrtc::rtp_transceiver::RTCRtpTransceiverInit;
use webrtc::track::track_local::TrackLocal;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::TrackLocalWriter;
use webrtc::track::track_remote::TrackRemote;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use serde_json;
use tracing::{info, error, debug, warn, trace};

// Import the generated proto code
pub mod pb {
    pub mod signaling {
        include!("generated/signaling.rs");
    }
    pub mod sfu {
        include!("generated/sfu.rs");
    }
}

use pb::sfu::sfu_service_server::{SfuService, SfuServiceServer};
use pb::sfu::{
    CreateSessionRequest, CreateSessionResponse, SignalMessage, SignalResponse,
    ListenRequest, SfuEvent, DeleteSessionRequest, DeleteSessionResponse
};
use pb::sfu::sfu_event::Payload as EventPayload;

mod broadcaster;
use broadcaster::TrackBroadcaster;
mod peer_manager;
use peer_manager::Peer;
mod media_setup;
use media_setup::MediaSetup;
mod signaling_handler;
use signaling_handler::perform_renegotiation;




// The Server State
struct MySfu {
    // Thread-safe map: SessionID -> Peer
    peers: Arc<DashMap<String, Peer>>,
    // Map: RoomID -> [List of Active Broadcasters (Source UserID, StreamID, TrackID) -> Broadcaster]
    // Key: "room_id:user_id:stream_id:track_id"
    tracks: Arc<DashMap<String, Arc<TrackBroadcaster>>>,
}



impl MySfu {

}

// Extended Peer struct to hold broadcasters
// We can't change the struct definition easily in mid-file without moving things.
// Let's use a side-car map in MySfu for broadcasters or just stick it in Peer if I could edit it all.
// I'll edit Peer struct above (done in previous chunk) - wait, I didn't add the field in previous chunk.
// Let me correct the previous chunk or add it here.
// I will add a new global map for tracks to make it easier to lookup.
// `tracks: Arc<DashMap<String, Arc<TrackBroadcaster>>>` where key is "room_id:user_id:stream_id:track_id"


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
        let pc = api.new_peer_connection(config).await.map_err(|e| {
            Status::internal(format!("Failed to create peer connection: {}", e))
        })?;

        // 4. Add Transceiver to RECEIVE Video/Audio from this client
        pc.add_transceiver_from_kind(
            webrtc::rtp_transceiver::rtp_codec::RTPCodecType::Video,
            Some(RTCRtpTransceiverInit {
                direction: RTCRtpTransceiverDirection::Recvonly,
                send_encodings: vec![],
            }),
        )
        .await
        .map_err(|e| Status::internal(format!("Failed to add video transceiver: {}", e)))?;

        pc.add_transceiver_from_kind(
            webrtc::rtp_transceiver::rtp_codec::RTPCodecType::Audio,
            Some(RTCRtpTransceiverInit {
                direction: RTCRtpTransceiverDirection::Recvonly,
                send_encodings: vec![],
            }),
        )
        .await
        .map_err(|e| Status::internal(format!("Failed to add audio transceiver: {}", e)))?;

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

        let event_tx_clone = peer.event_tx.clone();
        let user_id_ice_candidate = user_id.clone();
        peer.pc.on_ice_candidate(Box::new(move |c: Option<webrtc::ice_transport::ice_candidate::RTCIceCandidate>| {
            let event_tx_inner = event_tx_clone.clone();
            let user_id_inner = user_id_ice_candidate.clone();
            Box::pin(async move {
                if let Some(candidate) = c {
                    info!(user_id = %user_id_inner, "[SFU] Generated ICE candidate");
                    let candidate_json = serde_json::to_string(&candidate.to_json().unwrap()).unwrap();
                    let mut tx_lock = event_tx_inner.lock().await;
                    if let Some(tx) = tx_lock.as_mut() {
                        let _ = tx.send(Ok(SfuEvent {
                            payload: Some(EventPayload::IceCandidate(candidate_json)),
                        })).await;
                    }
                }
            })
        }));

        let peer_pc = peer.pc.clone();
        
        // 5. Initial Sync: Subscribe to EXISTING tracks from other peers
        MediaSetup::subscribe_to_existing_tracks(&peer, &user_id, &room_id, &self.tracks).await;
        
        
        
        // Setup OnTrack Handler: When THIS client sends media to us
        let peers_clone = self.peers.clone();
        let tracks_map = self.tracks.clone(); // Capture global tracks map
        let user_id_clone = user_id.clone();
        let room_id_clone = room_id.clone();
        
        let pc_for_ontrack = peer_pc.clone();
        peer_pc.on_track(Box::new(move |track: Arc<TrackRemote>, _receiver, _transceiver| {
            let track_id = track.id().to_owned();
            let track_kind = track.kind().to_string();
            let track_ssrc = track.ssrc();
            info!(
                user_id = %user_id_clone,
                kind = %track_kind,
                stream_id = %track.stream_id(),
                track_id = %track_id,
                ssrc = %track_ssrc,
                "[SFU] on_track triggered!"
            );
            
            let user_id = user_id_clone.clone();
            let room_id = room_id_clone.clone();
            let peers = peers_clone.clone();
            let tracks_map = tracks_map.clone();
            let pc_capture = pc_for_ontrack.clone();
            
            
            Box::pin(async move {
                info!(user_id = %user_id, kind = %track.kind(), "Received track from user");
                
                // 1. Create Broadcaster
                let capability = track.codec().capability.clone();
                let broadcaster = Arc::new(TrackBroadcaster::new(track_kind.clone(), capability, pc_capture, track_ssrc));
                let track_key = format!("{}:{}:{}:{}", room_id, user_id, track.stream_id(), track.id());
                info!(track_key = %track_key, "[SFU] Created broadcaster for track");
                tracks_map.insert(track_key.clone(), broadcaster.clone());
                
                // 2. Notify Existing Peers & Add Writer to them
                info!(count = %peers.len(), "[SFU] Notifying peers about new track");
                for peer_entry in peers.iter() {
                    let other_peer = peer_entry.value();
                    debug!(peer = %other_peer.user_id, matching_room = %other_peer.room_id, "[SFU] Checking peer");
                    if other_peer.room_id == room_id && other_peer.user_id != user_id {
                          info!(target_user = %other_peer.user_id, "[SFU] Forwarding new track");
                          
                          let broadcaster_clone = broadcaster.clone();
                          let track_id_clone = track.id().to_owned();
                          let track_stream_id_clone = track.stream_id().to_owned();
                          let track_kind_clone = track.kind().to_string();
                          let capability_clone = track.codec().capability.clone();
                          let source_user_id = user_id.clone();
                          
                          let other_peer_pc = other_peer.pc.clone();
                          let other_peer_signaling_lock = other_peer.signaling_lock.clone();
                          let other_peer_event_tx = other_peer.event_tx.clone();
                          let other_peer_track_mapping = other_peer.track_mapping.clone();
                          let other_peer_user_id = other_peer.user_id.clone();
                          let track_for_pt = track.clone();

                          tokio::spawn(async move {
                              let local_track = Arc::new(TrackLocalStaticRTP::new(
                                  capability_clone,
                                  track_id_clone.clone(),
                                  track_stream_id_clone.clone(),
                              ));
                             
                             let rtp_sender = match other_peer_pc.add_track(Arc::clone(&local_track) as Arc<dyn TrackLocal + Send + Sync>).await {
                                     Ok(s) => s,
                                     Err(e) => { error!(peer = %other_peer_user_id, error = %e, "Error adding track to peer"); return; }
                             };
                                 
                             let sender_clone = rtp_sender.clone();
                             let broadcaster_to_move = broadcaster_clone.clone();
                             tokio::spawn(async move {
                                 let mut rtcp_buf = vec![0u8; 1500];
                                 while let Ok((packets, _)) = sender_clone.read(&mut rtcp_buf).await {
                                     for packet in packets {
                                         if packet.as_any().is::<PictureLossIndication>() {
                                             broadcaster_to_move.request_keyframe().await;
                                         }
                                     }
                                 }
                             });
                                 
                             let params = rtp_sender.get_parameters().await;
                             let ssrc = params.encodings.first().map(|e| e.ssrc).unwrap_or(0);
                             let pt = if let Some(codec) = params.rtp_parameters.codecs.first() {
                                 codec.payload_type
                            } else {
                                 // Fallback to incoming PT if we can't find a negotiated one (better than 0)
                                 let incoming_pt = track_for_pt.payload_type().try_into().unwrap_or(0);
                                 warn!(incoming_pt = %incoming_pt, "[SFU] Outgoing codecs empty, falling back to incoming PT");
                                 incoming_pt
                             };
                             info!(outgoing_pt = %pt, ssrc = %ssrc, "[SFU] on_track forwarding: Resolved Outgoing PT");
                             broadcaster_clone.add_writer(local_track, ssrc, pt).await;
                             
                             // Delayed Keyframe Request - Burst Mode to ensure delivery after DTLS
                             broadcaster_clone.clone().schedule_pli_retry();
                             other_peer_track_mapping.insert(track_stream_id_clone.clone(), source_user_id.clone());

                             // Use unified renegotiation helper
                             perform_renegotiation(
                                 other_peer_pc.clone(),
                                 other_peer_event_tx.clone(),
                                 other_peer_user_id.clone(),
                                 other_peer_signaling_lock.clone(),
                                 Some(pb::signaling::TrackAddedEvent {
                                     user_id: source_user_id,
                                     stream_id: track_stream_id_clone,
                                     track_kind: track_kind_clone,
                                 })
                             ).await;
                          });
                    }
                }
                
                // 3. Start Forwarding Loop
                // Read from `track` (Remote), Write to `broadcaster` (Locals)
                let _media_ssrc = track.ssrc();
                let track_id_log = track.id().to_owned();
                let mime_type = track.codec().capability.mime_type.to_lowercase();

                tokio::spawn(async move {
                    let mut packet_count = 0;
                    info!(track = %track_id_log, "[SFU] Starting read_rtp loop");
                    loop {
                         match track.read_rtp().await {
                             Ok((packet, _)) => {
                                 packet_count += 1;
                                 if packet_count == 1 {
                                     info!(track = %track_id_log, "[SFU] First packet received");
                                 }
                                 
                                 // Keyframe Detection
                                 let is_keyframe = if packet.payload.len() > 0 {
                                     if mime_type.contains("vp8") {
                                         // VP8: S-bit is 0 for start of partition? No, Key frame is bit 0 of first byte == 0
                                         // (payload[0] & 0x01) == 0
                                         (packet.payload[0] & 0x01) == 0
                                     } else if mime_type.contains("h264") {
                                         let nal_type = packet.payload[0] & 0x1F;
                                         if nal_type == 5 {
                                             true // IDR
                                         } else if nal_type == 28 && packet.payload.len() > 1 {
                                             // FU-A
                                             let s_bit = (packet.payload[1] & 0x80) != 0;
                                             let inner_type = packet.payload[1] & 0x1F;
                                             s_bit && inner_type == 5
                                         } else {
                                             false
                                         }
                                     } else {
                                         false
                                     }
                                 } else {
                                     false
                                 };

                                 if is_keyframe {
                                     broadcaster.mark_keyframe_received();
                                     if packet_count % 100 == 0 || packet_count < 50 {
                                          debug!(track = %track_id_log, "[SFU] Keyframe received");
                                     }
                                 }

                                 if packet_count % 100 == 0 {
                                     trace!(count = %packet_count, track = %track_id_log, "[SFU] Forwarded packets");
                                 }
                                 let writers = broadcaster.writers.read().await;
                                 for w in writers.iter() {
                                     /* ... packet logic ... */
                                     let mut packet = packet.clone();
                                     packet.header.ssrc = w.ssrc;
                                     if w.payload_type != 0 {
                                         packet.header.payload_type = w.payload_type;
                                     }
                                     if packet_count % 100 == 0 {
                                         trace!(ssrc = %w.ssrc, pt = %packet.header.payload_type, orig_pt = %packet.header.payload_type, "[SFU] Writing packet");
                                     }
                                     if let Err(_e) = w.track.write_rtp(&packet).await {
                                         // debug!(error = %_e, "Error forwarding packet");
                                     }
                                 }
                             }
                             Err(e) => {
                                 warn!(track = %track_id_log, error = %e, "[SFU] Track loop finished: Error. (Note: 'DataChannel not opened' usually means Transport Closed)");
                                 break;
                             }
                         }
                    }
                });
            })
        }));

        // 6. Save to Map
        let session_key = format!("{}:{}", room_id, user_id);
        self.peers.insert(session_key.clone(), peer);

        // 7. Create Offer for THIS client
        let offer = peer_pc.create_offer(None).await.map_err(|e| {
            Status::internal(format!("Failed to create offer: {}", e))
        })?;
        
        let mut gather_complete = peer_pc.gathering_complete_promise().await;
        peer_pc.set_local_description(offer).await.map_err(|e| {
            Status::internal(format!("Failed to set local description: {}", e))
        })?;
        
        use webrtc::ice_transport::ice_gathering_state::RTCIceGatheringState;
        if peer_pc.ice_gathering_state() != RTCIceGatheringState::Complete {
            info!(session = %session_key, "[SFU] Waiting for initial ICE gathering");
            let _ = tokio::time::timeout(tokio::time::Duration::from_millis(1500), gather_complete.recv()).await;
        }
        
        let local_desc = peer_pc.local_description().await.unwrap_or_default();
        let sdp = local_desc.sdp;
        
        info!(session = %session_key, "Session created. Initial SDP Offer (Wait completed)");

        Ok(Response::new(CreateSessionResponse {
            sdp_offer: sdp,
        }))
    }

    async fn listen_events(
        &self,
        request: Request<ListenRequest>,
    ) -> Result<Response<Self::ListenEventsStream>, Status> {
        let req = request.into_inner();
        let session_key = format!("{}:{}", req.room_id, req.user_id);
        
        info!(session = %session_key, "ListenEvents called");

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
                            let key = track_entry.key();
                            if key.starts_with(&format!("{}:{}:{}", req.room_id, source_user_id, stream_id)) {
                                track_kind = track_entry.value().kind.clone();
                                break;
                            }
                        }

                        let event = SfuEvent {
                             payload: Some(pb::sfu::sfu_event::Payload::TrackEvent(pb::signaling::TrackAddedEvent {
                                 user_id: source_user_id.clone(),
                                 stream_id: stream_id.clone(),
                                 track_kind,
                             })),
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
        let session_key = format!("{}:{}", req.room_id, req.user_id);

        let peer = match self.peers.get(&session_key) {
            Some(p) => p,
            None => return Err(Status::not_found("Session not found")),
        };
        let pc = &peer.pc;

        if let Some(payload) = req.payload {
            match payload {
                pb::sfu::signal_message::Payload::SdpAnswer(sdp) => {
                    info!(session = %session_key, "Applying SDP Answer");
                    let desc = RTCSessionDescription::answer(sdp).unwrap();
                    pc.set_remote_description(desc).await.map_err(|e| {
                        Status::internal(format!("Failed to set remote description: {}", e))
                    })?;
                }
                pb::sfu::signal_message::Payload::IceCandidate(candidate_str) => {
                    info!(session = %session_key, candidate = %candidate_str, "Applying ICE Candidate");
                    let candidate: RTCIceCandidateInit = match serde_json::from_str(&candidate_str) {
                        Ok(c) => c,
                        Err(e) => {
                            error!(session = %session_key, error = %e, "Failed to parse ICE candidate");
                            return Err(Status::internal(format!("Failed to parse ICE candidate: {}", e)));
                        }
                    };
                    
                    if let Err(e) = pc.add_ice_candidate(candidate).await {
                        error!(session = %session_key, error = %e, "Failed to add ICE candidate");
                    }
                }
                pb::sfu::signal_message::Payload::SdpOffer(sdp) => {
                    info!(session = %session_key, sdp_part = %sdp.chars().take(50).collect::<String>(), "Received SDP Offer");
                    let desc = RTCSessionDescription::offer(sdp).unwrap();
                    pc.set_remote_description(desc).await.map_err(|e| {
                        error!(session = %session_key, error = %e, "Failed to set remote description");
                        Status::internal(format!("Failed to set remote description: {}", e))
                    })?;

                    let answer = pc.create_answer(None).await.map_err(|e| {
                        Status::internal(format!("Failed to create answer: {}", e))
                    })?;
                    
                    let mut gather_complete = pc.gathering_complete_promise().await;
                    pc.set_local_description(answer).await.map_err(|e| {
                        Status::internal(format!("Failed to set local description: {}", e))
                    })?;
                    let _ = gather_complete.recv().await;
                    
                    let local_desc = pc.local_description().await.unwrap();
                    let mut sdp_answer = local_desc.sdp.clone();
                    
                    // Fix DTLS Role Flip: Ensure SFU stays passive if the browser offers actpass
                    // This prevents "Failed to set SSL role for the transport" in browsers.
                    if sdp_answer.contains("a=setup:active") {
                        sdp_answer = sdp_answer.replace("a=setup:active", "a=setup:passive");
                        info!(session = %session_key, "Modified Answer to setup:passive to prevent role flip");
                    }
                    
                    info!(session = %session_key, "Generated SDP Answer");

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
        let session_key = format!("{}:{}", req.room_id, req.user_id);
        if let Some((_, peer)) = self.peers.remove(&session_key) {
            info!(session = %session_key, "Deleting session and closing PeerConnection");
            let _ = peer.pc.close().await;
            
            // Cleanup: Remove any broadcast tracks belonging to this user
            let mut tracks_to_remove = Vec::new();
            for entry in self.tracks.iter() {
                let key = entry.key();
                // Format: "{room_id}:{user_id}:{stream_id}:{track_id}"
                if key.starts_with(&format!("{}:{}:", req.room_id, req.user_id)) {
                    tracks_to_remove.push(key.clone());
                }
            }
            
            for key in tracks_to_remove {
                info!(key = %key, "[SFU] Removing broadcast track");
                self.tracks.remove(&key);
            }
        }
        Ok(Response::new(DeleteSessionResponse { success: true }))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let addr = "0.0.0.0:50051".parse()?;
    let sfu = MySfu {
        peers: Arc::new(DashMap::new()),
        tracks: Arc::new(DashMap::new()),
    };
    info!("SFU Server listening on {}", addr);
    Server::builder()
        .add_service(SfuServiceServer::new(sfu))
        .serve(addr)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests;