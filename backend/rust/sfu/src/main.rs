use std::sync::Arc;
use tokio::sync::Mutex;
use dashmap::DashMap;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{transport::Server, Request, Response, Status};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;
use webrtc::rtp_transceiver::RTCRtpTransceiverInit;
use webrtc::track::track_local::TrackLocal;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::TrackLocalWriter;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_remote::TrackRemote;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::rtp_transceiver::rtp_codec::{RTPCodecType, RTCRtpHeaderExtensionCapability};
use webrtc::peer_connection::policy::bundle_policy::RTCBundlePolicy;
use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use serde_json;

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

// A "Peer" wraps the WebRTC Connection
struct Peer {
    pc: Arc<RTCPeerConnection>,
    user_id: String,
    room_id: String,
    // Channel to send events (TrackAdded, Renegotiation) to Go -> Frontend
    event_tx: Arc<Mutex<Option<mpsc::Sender<Result<SfuEvent, Status>>>>>,
    // Map from StreamID (in this peer's PC) to Source UserID
    track_mapping: Arc<DashMap<String, String>>,
    // Ensure only one negotiation happens at a time per peer
    signaling_lock: Arc<Mutex<()>>,
}

// TrackBroadcaster holds the list of writers (other peers) for a single incoming track
struct BroadcasterWriter {
    track: Arc<TrackLocalStaticRTP>,
    ssrc: u32,
}

struct TrackBroadcaster {
    writers: Arc<Mutex<Vec<BroadcasterWriter>>>,
    kind: String,
    capability: RTCRtpCodecCapability,
    source_pc: Arc<RTCPeerConnection>,
    source_ssrc: u32,
}

impl TrackBroadcaster {
    fn new(kind: String, capability: RTCRtpCodecCapability, source_pc: Arc<RTCPeerConnection>, source_ssrc: u32) -> Self {
        Self {
            writers: Arc::new(Mutex::new(Vec::new())),
            kind,
            capability,
            source_pc,
            source_ssrc,
        }
    }

    async fn add_writer(&self, writer: Arc<TrackLocalStaticRTP>, ssrc: u32) {
        let mut writers = self.writers.lock().await;
        writers.push(BroadcasterWriter { track: writer, ssrc });
        self.request_keyframe().await;
    }

    // Call this when any consumer sends a PLI (Picture Loss Indication)
    // It forwards the request to the source client to generate a new keyframe.
    async fn request_keyframe(&self) {
        if self.kind != "video" { return; }
        
        println!("[SFU] Requesting keyframe for SSRC {}", self.source_ssrc);
        let pli = PictureLossIndication {
            sender_ssrc: 0, 
            media_ssrc: self.source_ssrc,
        };
        // Use write_rtcp on the source PC
        let _ = self.source_pc.write_rtcp(&[Box::new(pli)]).await;
    }
}

// The Server State
struct MySfu {
    // Thread-safe map: SessionID -> Peer
    peers: Arc<DashMap<String, Peer>>,
    // Map: RoomID -> [List of Active Broadcasters (Source UserID, StreamID, TrackID) -> Broadcaster]
    // Key: "room_id:user_id:stream_id:track_id"
    tracks: Arc<DashMap<String, Arc<TrackBroadcaster>>>,
}

// Helper functions for Signaling & Media
fn create_webrtc_api() -> webrtc::api::API {
    let mut media_engine = MediaEngine::default();
    media_engine.register_default_codecs().unwrap();
    
    let extensions = vec![
        "urn:ietf:params:rtp-hdrext:sdes:mid",
        "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
        "urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
        "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
        "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
        "urn:ietf:params:rtp-hdrext:ssrc-audio-level",
        "urn:ietf:params:rtp-hdrext:toffset",
        "urn:3gpp:video-orientation",
        "http://www.webrtc.org/experiments/rtp-hdrext/video-content-type",
    ];

    for extension in extensions {
        let _ = media_engine.register_header_extension(
            RTCRtpHeaderExtensionCapability { uri: extension.to_string() },
            RTPCodecType::Video,
            None,
        );
        let _ = media_engine.register_header_extension(
            RTCRtpHeaderExtensionCapability { uri: extension.to_string() },
            RTPCodecType::Audio,
            None,
        );
    }
    
    let mut registry = Registry::new();
    registry = register_default_interceptors(registry, &mut media_engine).unwrap();

    APIBuilder::new()
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .build()
}

