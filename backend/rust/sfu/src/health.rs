use tonic_health::pb::health_server::Health;
use tonic_health::server::health_reporter;
use tracing::info;

/// Creates and initializes the gRPC health service
///
/// This implements the standard gRPC health checking protocol
/// (https://github.com/grpc/grpc/blob/master/doc/health-checking.md)
///
/// The health service reports the serving status of the SFU server.
/// It can be queried by Kubernetes probes or other health monitoring tools.
///
/// # Returns
///
/// A tuple containing:
/// - `HealthReporter`: Used to update the health status
/// - The health service to register with the gRPC server
pub fn create_health_service() -> (
    tonic_health::server::HealthReporter,
    tonic_health::pb::health_server::HealthServer<impl Health>,
) {
    // Create the health reporter and service
    // The health_reporter() function returns a tuple of (reporter, service)
    // The service is already configured to respond to health checks
    let (reporter, service) = health_reporter();

    info!("Health service initialized - ready to serve health checks");

    (reporter, service)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_service_creation() {
        let (_reporter, _service) = create_health_service();
        // If we get here without panicking, the service was created successfully
    }
}
