use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use tonic::{Request, Status};
use tower::Service;
use tower_layer::Layer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

// Constants
pub const CORRELATION_ID_HEADER: &str = "x-correlation-id";

/// Initialize the tracing subscriber with JSON formatter for production
pub fn init(rust_log: &str) {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(rust_log));

    let fmt_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_current_span(true)
        .with_span_list(true);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer)
        .init();
}

/// Helper to extract correlation ID from gRPC metadata
pub fn get_correlation_id<T>(req: &Request<T>) -> Option<String> {
    req.metadata()
        .get(CORRELATION_ID_HEADER)
        .and_then(|val| val.to_str().ok())
        .map(|s| s.to_string())
}

// NOTE: Ideally we would implement a full tower middleware for this,
// but for MVP/simplicity we can also just explicitly grab it in handlers
// or basic interceptors. For now, this module provides the setup and helpers.
