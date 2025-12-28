use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::TrackLocalWriter;

pub struct BroadcasterWriter {
    pub track: Arc<TrackLocalStaticRTP>,
    pub ssrc: u32,
    pub payload_type: u8,
}

pub struct TrackBroadcaster {
    pub writers: Arc<RwLock<Vec<BroadcasterWriter>>>,
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

    pub async fn add_writer(&self, writer: Arc<TrackLocalStaticRTP>, ssrc: u32, payload_type: u8) {
        let mut writers = self.writers.write().await;
        writers.push(BroadcasterWriter {
            track: writer,
            ssrc,
            payload_type,
        });
        info!(
            kind = %self.kind,
            ssrc = %ssrc,
            payload_type = %payload_type,
            "[SFU] Added writer for track"
        );
        // We use schedule_pli_retry when adding a writer now?
        // No, add_writer calls request_keyframe() originally.
        // The burst was called externally.
        // I'll leave request_keyframe() here or remove it if schedule_pli_retry does it.
        // Original add_writer called request_keyframe().
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
        let pli = PictureLossIndication {
            sender_ssrc: 0,
            media_ssrc: self.source_ssrc,
        };
        // Use write_rtcp on the source PC
        if let Err(e) = self.source_pc.write_rtcp(&[Box::new(pli)]).await {
            tracing::error!(source_ssrc = %self.source_ssrc, error = %e, "[SFU] Failed to send Keyframe Request (PLI)");
        } else {
            tracing::debug!(source_ssrc = %self.source_ssrc, "[SFU] Sent Keyframe Request (PLI)");
        }
    }

    pub fn schedule_pli_retry(self: Arc<Self>) {
        tokio::spawn(async move {
            // Smart Retry: Send one now, check in 500ms
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
                tracing::debug!("[SFU] Keyframe received, skipping retry");
            }
        });
    }

    /// Optimized broadcast loop: clones packet only when necessary (modifying SSRC/PT)
    /// and avoids deep cloning of payload if we can help it (though helper writes usually take &Packet).
    pub async fn broadcast(&self, packet: &mut webrtc::rtp::packet::Packet) {
        let writers = self.writers.read().await;
        for w in writers.iter() {
            // We must modify SSRC and PT for the outgoing track.
            // Writing to TrackLocalStaticRTP usually takes a reference, but since we modify header,
            // we have to clone the packet header at least. Payload is Bytes, so cloning it is cheap (Arc logic).

            let mut packet_clone = packet.clone();
            packet_clone.header.ssrc = w.ssrc;
            if w.payload_type != 0 {
                packet_clone.header.payload_type = w.payload_type;
            }

            if let Err(_e) = w.track.write_rtp(&packet_clone).await {
                // debug!(error = %_e, "Error forwarding packet");
                // "Broken pipe" is common if peer disconnected
            }
        }
    }
}