async fn perform_renegotiation(
    peer_pc: Arc<RTCPeerConnection>, 
    event_tx: Arc<Mutex<Option<mpsc::Sender<Result<SfuEvent, Status>>>>>,
    user_id: String,
    signaling_lock: Arc<Mutex<()>>,
    track_mapping_event: Option<pb::signaling::TrackAddedEvent>,
) {
    let _guard = signaling_lock.lock().await;

    // A. Add track mapping if provided
    if let Some(event) = track_mapping_event {
        let mut tx_lock = event_tx.lock().await;
        if let Some(tx) = tx_lock.as_mut() {
            let _ = tx.send(Ok(SfuEvent {
                payload: Some(EventPayload::TrackEvent(event)),
            })).await;
            println!("[SFU] TrackAdded event sent to channel for {}", user_id);
        }
    }

    // B. Create Offer
    let offer = match peer_pc.create_offer(None).await {
        Ok(o) => o,
        Err(e) => { println!("Failed to create offer for {}: {}", user_id, e); return; }
    };

    use webrtc::ice_transport::ice_gathering_state::RTCIceGatheringState;
    let mut gather_complete = peer_pc.gathering_complete_promise().await;

    if let Err(e) = peer_pc.set_local_description(offer).await {
        println!("Failed to set local desc for {}: {}", user_id, e); return;
    }

    if peer_pc.ice_gathering_state() != RTCIceGatheringState::Complete {
        println!("[SFU] Waiting for ICE gathering for {}", user_id);
        let _ = tokio::time::timeout(tokio::time::Duration::from_millis(1500), gather_complete.recv()).await;
    }

    // C. Send Offer
    let local_desc = peer_pc.local_description().await.unwrap_or_default();
    println!("[SFU] Sending Renegotiation Offer to {} (SDP length: {})", user_id, local_desc.sdp.len());
    
    let mut tx_lock = event_tx.lock().await;
    if let Some(tx) = tx_lock.as_mut() {
        let _ = tx.send(Ok(SfuEvent {
            payload: Some(EventPayload::RenegotiateSdpOffer(local_desc.sdp)),
        })).await;
        println!("[SFU] Renegotiation message sent to channel for {}", user_id);
    } else {
        println!("[SFU] !! Event channel for {} is CLOSED or None", user_id);
    }
}

impl MySfu {
    async fn subscribe_to_existing_tracks(&self, peer: &Peer, user_id: &str, room_id: &str) {
        for track_entry in self.tracks.iter() {
            let key = track_entry.key();
            let parts: Vec<&str> = key.split(':').collect();
            if parts.len() == 4 && parts[0] == room_id && parts[1] != user_id {
                let broadcaster = track_entry.value();
                let t_stream = parts[2];
                let t_track = parts[3];
                let t_user = parts[1];

                let local_track = Arc::new(TrackLocalStaticRTP::new(
                    broadcaster.capability.clone(),
                    t_track.to_owned(),
                    t_stream.to_owned(),
                ));
               
                if let Ok(rtp_sender) = peer.pc.add_track(Arc::clone(&local_track) as Arc<dyn TrackLocal + Send + Sync>).await {
                    let sender_clone = rtp_sender.clone();
                    let broadcaster_to_move = broadcaster.clone();
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
                    broadcaster.add_writer(local_track, ssrc).await;
                    peer.track_mapping.insert(t_stream.to_owned(), t_user.to_owned());
                    println!("[SFU] Added existing track {} (user {}) to new peer {}", t_track, t_user, user_id);
                }
            }
        }
    }
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
        
