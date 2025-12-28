use bytes::Bytes;
use sfu::broadcaster::{BroadcasterWriter, TrackBroadcaster};
use sfu::media_setup::MediaSetup;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::runtime::Runtime;
use webrtc::rtp::header::Header;
use webrtc::rtp::packet::Packet;

fn main() {
    // We use a custom runtime to ensure we control the threads
    let rt = Runtime::new().unwrap();
    rt.block_on(async {
        println!("🔥 Starting SFU Logic Load Simulator...");
        println!("   - Configuring WebRTC API...");

        let api = MediaSetup::create_webrtc_api();
        let config = MediaSetup::get_rtc_config();

        // create a dummy peer connection for the broadcaster source
        let pc = api
            .new_peer_connection(config)
            .await
            .expect("Failed to create PC");

        let broadcaster = Arc::new(TrackBroadcaster::new(
            "video".to_string(),
            Default::default(),
            Arc::new(pc),
            12345,
        ));

        println!("   - Adding 500 subscribers...");

        // Add 500 dummy subscribers
        let mut writers = broadcaster.writers.write().await;
        for i in 0..500 {
            // Channel size 100 to simulate real buffer
            let (tx, _rx) = tokio::sync::mpsc::channel(100);
            writers.push(BroadcasterWriter {
                tx,
                ssrc: 1000 + i,
                payload_type: 96,
            });
        }
        drop(writers); // Release lock

        println!("   - Starting broadcast loop (30 seconds)...");
        println!("   - Simulating 60 FPS video traffic...");

        let payload = Bytes::from(vec![0u8; 1200]); // 1.2KB typical video packet
        let mut packet = Packet {
            header: Header {
                ssrc: 12345,
                payload_type: 96,
                version: 2,
                ..Default::default()
            },
            payload,
        };

        let start = Instant::now();
        let mut count = 0;
        let mut loop_start = Instant::now();

        // Run for 30 seconds
        while start.elapsed() < Duration::from_secs(30) {
            packet.header.sequence_number = packet.header.sequence_number.wrapping_add(1);
            packet.header.timestamp = packet.header.timestamp.wrapping_add(3000); // 90khz clock

            // Hot Path: Broadcast to 500 subs
            broadcaster.broadcast(&mut packet).await;
            count += 1;

            if count % 1000 == 0 {
                let elapsed = loop_start.elapsed().as_secs_f64();
                if elapsed > 1.0 {
                    println!(
                        "   ⚡ Status: {} broadcasts/sec ({:.1} Mbps effective)",
                        count as f64 / elapsed,
                        (count as f64 * 1200.0 * 8.0 * 500.0) / elapsed / 1_000_000.0
                    );
                    count = 0;
                    loop_start = Instant::now();
                }
            }
        }

        println!("✅ Simulation Complete.");
    });
}
