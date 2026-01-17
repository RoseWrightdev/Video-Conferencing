use dashmap::DashMap;
use std::sync::Arc;
use tokio::signal;
use tonic::transport::Server;
use tracing::info;
use warp::Filter;

use pb::sfu::sfu_service_server::SfuServiceServer;
use sfu::metrics::register_metrics;
use sfu::pb;
use sfu::sfu_service::MySfu;

mod config;
mod logging;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Validate environment variables before starting the server
    let cfg = config::validate_env().unwrap_or_else(|e| {
        eprintln!("Environment validation failed: {}", e);
        std::process::exit(1);
    });

    // Initialize tracing with validated RUST_LOG
    logging::init(&cfg.rust_log);

    // Initialize Metrics
    register_metrics();

    // Start Metrics Server
    let metrics_handle = tokio::spawn(async {
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

    let addr = format!("0.0.0.0:{}", cfg.grpc_port).parse()?;
    let sfu = MySfu {
        peers: Arc::new(DashMap::new()),
        tracks: Arc::new(DashMap::new()),
        room_manager: Arc::new(sfu::room_manager::RoomManager::new()),
    };

    info!("SFU Server listening on {}", addr);

    // Initialize health service
    let (_health_reporter, health_service) = sfu::health::create_health_service();

    // Create shutdown signal handler
    let shutdown_signal = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install CTRL+C signal handler");
        info!("Received shutdown signal (SIGINT/SIGTERM)");
    };

    // Clone sfu for shutdown handler
    let sfu_clone = sfu.clone();

    // Start gRPC server with graceful shutdown
    let server_result = Server::builder()
        .add_service(SfuServiceServer::new(sfu))
        .add_service(health_service)
        .serve_with_shutdown(addr, shutdown_signal)
        .await;

    // Shutdown sequence
    info!("Shutting down SFU - closing active peer connections...");
    sfu_clone.shutdown().await;
    info!("SFU shutdown complete");

    // Abort metrics server
    metrics_handle.abort();

    server_result?;
    Ok(())
}