        println!("CreateSession called for room: {}, user: {}", room_id, user_id);

        // 1. Configure WebRTC Engine
        let api = create_webrtc_api();

        // 2. Configure ICE (STUN servers)
        let config = RTCConfiguration {
            ice_servers: vec![RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_owned()],
                ..Default::default()
            }],
            bundle_policy: RTCBundlePolicy::MaxBundle,
            ..Default::default()
        };

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
             println!("[SFU] ICE Connection State for {} has changed: {}", user_id_ice_state, s);
             Box::pin(async {})
        }));
        
        let user_id_pc_state = user_id.clone();
        pc.on_peer_connection_state_change(Box::new(move |s: RTCPeerConnectionState| {
             println!("[SFU] Peer Connection State for {} has changed: {}", user_id_pc_state, s);
             Box::pin(async {})
        }));

        let event_tx = Arc::new(Mutex::new(None::<mpsc::Sender<Result<SfuEvent, Status>>>));
        let event_tx_clone = event_tx.clone();
        let user_id_ice_candidate = user_id.clone();
        pc.on_ice_candidate(Box::new(move |c: Option<webrtc::ice_transport::ice_candidate::RTCIceCandidate>| {
            let event_tx_inner = event_tx_clone.clone();
            let user_id_inner = user_id_ice_candidate.clone();
            Box::pin(async move {
                if let Some(candidate) = c {
                    println!("[SFU] Generated ICE candidate for {}", user_id_inner);
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

        let peer_pc = Arc::new(pc);
        let track_mapping = Arc::new(DashMap::new());
        
        // We need to initialize MySfu with the new field too, but `sfu` var in main is already created.
        // Wait, I need to update `main` fn too.
        
        let peer = Peer { 
            pc: peer_pc.clone(),
            user_id: user_id.clone(),
            room_id: room_id.clone(),
            event_tx: event_tx.clone(),
            track_mapping: track_mapping.clone(),
            signaling_lock: Arc::new(Mutex::new(())),
        };

        // 5. Initial Sync: Subscribe to EXISTING tracks from other peers
        self.subscribe_to_existing_tracks(&peer, &user_id, &room_id).await;
        
        
        
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
            println!("[SFU] on_track triggered! User: {}, Kind: {}, StreamId: {}, TrackId: {}, SSRC: {}", user_id_clone, track_kind, track.stream_id(), track_id, track_ssrc);
            
            let user_id = user_id_clone.clone();
            let room_id = room_id_clone.clone();
            let peers = peers_clone.clone();
            let tracks_map = tracks_map.clone();
            let pc_capture = pc_for_ontrack.clone();
            
            Box::pin(async move {
                println!("Received track from user: {}, kind: {}", user_id, track.kind());
                
                // 1. Create Broadcaster
                let capability = track.codec().capability.clone();
                let broadcaster = Arc::new(TrackBroadcaster::new(track_kind.clone(), capability, pc_capture, track_ssrc));
                let track_key = format!("{}:{}:{}:{}", room_id, user_id, track.stream_id(), track.id());
                println!("[SFU] Created broadcaster for track: {}", track_key);
                tracks_map.insert(track_key.clone(), broadcaster.clone());
                
                // 2. Notify Existing Peers & Add Writer to them
                println!("[SFU] Notifying {} peers about new track", peers.len());
                for peer_entry in peers.iter() {
                    let other_peer = peer_entry.value();
                    println!("[SFU] Checking peer {} in room {}", other_peer.user_id, other_peer.room_id);
                    if other_peer.room_id == room_id && other_peer.user_id != user_id {
                          println!("[SFU] Forwarding new track to {}", other_peer.user_id);
                          
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

                          tokio::spawn(async move {
                              let local_track = Arc::new(TrackLocalStaticRTP::new(
                                  capability_clone,
                                  track_id_clone.clone(),
                                  track_stream_id_clone.clone(),
                              ));
                             
                             let rtp_sender = match other_peer_pc.add_track(Arc::clone(&local_track) as Arc<dyn TrackLocal + Send + Sync>).await {
                                     Ok(s) => s,
                                     Err(e) => { println!("Error adding track to peer {}: {}", other_peer_user_id, e); return; }
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
                             broadcaster_clone.add_writer(local_track, ssrc).await;
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
                tokio::spawn(async move {
                    let mut packet_count = 0;
                    loop {
                         match track.read_rtp().await {
                             Ok((packet, _)) => {
                                 packet_count += 1;
                                 if packet_count % 100 == 0 {
                                     println!("[SFU] Forwarded 100 packets for track {}", track_id_log);
                                 }
                                 let writers = broadcaster.writers.lock().await;
                                 for w in writers.iter() {
                                     let mut packet = packet.clone();
                                     packet.header.ssrc = w.ssrc;
                                     if let Err(_e) = w.track.write_rtp(&packet).await {
                                         // println!("Error forwarding packet: {}", _e);
                                     }
                                 }
                             }
                             Err(e) => {
                                 println!("[SFU] Track loop finished for {}: {}", track_id_log, e);
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
            println!("[SFU] Waiting for initial ICE gathering for {}", session_key);
            let _ = tokio::time::timeout(tokio::time::Duration::from_millis(1500), gather_complete.recv()).await;
        }
        
        let local_desc = peer_pc.local_description().await.unwrap_or_default();
        let sdp = local_desc.sdp;
        
        println!("Session created for {}. Initial SDP Offer (Wait completed)", session_key);

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
        
        println!("ListenEvents called for {}", session_key);

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
                    println!("Applying SDP Answer for {}", session_key);
                    let desc = RTCSessionDescription::answer(sdp).unwrap();
                    pc.set_remote_description(desc).await.map_err(|e| {
                        Status::internal(format!("Failed to set remote description: {}", e))
                    })?;
                }
                pb::sfu::signal_message::Payload::IceCandidate(candidate_str) => {
                    println!("Applying ICE Candidate for {}: {}", session_key, candidate_str);
                    let candidate: RTCIceCandidateInit = match serde_json::from_str(&candidate_str) {
                        Ok(c) => c,
                        Err(e) => {
                            println!("Failed to parse ICE candidate from {}: {}", session_key, e);
                            return Err(Status::internal(format!("Failed to parse ICE candidate: {}", e)));
                        }
                    };
                    
                    if let Err(e) = pc.add_ice_candidate(candidate).await {
                        println!("Failed to add ICE candidate for {}: {}", session_key, e);
                    }
                }
                pb::sfu::signal_message::Payload::SdpOffer(sdp) => {
                    println!("Received SDP Offer for {}:\n{}", session_key, sdp);
                    let desc = RTCSessionDescription::offer(sdp).unwrap();
                    pc.set_remote_description(desc).await.map_err(|e| {
                        println!("Failed to set remote description for {}: {}", session_key, e);
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
                        println!("Modified Answer to setup:passive for {} to prevent role flip", session_key);
                    }
                    
                    println!("Generated SDP Answer for {}:\n{}", session_key, sdp_answer);

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
            println!("Deleting session and closing PeerConnection for {}", session_key);
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
                println!("[SFU] Removing broadcast track: {}", key);
                self.tracks.remove(&key);
            }
        }
        Ok(Response::new(DeleteSessionResponse { success: true }))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    let addr = "0.0.0.0:50051".parse()?;
    let sfu = MySfu {
        peers: Arc::new(DashMap::new()),
        tracks: Arc::new(DashMap::new()),
    };
    println!("SFU Server listening on {}", addr);
    Server::builder()
        .add_service(SfuServiceServer::new(sfu))
        .serve(addr)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests;