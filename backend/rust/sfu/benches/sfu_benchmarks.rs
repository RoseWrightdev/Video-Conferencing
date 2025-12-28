use bytes::Bytes;
use criterion::{criterion_group, criterion_main, Criterion};
use std::sync::Arc;
use tokio::runtime::Runtime;
use webrtc::rtp::header::Header;
use webrtc::rtp::packet::Packet;

// Import from the sfu library
use sfu::broadcaster::{BroadcasterWriter, TrackBroadcaster};
use sfu::media_setup::MediaSetup;

// 1. Benchmark Packet Cloning (Hot Path Simulation)
// Simulates the cost of cloning a packet for each subscriber
fn bench_packet_cloning(c: &mut Criterion) {
    let mut group = c.benchmark_group("packet_operations");

    // Create a typical video packet (approx 1200 bytes)
    let payload = vec![0u8; 1200];
    let packet = Packet {
        header: Header {
            version: 2,
            padding: false,
            extension: false,
            marker: false,
            payload_type: 96,
            sequence_number: 1234,
            timestamp: 987654321,
            ssrc: 11223344,
            ..Default::default()
        },
        payload: Bytes::from(payload),
    };

    group.bench_function("clone_packet", |b| {
        b.iter(|| {
            let _ = packet.clone();
        })
    });

    group.finish();
}

// 2. Benchmark Arc vs String Cloning (Optimization Candidate)
// Validates whether switching to Arc<str> assumes significant savings
fn bench_string_cloning(c: &mut Criterion) {
    let mut group = c.benchmark_group("string_vs_arc");
    // Typical User ID length
    let user_id = "user_123456789_abcdef_long_string";

    group.bench_function("clone_string", |b| {
        let s = user_id.to_string();
        b.iter(|| {
            let _ = s.clone();
        })
    });

    group.bench_function("clone_arc_str", |b| {
        let s: Arc<str> = Arc::from(user_id);
        b.iter(|| {
            let _ = s.clone();
        })
    });

    group.finish();
}

// 3. Benchmark Broadcaster Write Loop (Async Hot Path)
// Measures the actual broadcast loop performance with 100 subscribers
fn bench_broadcast_loop(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let api = MediaSetup::create_webrtc_api();
    let config = MediaSetup::get_rtc_config();

    // Setup Broadcaster with a real PC (required for struct validation)
    let pc = rt.block_on(api.new_peer_connection(config)).unwrap();

    let broadcaster = Arc::new(TrackBroadcaster::new(
        "video".to_string(),
        Default::default(),
        Arc::new(pc),
        12345,
    ));

    // Inject 100 dummy writers (subscribers)
    // We use a dummy channel that simply drops the messages
    let mut writers = rt.block_on(broadcaster.writers.write());
    for i in 0..100 {
        let (tx, _rx) = tokio::sync::mpsc::channel(100);
        // calculate ssrc
        let ssrc = 1000 + i;
        writers.push(BroadcasterWriter {
            tx,
            ssrc,
            payload_type: 96,
        });
    }
    // Release lock
    drop(writers);

    let packet = Packet {
        header: Header {
            ssrc: 12345,
            ..Default::default()
        },
        payload: Bytes::from(vec![0u8; 1200]),
    };

    let mut group = c.benchmark_group("broadcaster");
    group.bench_function("broadcast_100_subscribers", |b| {
        b.to_async(&rt).iter(|| {
            let mut p = packet.clone();
            let bc = broadcaster.clone();
            async move {
                bc.broadcast(&mut p).await;
            }
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_packet_cloning,
    bench_string_cloning,
    bench_broadcast_loop
);
criterion_main!(benches);
