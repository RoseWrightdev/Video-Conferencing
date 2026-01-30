use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tracing::{debug, error, info, warn};
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::TrackLocalWriter;

use crate::metrics::{
    SFU_KEYFRAMES_REQUESTED_TOTAL, SFU_PACKETS_DROPPED_TOTAL, SFU_PACKETS_FORWARDED_TOTAL,
};

/// Represents a single subscriber to a broadcast track.
/// Holds the channel to the writer task and the negotiated SSRC/PayloadType.
pub struct BroadcasterWriter {
    /// Channel to send packets to the dedicated writer task.
    pub tx: mpsc::Sender<webrtc::rtp::packet::Packet>,
    /// The SSRC to use for rewriting packets for this subscriber.
    pub ssrc: u32,
    /// The Payload Type to use for rewriting packets.
    pub payload_type: u8,
}

/// Manages the fan-out of a single source track to multiple subscribers (writers).
/// Handles RTP packet forwarding, SSRC/PT rewriting, and Keyframe requests (PLI).
pub struct TrackBroadcaster {
    /// Thread-safe list of active writers (subscribers).
    pub writers: crate::types::SharedBroadcasterWriters,
    /// Kind of the track ("video" or "audio").
    pub kind: String,
    /// Codec capabilities of the source track.
    pub capability: RTCRtpCodecCapability,
    /// The PeerConnection of the source (publisher). Used to send RTCP PLI.
    pub source_pc: Arc<RTCPeerConnection>,
    /// The SSRC of the source track. Using for RTCP PLI targeting.
    pub source_ssrc: u32,
    /// Timestamp of the last received keyframe (used for throttling PLI requests).
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

    /// Adds a new subscriber (writer) to this broadcaster.
    ///
    /// Spawns a dedicated task that listens on a channel and writes RTP packets to the `TrackLocalWriter` (the subscriber's track).
    /// Handles channel buffering and writes errors (e.g., peer disconnect).
    ///
    /// # Arguments
    /// * `writer` - The local track writer for the subscriber.
    /// * `track_id` - ID of the track for logging.
    /// * `ssrc` - The SSRC to use for the subscriber.
    /// * `payload_type` - The Payload Type to use for the subscriber.
    pub async fn add_writer(
        &self,
        writer: Arc<dyn TrackLocalWriter + Send + Sync>,
        track_id: String,
        ssrc: u32,
        payload_type: u8,
    ) {
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

        // Spawn dedicated sender task for this writer
        tokio::spawn(async move {
            debug!(kind = %kind, track = %track_id, "[SFU] Started writer task");
            while let Some(packet) = rx.recv().await {
                if let Err(e) = writer.write_rtp(&packet).await {
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

    /// Sends a Picture Loss Indication (PLI) to the source to request a new keyframe.
    /// Only applicable for video tracks.
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

    /// Broadcasts a single RTP packet to all active subscribers.
    ///
    /// - Rewrites SSRC and Payload Type for each subscriber.
    /// - Uses non-blocking channel sends (`try_send`). If a subscriber is lagging (channel full), the packet is dropped for that subscriber to protect global performance.
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

#[cfg(test)]
mod tests {
    use super::*;
    use webrtc::api::APIBuilder;
    use webrtc::peer_connection::configuration::RTCConfiguration;
    use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;

    #[tokio::test]
    async fn test_broadcaster_add_writer_and_broadcast() {
        let api = APIBuilder::new().build();
        let pc = Arc::new(
            api.new_peer_connection(RTCConfiguration::default())
                .await
                .unwrap(),
        );
        let codec = RTCRtpCodecCapability {
            mime_type: "video/VP8".to_owned(),
            ..Default::default()
        };
        let broadcaster =
            TrackBroadcaster::new("video".to_string(), codec.clone(), pc.clone(), 12345);

        let track = Arc::new(TrackLocalStaticRTP::new(
            codec,
            "track1".to_owned(),
            "stream1".to_owned(),
        ));

        // Add writer
        broadcaster
            .add_writer(track.clone(), "track1".to_string(), 111, 96)
            .await;

        assert_eq!(broadcaster.writers.read().await.len(), 1);

        // Broadcast a packet
        let mut packet = webrtc::rtp::packet::Packet::default();
        packet.header.ssrc = 12345;
        packet.payload = vec![1, 2, 3].into();

        broadcaster.broadcast(&mut packet).await;
    }

    #[tokio::test]
    async fn test_request_keyframe() {
        let api = APIBuilder::new().build();
        let pc = Arc::new(
            api.new_peer_connection(RTCConfiguration::default())
                .await
                .unwrap(),
        );
        let codec = RTCRtpCodecCapability {
            mime_type: "video/VP8".to_owned(),
            ..Default::default()
        };
        let broadcaster = TrackBroadcaster::new("video".to_string(), codec, pc, 12345);

        broadcaster.request_keyframe().await;

        let broadcaster_audio = TrackBroadcaster::new(
            "audio".to_string(),
            RTCRtpCodecCapability::default(),
            Arc::clone(&broadcaster.source_pc),
            12345,
        );
        broadcaster_audio.request_keyframe().await;
    }

    #[derive(Debug)]
    struct MockTrackWriter {
        fail_kind: Option<std::io::ErrorKind>,
        fail_msg: Option<String>,
        write_called: Arc<tokio::sync::Mutex<bool>>,
    }

    #[async_trait::async_trait]
    impl TrackLocalWriter for MockTrackWriter {
        async fn write_rtp(
            &self,
            _p: &webrtc::rtp::packet::Packet,
        ) -> Result<usize, webrtc::Error> {
            *self.write_called.lock().await = true;
            if let Some(_kind) = self.fail_kind {
                let msg = self.fail_msg.clone().unwrap_or("MOCK ERROR".to_string());
                // Use generic error construction
                return Err(webrtc::Error::new(msg));
            }
            Ok(100)
        }
        async fn write(&self, _b: &[u8]) -> Result<usize, webrtc::Error> {
            Ok(0)
        }
    }

    #[tokio::test]
    async fn test_broadcaster_writer_error_handling() {
        let api = APIBuilder::new().build();
        let config = RTCConfiguration::default();
        let pc = Arc::new(api.new_peer_connection(config).await.unwrap());
        let codec = RTCRtpCodecCapability {
            mime_type: "video/vp8".into(),
            ..Default::default()
        };
        let broadcaster = TrackBroadcaster::new("video".into(), codec, pc, 12345);

        // 1. Test "Broken pipe" (should be debug log)
        let called1 = Arc::new(tokio::sync::Mutex::new(false));
        let writer1 = Arc::new(MockTrackWriter {
            fail_kind: Some(std::io::ErrorKind::BrokenPipe),
            fail_msg: Some("Broken pipe".into()),
            write_called: called1.clone(),
        });

        broadcaster.add_writer(writer1, "w1".into(), 111, 96).await;

        let mut packet = webrtc::rtp::packet::Packet::default();
        packet.header.ssrc = 12345;

        broadcaster.broadcast(&mut packet).await;

        // Give time for async task
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        assert!(*called1.lock().await);

        // 2. Test Other Error (should be warn log)
        let called2 = Arc::new(tokio::sync::Mutex::new(false));
        let writer2 = Arc::new(MockTrackWriter {
            fail_kind: Some(std::io::ErrorKind::Other),
            fail_msg: Some("Random failure".into()),
            write_called: called2.clone(),
        });

        broadcaster.add_writer(writer2, "w2".into(), 222, 96).await;
        broadcaster.broadcast(&mut packet).await;

        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        assert!(*called2.lock().await);
    }
}
