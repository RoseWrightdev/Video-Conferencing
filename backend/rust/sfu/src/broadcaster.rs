use std::sync::Arc;
use tokio::sync::Mutex;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use tracing::info;

pub struct BroadcasterWriter {
    pub track: Arc<TrackLocalStaticRTP>,
    pub ssrc: u32,
    pub payload_type: u8,
}

pub struct TrackBroadcaster {
    pub writers: Arc<Mutex<Vec<BroadcasterWriter>>>,
    pub kind: String,
    pub capability: RTCRtpCodecCapability,
    pub source_pc: Arc<RTCPeerConnection>,
    pub source_ssrc: u32,
}

impl TrackBroadcaster {
    pub fn new(kind: String, capability: RTCRtpCodecCapability, source_pc: Arc<RTCPeerConnection>, source_ssrc: u32) -> Self {
        Self {
            writers: Arc::new(Mutex::new(Vec::new())),
            kind,
            capability,
            source_pc,
            source_ssrc,
        }
    }

    pub async fn add_writer(&self, writer: Arc<TrackLocalStaticRTP>, ssrc: u32, payload_type: u8) {
        let mut writers = self.writers.lock().await;
        writers.push(BroadcasterWriter { track: writer, ssrc, payload_type });
        info!(
            kind = %self.kind,
            ssrc = %ssrc,
            payload_type = %payload_type,
            "[SFU] Added writer for track"
        );
        self.request_keyframe().await;
    }

    pub async fn request_keyframe(&self) {
        if self.kind != "video" { return; }
        
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

    pub fn schedule_keyframe_burst(self: Arc<Self>) {
        tokio::spawn(async move {
            // Burst keyframes to catch the receiver as soon as they are ready
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            info!("[SFU] Sending delayed Keyframe (1s)");
            self.request_keyframe().await;
            
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            info!("[SFU] Sending delayed Keyframe (2s)");
            self.request_keyframe().await;

            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            info!("[SFU] Sending delayed Keyframe (3s)");
            self.request_keyframe().await;

            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            info!("[SFU] Sending delayed Keyframe (5s)");
            self.request_keyframe().await;
        });
    }
}
