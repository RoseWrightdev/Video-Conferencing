use dashmap::DashMap;
use std::sync::Arc;
use tonic::transport::Server;
use tracing::info;

use pb::sfu::sfu_service_server::SfuServiceServer;
use sfu::pb;
use sfu::sfu_service::MySfu;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let addr = "0.0.0.0:50051".parse()?;
    let sfu = MySfu {
        peers: Arc::new(DashMap::new()),
        tracks: Arc::new(DashMap::new()),
    };
    info!("SFU Server listening on {}", addr);
    Server::builder()
        .add_service(SfuServiceServer::new(sfu))
        .serve(addr)
        .await?;
    Ok(())
}
