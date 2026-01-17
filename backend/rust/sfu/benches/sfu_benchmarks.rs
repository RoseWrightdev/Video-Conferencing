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

// 4. Benchmark Room Manager (State Operations)
// Measures the performance of concurrent map access (DashMap)
fn bench_room_manager(c: &mut Criterion) {
    let mut group = c.benchmark_group("room_manager");

    // Benchmark 1: Adding users to a room (Write heavy)
    group.bench_function("add_user", |b| {
        let room_manager = sfu::room_manager::RoomManager::new();
        // pre-fill some data to make it realistic
        room_manager.add_user("room_initial".to_string(), "user_initial".to_string());

        let mut i = 0;
        b.iter(|| {
            i += 1;
            // cyclic user ids to avoid infinite memory growth during bench loop if it runs long
            let user_id = format!("user_{}", i % 10000);
            room_manager.add_user("bench_room".to_string(), user_id);
        })
    });

    // Benchmark 2: Getting users from a room (Read heavy)
    group.bench_function("get_users", |b| {
        let room_manager = sfu::room_manager::RoomManager::new();
        let room_id = "read_room".to_string();
        // Fill room with 100 users
        for i in 0..100 {
            room_manager.add_user(room_id.clone(), format!("user_{}", i));
        }

        b.iter(|| {
            let _ = room_manager.get_users(&room_id);
        })
    });

    group.finish();
}

// 5. Benchmark Broadcast Scaling (Linearity Check)
fn bench_broadcast_scaling(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let api = MediaSetup::create_webrtc_api();
    let config = MediaSetup::get_rtc_config();

    let mut group = c.benchmark_group("broadcast_scaling");
    group.sample_size(10); // Reduce sample size for heavy tests to save time

    // Testing limits: 5k, 10k, 50k, 100k
    for subscriber_count in [5000, 10000, 50000, 100000].iter() {
        group.bench_with_input(
            criterion::BenchmarkId::from_parameter(subscriber_count),
            subscriber_count,
            |b, &count| {
                // Setup per benchmark iteration
                let pc = rt
                    .block_on(api.new_peer_connection(config.clone()))
                    .unwrap();
                let broadcaster = Arc::new(TrackBroadcaster::new(
                    "video".to_string(),
                    Default::default(),
                    Arc::new(pc),
                    12345,
                ));

                let mut writers = rt.block_on(broadcaster.writers.write());
                for i in 0..count {
                    let (tx, _rx) = tokio::sync::mpsc::channel(10); // Minimal buffer to save RAM
                    writers.push(BroadcasterWriter {
                        tx,
                        ssrc: 1000 + i as u32,
                        payload_type: 96,
                    });
                }
                drop(writers);

                let packet = Packet {
                    header: Header {
                        ssrc: 12345,
                        ..Default::default()
                    },
                    payload: Bytes::from(vec![0u8; 1200]),
                };

                b.to_async(&rt).iter(|| {
                    let mut p = packet.clone();
                    let bc = broadcaster.clone();
                    async move {
                        bc.broadcast(&mut p).await;
                    }
                })
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_packet_cloning,
    bench_string_cloning,
    bench_broadcast_loop,
    bench_room_manager,
    bench_broadcast_scaling
);
criterion_main!(benches);
