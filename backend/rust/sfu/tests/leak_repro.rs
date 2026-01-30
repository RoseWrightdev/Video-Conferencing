use sfu::broadcaster::TrackBroadcaster;
use std::sync::Arc;
use webrtc::api::APIBuilder;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;

/// Reproduction test for the "Zombie Writer" memory leak.
///
/// Scenario:
/// 1. Create a TrackBroadcaster
/// 2. Add a writer
/// 3. Drop the writer's receiver (rx) to simulate a disconnect
/// 4. Call broadcast() 50 times
/// 5. Assert that broadcaster.writers.len() is 0 (should be cleaned up)
///
/// EXPECTED BEHAVIOR (Before Fix): Test FAILS - writers.len() == 1 (leak)
/// EXPECTED BEHAVIOR (After Fix): Test PASSES - writers.len() == 0 (cleaned up)
#[tokio::test]
async fn test_zombie_writer_memory_leak() {
    // 1. Setup: Create a PeerConnection and TrackBroadcaster
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
    let broadcaster = TrackBroadcaster::new("video".to_string(), codec.clone(), pc, 12345);

    // 2. Add a writer (subscriber)
    let track = Arc::new(TrackLocalStaticRTP::new(
        codec,
        "test_track".to_owned(),
        "test_stream".to_owned(),
    ));
    broadcaster
        .add_writer(track, "test_track".to_string(), 111, 96)
        .await;

    // Verify writer was added
    assert_eq!(
        broadcaster.writers.read().await.len(),
        1,
        "Should have 1 writer after adding"
    );

    // 3. Simulate disconnect: Drop all references to the writer
    // The spawned task in add_writer holds the receiver (rx).
    // We need to trigger the channel to close by dropping the receiver.
    // Since we can't directly access the rx, we'll trigger it by making the writer task exit.
    
    // Get a reference to the writer's tx channel
    let tx = {
        let writers = broadcaster.writers.read().await;
        writers[0].tx.clone()
    };

    // Drop the tx to close the channel (simulating the writer task exiting)
    drop(tx);

    // Give the spawned task time to detect the close and exit
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

    // 4. Broadcast 50 packets
    for _ in 0..50 {
        let mut packet = webrtc::rtp::packet::Packet::default();
        packet.header.ssrc = 12345;
        packet.payload = vec![1, 2, 3].into();
        broadcaster.broadcast(&mut packet).await;
    }

    // 5. Assert: The zombie writer should be removed
    let count = broadcaster.writers.read().await.len();
    assert_eq!(
        count, 0,
        "Zombie writer should be removed after channel closes. Found {} writers",
        count
    );
}
