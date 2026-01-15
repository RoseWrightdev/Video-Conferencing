use dashmap::DashMap;
use std::sync::Arc;
use tonic::transport::Server;
use tracing::info;
use warp::Filter;

use pb::sfu::sfu_service_server::SfuServiceServer;
use sfu::pb;
use sfu::sfu_service::MySfu;
use sfu::metrics::register_metrics;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Initialize Metrics
    register_metrics();

    // Start Metrics Server
    tokio::spawn(async {
        let metrics_route = warp::path("metrics").and(warp::get()).map(|| {
            use prometheus::Encoder;
            let encoder = prometheus::TextEncoder::new();
            let mut buffer = vec![];
            let metric_families = prometheus::gather();
            encoder.encode(&metric_families, &mut buffer).unwrap();
            String::from_utf8(buffer).unwrap()
        });

        info!("Metrics server listening on 0.0.0.0:3030");
        warp::serve(metrics_route).run(([0, 0, 0, 0], 3030)).await;
    });

    let addr = "0.0.0.0:50051".parse()?;
    let sfu = MySfu {
        peers: Arc::new(DashMap::new()),
        tracks: Arc::new(DashMap::new()),
        room_manager: Arc::new(sfu::room_manager::RoomManager::new()),
    };
    info!("SFU Server listening on {}", addr);
    Server::builder()
        .add_service(SfuServiceServer::new(sfu))
        .serve(addr)
        .await?;
    Ok(())
}
