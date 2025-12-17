use std::sync::Arc;
use dashmap::DashMap;
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

// Import the generated proto code
pub mod pb {
    include!("generated/sfu.rs");
}

use pb::sfu_service_server::{SfuService, SfuServiceServer};
use pb::{CreateSessionRequest, CreateSessionResponse, SignalMessage, SignalResponse};

// A "Peer" wraps the WebRTC Connection
struct Peer {
    pc: Arc<RTCPeerConnection>,
}

// The Server State
struct MySfu {
    // Thread-safe map: SessionID -> Peer
    peers: Arc<DashMap<String, Peer>>,
}

#[tonic::async_trait]
impl SfuService for MySfu {
    async fn create_session(
        &self,
        request: Request<CreateSessionRequest>,
    ) -> Result<Response<CreateSessionResponse>, Status> {
        let req = request.into_inner();
        let room_id = req.room_id;
        let user_id = req.user_id;
        
        println!("CreateSession called for room: {}, user: {}", room_id, user_id);

        // 1. Configure WebRTC Engine
        let mut media_engine = MediaEngine::default();
        media_engine.register_default_codecs().unwrap();
        
        let mut registry = Registry::new();
        registry = register_default_interceptors(registry, &mut media_engine).unwrap();

        let api = APIBuilder::new()
            .with_media_engine(media_engine)
            .with_interceptor_registry(registry)
            .build();

        // 2. Configure ICE (STUN servers)
        let config = RTCConfiguration {
            ice_servers: vec![RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_owned()],
                ..Default::default()
            }],
            ..Default::default()
        };

        // 3. Create the Peer Connection
        let pc = api.new_peer_connection(config).await.map_err(|e| {
            Status::internal(format!("Failed to create peer connection: {}", e))
        })?;

        // 4. Add a Transceiver to RECEIVE Video
        // This tells the browser "I am ready to accept 1 video track"
        pc.add_transceiver_from_kind(
            webrtc::rtp_transceiver::rtp_codec::RTPCodecType::Video,
            Some(RTCRtpTransceiverInit {
                direction: RTCRtpTransceiverDirection::Recvonly,
                send_encodings: vec![],
            }),
        )
        .await
        .map_err(|e| Status::internal(format!("Failed to add transceiver: {}", e)))?;

        // 5. Create Offer
        let offer = pc.create_offer(None).await.map_err(|e| {
            Status::internal(format!("Failed to create offer: {}", e))
        })?;

        // 6. Set Local Description (This starts the ICE gathering process)
        let mut gather_complete = pc.gathering_complete_promise().await;
        pc.set_local_description(offer).await.map_err(|e| {
            Status::internal(format!("Failed to set local description: {}", e))
        })?;
        
        // Wait for ICE gathering to finish (Simplest way for MVP)
        let _ = gather_complete.recv().await;

        // 7. Get the final SDP (with candidates)
        let local_desc = pc.local_description().await.unwrap();
        let sdp = local_desc.sdp;

        // 8. Save to Memory
        let session_key = format!("{}:{}", room_id, user_id);
        let peer = Peer { pc: Arc::new(pc) };
        self.peers.insert(session_key.clone(), peer);

        println!("Session created for {}", session_key);

        Ok(Response::new(CreateSessionResponse {
            sdp_offer: sdp,
        }))
    }

    async fn handle_signal(
        &self,
        request: Request<SignalMessage>,
    ) -> Result<Response<SignalResponse>, Status> {
        let req = request.into_inner();
        let session_key = format!("{}:{}", req.room_id, req.user_id);

        // 1. Find the Peer
        let peer = match self.peers.get(&session_key) {
            Some(p) => p,
            None => return Err(Status::not_found("Session not found")),
        };

        let pc = &peer.pc;

        // 2. Handle the specific signal type
        if let Some(payload) = req.payload {
            match payload {
                pb::signal_message::Payload::SdpAnswer(sdp) => {
                    println!("Applying SDP Answer for {}", session_key);
                    let desc = RTCSessionDescription::answer(sdp).unwrap();
                    pc.set_remote_description(desc).await.map_err(|e| {
                        Status::internal(format!("Failed to set remote description: {}", e))
                    })?;
                }
                pb::signal_message::Payload::IceCandidate(_candidate_json) => {
                    println!("Adding ICE Candidate for {}", session_key);
                    // Parse JSON to ICE Candidate (Assuming frontend sends JSON)
                    // For MVP, we might skip this if we wait for gathering to complete on both sides
                    // But usually: pc.add_ice_candidate(candidate).await...
                }
            }
        }

        Ok(Response::new(SignalResponse { success: true }))
    }

    async fn delete_session(
        &self,
        request: Request<pb::DeleteSessionRequest>,
    ) -> Result<Response<pb::DeleteSessionResponse>, Status> {
        let req = request.into_inner();
        let session_key = format!("{}:{}", req.room_id, req.user_id);

        println!("DeleteSession called for {}", session_key);

        // Remove the peer connection from the map
        match self.peers.remove(&session_key) {
            Some(_) => {
                println!("Session deleted: {}", session_key);
                Ok(Response::new(pb::DeleteSessionResponse { success: true }))
            }
            None => {
                Err(Status::not_found(format!("Session not found: {}", session_key)))
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();

    let addr = "0.0.0.0:50051".parse()?;
    let sfu = MySfu {
        peers: Arc::new(DashMap::new()),
    };

    println!("SFU Server listening on {}", addr);

    Server::builder()
        .add_service(SfuServiceServer::new(sfu))
        .serve(addr)
        .await?;

    Ok(())
}