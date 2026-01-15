use std::env;
use tracing::error;
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::policy::bundle_policy::RTCBundlePolicy;
use webrtc::rtp_transceiver::rtp_codec::{
    RTCRtpCodecCapability, RTCRtpHeaderExtensionCapability, RTPCodecType,
};

pub struct MediaSetup;

impl MediaSetup {
    pub fn create_webrtc_api() -> webrtc::api::API {
        let mut media_engine = MediaEngine::default();

        // Register Opus with FEC and low latency settings
        use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecParameters;
        media_engine
            .register_codec(
                RTCRtpCodecParameters {
                    capability: RTCRtpCodecCapability {
                        mime_type: "audio/opus".to_owned(),
                        clock_rate: 48000,
                        channels: 2,
                        sdp_fmtp_line: "minptime=10;useinbandfec=1".to_owned(),
                        ..Default::default()
                    },
                    payload_type: 111,
                    ..Default::default()
                },
                RTPCodecType::Audio,
            )
            .unwrap_or_else(|e| {
                panic!("Failed to register Opus codec: {}", e);
            });

        // Register Video Codecs (VP8, H264)
        media_engine
            .register_codec(
                RTCRtpCodecParameters {
                    capability: RTCRtpCodecCapability {
                        mime_type: "video/VP8".to_owned(),
                        clock_rate: 90000,
                        channels: 0,
                        sdp_fmtp_line: "".to_owned(),
                        ..Default::default()
                    },
                    payload_type: 96,
                    ..Default::default()
                },
                RTPCodecType::Video,
            )
            .unwrap_or_else(|e| {
                panic!("Failed to register VP8 codec: {}", e);
            });

        media_engine
            .register_codec(
                RTCRtpCodecParameters {
                    capability: RTCRtpCodecCapability {
                        mime_type: "video/H264".to_owned(),
                        clock_rate: 90000,
                        channels: 0,
                        sdp_fmtp_line:
                            "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"
                                .to_owned(),
                        ..Default::default()
                    },
                    payload_type: 102,
                    ..Default::default()
                },
                RTPCodecType::Video,
            )
            .unwrap_or_else(|e| {
                error!("Failed to register H264 codec: {}", e);
            });

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
                RTCRtpHeaderExtensionCapability {
                    uri: extension.to_string(),
                },
                RTPCodecType::Video,
                None,
            );
            let _ = media_engine.register_header_extension(
                RTCRtpHeaderExtensionCapability {
                    uri: extension.to_string(),
                },
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

    pub fn get_rtc_config() -> RTCConfiguration {
        let stun_url =
            env::var("STUN_URL").unwrap_or_else(|_| "stun:stun.l.google.com:19302".to_string());

        RTCConfiguration {
            ice_servers: vec![RTCIceServer {
                urls: vec![stun_url],
                ..Default::default()
            }],
            bundle_policy: RTCBundlePolicy::MaxBundle,
            ..Default::default()
        }
    }

    pub async fn subscribe_to_existing_tracks(
        peer: &crate::peer_manager::Peer,
        user_id: &str,
        room_id: &str,
        tracks: &dashmap::DashMap<
            (String, String, String, String),
            std::sync::Arc<crate::broadcaster::TrackBroadcaster>,
        >,
    ) {
        use std::sync::Arc;
        use tracing::info;
        use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
        use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
        use webrtc::track::track_local::TrackLocal;

        for track_entry in tracks.iter() {
            let (t_room, t_user, t_stream, t_track) = track_entry.key();

            // Filter: Must be same room, different user
            if t_room == room_id && t_user != user_id {
                let broadcaster = track_entry.value();
                // t_stream, t_track, t_user are already &String here

                let local_track = Arc::new(TrackLocalStaticRTP::new(
                    broadcaster.capability.clone(),
                    t_track.clone(),
                    t_stream.clone(),
                ));

                if let Ok(rtp_sender) = peer
                    .pc
                    .add_track(Arc::clone(&local_track) as Arc<dyn TrackLocal + Send + Sync>)
                    .await
                {
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

                    let pt = {
                        if let Some(codec) = params.rtp_parameters.codecs.first() {
                            codec.payload_type
                        } else {
                            0
                        }
                    };

                    info!(
                        "[SFU] subscribe_to_existing_tracks: Resolved PT: {}, SSRC: {}",
                        pt, ssrc
                    );
                    broadcaster
                        .add_writer(local_track, t_track.clone(), ssrc, pt)
                        .await;

                    // delayed Keyframe Request
                    broadcaster.clone().schedule_pli_retry();
                    peer.track_mapping.insert(t_stream.clone(), t_user.clone());
                    info!(
                        track = %t_track,
                        user = %t_user,
                        new_peer = %user_id,
                        "[SFU] Added existing track to new peer"
                    );
                }
            }
        }
    }

    pub async fn configure_media_engine(
        pc: &webrtc::peer_connection::RTCPeerConnection,
    ) -> Result<(), tonic::Status> {
        use webrtc::rtp_transceiver::rtp_codec::RTPCodecType;
        use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;
        use webrtc::rtp_transceiver::RTCRtpTransceiverInit;

        pc.add_transceiver_from_kind(
            RTPCodecType::Video,
            Some(RTCRtpTransceiverInit {
                direction: RTCRtpTransceiverDirection::Recvonly,
                send_encodings: vec![],
            }),
        )
        .await
        .map_err(|e| tonic::Status::internal(format!("Failed to add video transceiver: {}", e)))?;

        pc.add_transceiver_from_kind(
            RTPCodecType::Audio,
            Some(RTCRtpTransceiverInit {
                direction: RTCRtpTransceiverDirection::Recvonly,
                send_encodings: vec![],
            }),
        )
        .await
        .map_err(|e| tonic::Status::internal(format!("Failed to add audio transceiver: {}", e)))?;

        Ok(())
    }
}
