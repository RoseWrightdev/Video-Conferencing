use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{debug, error, info, warn};
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::{TrackLocal, TrackLocalWriter};

use crate::metrics::{
    SFU_KEYFRAMES_REQUESTED_TOTAL, SFU_PACKETS_DROPPED_TOTAL, SFU_PACKETS_FORWARDED_TOTAL,
};

pub struct BroadcasterWriter {
    pub tx: mpsc::Sender<webrtc::rtp::packet::Packet>,
    pub ssrc: u32,
    pub payload_type: u8,
}

pub struct TrackBroadcaster {
    pub writers: crate::types::SharedBroadcasterWriters,
    pub kind: String,
    pub capability: RTCRtpCodecCapability,
    pub source_pc: Arc<RTCPeerConnection>,
    pub source_ssrc: u32,
    pub last_keyframe_ts: Arc<std::sync::atomic::AtomicI64>,
}

impl TrackBroadcaster {
    pub fn new(
        kind: String,
        capability: RTCRtpCodecCapability,
        source_pc: Arc<RTCPeerConnection>,
        source_ssrc: u32,
    ) -> Self {
        Self {
            writers: Arc::new(RwLock::new(Vec::new())),
            kind,
            capability,
            source_pc,
            source_ssrc,
            last_keyframe_ts: Arc::new(std::sync::atomic::AtomicI64::new(0)),
        }
    }

    pub async fn add_writer(&self, track: Arc<TrackLocalStaticRTP>, ssrc: u32, payload_type: u8) {
        // Buffer of 128 packets. At 50fps video, this is ~2.5 seconds.
        // For audio (20ms packets), this is ~2.5 seconds.
        let (tx, mut rx) = mpsc::channel::<webrtc::rtp::packet::Packet>(128);

        let mut writers = self.writers.write().await;
        writers.push(BroadcasterWriter {
            tx,
            ssrc,
            payload_type,
        });

        let kind = self.kind.clone();
        let track_id = track.id().to_owned();

        // Spawn dedicated sender task for this writer
        tokio::spawn(async move {
            debug!(kind = %kind, track = %track_id, "[SFU] Started writer task");
            while let Some(packet) = rx.recv().await {
                if let Err(e) = track.write_rtp(&packet).await {
                    if e.to_string().contains("Broken pipe")
                        || e.to_string().contains("Connection reset")
                    {
                        debug!(kind = %kind, track = %track_id, "[SFU] Writer task finishing: peer disconnected");
                    } else {
                        warn!(kind = %kind, track = %track_id, error = %e, "[SFU] Error writing RTP to track");
                    }
                    break;
                }
            }
            debug!(kind = %kind, track = %track_id, "[SFU] Writer task exiting");
        });

        info!(
            kind = %self.kind,
            ssrc = %ssrc,
            payload_type = %payload_type,
            "[SFU] Added writer for track"
        );
        self.request_keyframe().await;
    }

    pub fn mark_keyframe_received(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        self.last_keyframe_ts
            .store(now, std::sync::atomic::Ordering::Relaxed);
    }

    pub async fn request_keyframe(&self) {
        if self.kind != "video" {
            return;
        }

        info!(source_ssrc = %self.source_ssrc, "[SFU] Requesting keyframe");
        SFU_KEYFRAMES_REQUESTED_TOTAL.inc();
        let pli = PictureLossIndication {
            sender_ssrc: 0,
            media_ssrc: self.source_ssrc,
        };
        if let Err(e) = self.source_pc.write_rtcp(&[Box::new(pli)]).await {
            error!(source_ssrc = %self.source_ssrc, error = %e, "[SFU] Failed to send Keyframe Request (PLI)");
        } else {
            debug!(source_ssrc = %self.source_ssrc, "[SFU] Sent Keyframe Request (PLI)");
        }
    }

    pub fn schedule_pli_retry(self: Arc<Self>) {
        tokio::spawn(async move {
            self.request_keyframe().await;
            let start_time = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64;

            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            let last = self
                .last_keyframe_ts
                .load(std::sync::atomic::Ordering::Relaxed);
            if last < start_time {
                info!("[SFU] No keyframe received in 500ms, retrying PLI");
                self.request_keyframe().await;
            } else {
                debug!("[SFU] Keyframe received, skipping retry");
            }
        });
    }

    /// Optimized broadcast: non-blocking send to all writer tasks.
    /// If a writer's channel is full, the packet is dropped for that peer only.
    pub async fn broadcast(&self, packet: &mut webrtc::rtp::packet::Packet) {
        let writers = self.writers.read().await;
        if writers.is_empty() {
            return;
        }

        for w in writers.iter() {
            let mut packet_clone = packet.clone();
            packet_clone.header.ssrc = w.ssrc;
            if w.payload_type != 0 {
                packet_clone.header.payload_type = w.payload_type;
            }

            // Non-blocking send: if the peer is lagging, drop the packet
            // rather than stalling the entire SFU read loop.
            if let Err(e) = w.tx.try_send(packet_clone) {
                match e {
                    mpsc::error::TrySendError::Full(_) => {
                        SFU_PACKETS_DROPPED_TOTAL
                            .with_label_values(&["buffer_full"])
                            .inc();
                        // Only log occasionally to avoid log flooding
                        static DROP_COUNT: std::sync::atomic::AtomicU64 =
                            std::sync::atomic::AtomicU64::new(0);
                        let count = DROP_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        if count.is_multiple_of(100) {
                            warn!(kind = %self.kind, ssrc = %w.ssrc, "[SFU] Writer channel full, dropping packet (total dropped: {})", count + 1);
                        }
                    }
                    mpsc::error::TrySendError::Closed(_) => {
                        SFU_PACKETS_DROPPED_TOTAL
                            .with_label_values(&["channel_closed"])
                            .inc();
                        // Peer session likely closed, entry will be cleaned up eventually
                    }
                }
            } else {
                SFU_PACKETS_FORWARDED_TOTAL
                    .with_label_values(&[&self.kind])
                    .inc();
            }
        }
    }
}
