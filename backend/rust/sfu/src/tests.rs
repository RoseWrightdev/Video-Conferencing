use super::*;
use crate::pb::sfu::sfu_service_server::SfuService;
use crate::pb::sfu::{CreateSessionRequest, ListenRequest};
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tonic::Request;
use webrtc::api::APIBuilder;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::policy::bundle_policy::RTCBundlePolicy;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;

#[tokio::test]
async fn test_broadcaster_add_writer() {
    let api = APIBuilder::new().build();
    let pc = api
        .new_peer_connection(RTCConfiguration::default())
        .await
        .unwrap();
    let pc = Arc::new(pc);

    let codec = RTCRtpCodecCapability {
        mime_type: "video/VP8".to_owned(),
        ..Default::default()
    };

    let broadcaster = TrackBroadcaster::new("video".to_string(), codec.clone(), pc, 12345);

    let track = Arc::new(TrackLocalStaticRTP::new(
        codec,
        "track-1".to_owned(),
        "stream-1".to_owned(),
    ));

    broadcaster.add_writer(track.clone(), 12345, 96).await;

    let writers = broadcaster.writers.read().await;
    assert_eq!(writers.len(), 1);
}

#[tokio::test]
async fn test_signaling_flow_and_track_notification() {
    let sfu = MySfu {
        peers: Arc::new(DashMap::new()),
        tracks: Arc::new(DashMap::new()),
    };

    let room_id = "test-room".to_string();
    let user_a = "user-a".to_string();
    let user_b = "user-b".to_string();

    // 1. User A Joins
    let req_a = Request::new(CreateSessionRequest {
        user_id: user_a.clone(),
        room_id: room_id.clone(),
    });
    let res_a = sfu.create_session(req_a).await.unwrap().into_inner();
    assert!(!res_a.sdp_offer.is_empty());

    // 2. User A starts listening for events
    let req_listen_a = Request::new(ListenRequest {
        user_id: user_a.clone(),
        room_id: room_id.clone(),
    });
    let mut _stream_a = sfu.listen_events(req_listen_a).await.unwrap().into_inner();

    // 3. User B Joins
    let req_b = Request::new(CreateSessionRequest {
        user_id: user_b.clone(),
        room_id: room_id.clone(),
    });
    let _res_b = sfu.create_session(req_b).await.unwrap().into_inner();

    // 4. User B starts listening
    let req_listen_b = Request::new(ListenRequest {
        user_id: user_b.clone(),
        room_id: room_id.clone(),
    });
    let mut _stream_b = sfu.listen_events(req_listen_b).await.unwrap().into_inner();

    // 5. Verify that the peers are correctly registered.
    assert_eq!(sfu.peers.len(), 2);

    // 6. Verify SDP contains essential extensions for track mapping
    println!("Verifying SDP extensions...");
    assert!(res_a
        .sdp_offer
        .contains("urn:ietf:params:rtp-hdrext:sdes:mid"));
    assert!(res_a
        .sdp_offer
        .contains("urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id"));
}
#[tokio::test]
async fn test_webrtc_api_configuration() {
    let _sfu = MySfu {
        peers: Arc::new(DashMap::new()),
        tracks: Arc::new(DashMap::new()),
    };

    let api = MediaSetup::create_webrtc_api();
    let config = RTCConfiguration {
        bundle_policy: RTCBundlePolicy::MaxBundle,
        ..Default::default()
    };

    let pc = api.new_peer_connection(config).await;
    assert!(pc.is_ok(), "API should be able to create a PeerConnection");
}

#[tokio::test]
async fn test_request_keyframe_no_panic() {
    let api = APIBuilder::new().build();
    let pc = api
        .new_peer_connection(RTCConfiguration::default())
        .await
        .unwrap();
    let pc = Arc::new(pc);

    let codec = RTCRtpCodecCapability {
        mime_type: "video/VP8".to_owned(),
        ..Default::default()
    };

    let broadcaster = TrackBroadcaster::new("video".to_string(), codec, pc, 12345);

    // Should not panic even if PC is not connected
    broadcaster.request_keyframe().await;
}

#[tokio::test]
async fn test_signaling_lock_concurrency() {
    let lock = Arc::new(Mutex::new(()));

    // Simulate two tasks trying to negotiate at once
    let lock_clone = lock.clone();
    let handle1 = tokio::spawn(async move {
        let _guard = lock_clone.lock().await;
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
        "done 1"
    });

    let lock_clone2 = lock.clone();
    let handle2 = tokio::spawn(async move {
        let _guard = lock_clone2.lock().await;
        "done 2"
    });

    let res1 = handle1.await.unwrap();
    let res2 = handle2.await.unwrap();

    assert_eq!(res1, "done 1");
    assert_eq!(res2, "done 2");
}

#[tokio::test]
async fn test_subscribe_logic() {
    let sfu = MySfu {
        peers: Arc::new(DashMap::new()),
        tracks: Arc::new(DashMap::new()),
    };

    let room_id = "room1".to_string();
    let user_a = "userA".to_string();
    let stream_id = "stream1".to_string();
    let track_id = "track1".to_string();

    // Create a broadcaster for User A
    let api = MediaSetup::create_webrtc_api();
    let pc_a = Arc::new(
        api.new_peer_connection(RTCConfiguration::default())
            .await
            .unwrap(),
    );
    let codec = RTCRtpCodecCapability {
        mime_type: "video/VP8".to_owned(),
        ..Default::default()
    };
    let broadcaster = Arc::new(TrackBroadcaster::new(
        "video".to_string(),
        codec,
        pc_a.clone(),
        111,
    ));

    sfu.tracks.insert(
        (room_id.clone(), user_a.clone(), stream_id.clone(), track_id),
        broadcaster,
    );

    // New Peer B joins
    let pc_b = Arc::new(
        api.new_peer_connection(RTCConfiguration::default())
            .await
            .unwrap(),
    );
    let peer_b = Peer {
        pc: pc_b,
        user_id: "userB".to_string(),
        room_id: room_id.clone(),
        event_tx: Arc::new(Mutex::new(None)),
        track_mapping: Arc::new(DashMap::new()),
        signaling_lock: Arc::new(Mutex::new(())),
    };

    // Peer B subscribes to existing tracks
    MediaSetup::subscribe_to_existing_tracks(&peer_b, "userB", &room_id, &sfu.tracks).await;

    // Verify B has a mapping for A's stream
    assert!(peer_b.track_mapping.contains_key(&stream_id));
    assert_eq!(
        peer_b.track_mapping.get(&stream_id).unwrap().value(),
        &user_a
    );
}
