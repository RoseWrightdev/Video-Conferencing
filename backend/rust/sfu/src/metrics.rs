use lazy_static::lazy_static;
use prometheus::{
    register_int_counter, register_int_counter_vec, register_int_gauge, IntCounter, IntCounterVec,
    IntGauge,
};

lazy_static! {
    pub static ref SFU_ACTIVE_ROOMS: IntGauge =
        register_int_gauge!("sfu_active_rooms", "Number of currently active rooms").unwrap();
    pub static ref SFU_ACTIVE_PEERS: IntGauge =
        register_int_gauge!("sfu_active_peers", "Number of currently active peers (participants)").unwrap();
    pub static ref SFU_PACKETS_FORWARDED_TOTAL: IntCounterVec = register_int_counter_vec!(
        "sfu_packets_forwarded_total",
        "Total number of RTP packets forwarded",
        &["media_type"] // "video" or "audio"
    )
    .unwrap();
    pub static ref SFU_PACKETS_DROPPED_TOTAL: IntCounterVec = register_int_counter_vec!(
        "sfu_packets_dropped_total",
        "Total number of RTP packets dropped",
        &["reason"] // "buffer_full", "channel_closed"
    )
    .unwrap();
    pub static ref SFU_KEYFRAMES_REQUESTED_TOTAL: IntCounter = register_int_counter!(
        "sfu_keyframes_requested_total",
        "Total number of PLIs (Keyframe requests) sent to sources"
    )
    .unwrap();
    pub static ref SFU_WEBRTC_CONNECTIONS_TOTAL: IntCounter = register_int_counter!(
        "sfu_webrtc_connections_total",
        "Total number of WebRTC connections established"
    )
    .unwrap();
    pub static ref SFU_WEBRTC_CONNECTION_FAILURES_TOTAL: IntCounter = register_int_counter!(
        "sfu_webrtc_connection_failures_total",
        "Total number of WebRTC connection failures"
    )
    .unwrap();
}

pub fn register_metrics() {
    // Force initialization of lazy_statics
    let _ = SFU_ACTIVE_ROOMS.get();
    let _ = SFU_ACTIVE_PEERS.get();
    let _ = SFU_PACKETS_FORWARDED_TOTAL
        .with_label_values(&["video"])
        .get();
    let _ = SFU_PACKETS_DROPPED_TOTAL.with_label_values(&["none"]).get();
    let _ = SFU_KEYFRAMES_REQUESTED_TOTAL.get();
    let _ = SFU_WEBRTC_CONNECTIONS_TOTAL.get();
    let _ = SFU_WEBRTC_CONNECTION_FAILURES_TOTAL.get();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_metrics_initialization() {
        // Just verify that accessing them doesn't panic
        register_metrics();
        SFU_ACTIVE_ROOMS.inc();
        assert_eq!(SFU_ACTIVE_ROOMS.get(), 1);
    }
}
