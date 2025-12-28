use dashmap::DashMap;
use std::sync::Arc;
use tracing::{debug, error, info, trace, warn};
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::TrackLocal;
use webrtc::track::track_remote::TrackRemote;

use crate::broadcaster::TrackBroadcaster;
use crate::pb;
use crate::peer_manager::Peer;
use crate::signaling_handler::perform_renegotiation;

pub fn attach_track_handler(
    pc: &Arc<RTCPeerConnection>,
    user_id: String,
    room_id: String,
    peers: Arc<DashMap<(String, String), Peer>>,
    tracks: Arc<DashMap<(String, String, String, String), Arc<TrackBroadcaster>>>,
) {
    let peers_clone = peers.clone();
    let tracks_map = tracks.clone();
    let user_id_clone = user_id.clone();
    let room_id_clone = room_id.clone();
    let pc_for_ontrack = pc.clone();

    pc.on_track(Box::new(move |track: Arc<TrackRemote>, _receiver, _transceiver| {
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
            let broadcaster = Arc::new(TrackBroadcaster::new(
                track_kind.clone(),
                capability,
                pc_capture,
                track_ssrc,
            ));

            let track_key = (
                room_id.clone(),
                user_id.clone(),
                track.stream_id().to_owned(),
                track.id().to_owned(),
            );
            info!(?track_key, "[SFU] Created broadcaster for track");
            tracks_map.insert(track_key, broadcaster.clone());

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

                        let rtp_sender = match other_peer_pc
                            .add_track(Arc::clone(&local_track) as Arc<dyn TrackLocal + Send + Sync>)
                            .await
                        {
                            Ok(s) => s,
                            Err(e) => {
                                error!(peer = %other_peer_user_id, error = %e, "Error adding track to peer");
                                return;
                            }
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
                        other_peer_track_mapping
                            .insert(track_stream_id_clone.clone(), source_user_id.clone());

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
                            }),
                        )
                        .await;
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
                        Ok((mut packet, _)) => {
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
                                trace!(
                                    count = %packet_count,
                                    track = %track_id_log,
                                    "[SFU] Forwarded packets"
                                );
                            }

                            // Use optimized broadcast method
                            broadcaster.broadcast(&mut packet).await;
                        }
                        Err(e) => {
                            warn!(
                                track = %track_id_log,
                                error = %e,
                                "[SFU] Track loop finished: Error. (Note: 'DataChannel not opened' usually means Transport Closed)"
                            );
                            break;
                        }
                    }
                }
            });
        })
    }));
}
