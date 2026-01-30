use std::env;
use std::num::ParseIntError;

#[derive(Debug, Clone)]
/// Application configuration loaded from environment variables.
pub struct Config {
    /// Port for the gRPC service to listen on.
    pub grpc_port: u16,
    /// Port for the HTTP metrics server (Prometheus).
    pub metrics_port: u16,
    /// Logging level (e.g., "info", "debug").
    pub rust_log: String,
    /// Address of the captioning service
    pub cc_service_addr: String,
}

#[derive(Debug)]
/// Errors that can occur during configuration loading.
pub enum ConfigError {
    /// A required environment variable exists but could not be read (rare) or is missing (if checked differently).
    /// Actually currently used for Missing.
    MissingVariable(String),
    /// A port value could not be parsed as a 16-bit integer.
    InvalidPort(String, ParseIntError),
    /// A port value was 0, which is logically invalid for this application.
    PortOutOfRange(u16),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::MissingVariable(var) => write!(f, "{} is required", var),
            ConfigError::InvalidPort(val, err) => {
                write!(
                    f,
                    "{} must be a valid port number (got '{}': {})",
                    val, val, err
                )
            }
            ConfigError::PortOutOfRange(port) => {
                write!(f, "GRPC_PORT must be between 1 and 65535 (got {})", port)
            }
        }
    }
}

impl std::error::Error for ConfigError {}

/// Validates environment variables and returns a Config object
/// Returns an error if any required variable is missing or invalid
pub fn validate_env() -> Result<Config, ConfigError> {
    // Required: GRPC_PORT (valid port number)
    let grpc_port_str =
        env::var("GRPC_PORT").map_err(|_| ConfigError::MissingVariable("GRPC_PORT".to_string()))?;

    let grpc_port: u16 = grpc_port_str
        .parse()
        .map_err(|e| ConfigError::InvalidPort("GRPC_PORT".to_string(), e))?;

    if grpc_port == 0 {
        return Err(ConfigError::PortOutOfRange(grpc_port));
    }

    // Optional: RUST_LOG (defaults to "info")
    let rust_log = env::var("RUST_LOG").unwrap_or_else(|_| {
        eprintln!("RUST_LOG not set, using default: info");
        "info".to_string()
    });

    // Optional: CC_SERVICE_ADDR (defaults to "http://localhost:50051")
    let cc_service_addr = env::var("CC_SERVICE_ADDR").unwrap_or_else(|_| {
        eprintln!("CC_SERVICE_ADDR not set, using default: http://localhost:50051");
        "http://localhost:50051".to_string()
    });

    // Optional: METRICS_PORT (defaults to 3030)
    let metrics_port: u16 = env::var("METRICS_PORT")
        .unwrap_or_else(|_| "3030".to_string())
        .parse()
        .map_err(|e| ConfigError::InvalidPort("METRICS_PORT".to_string(), e))?;

    let config = Config {
        grpc_port,
        metrics_port,
        rust_log,
        cc_service_addr,
    };

    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    use std::sync::Mutex;

    lazy_static::lazy_static! {
        static ref ENV_MUTEX: Mutex<()> = Mutex::new(());
    }

    // Helper to set up and tear down environment variables for tests
    struct EnvGuard<'a> {
        vars: Vec<String>,
        _guard: std::sync::MutexGuard<'a, ()>,
    }

    impl<'a> EnvGuard<'a> {
        fn new() -> Self {
            let guard = ENV_MUTEX.lock().unwrap();
            EnvGuard {
                vars: Vec::new(),
                _guard: guard,
            }
        }

        fn set(&mut self, key: &str, value: &str) {
            env::set_var(key, value);
            self.vars.push(key.to_string());
        }

        fn unset(&mut self, key: &str) {
            env::remove_var(key);
            self.vars.push(key.to_string());
        }
    }

    impl<'a> Drop for EnvGuard<'a> {
        fn drop(&mut self) {
            for var in &self.vars {
                env::remove_var(var);
            }
        }
    }

    #[test]
    fn test_validate_env_valid_configuration() {
        let mut guard = EnvGuard::new();
        guard.set("GRPC_PORT", "50051");
        guard.set("RUST_LOG", "debug");

        let config = validate_env().expect("Expected valid configuration");
        assert_eq!(config.grpc_port, 50051);
        assert_eq!(config.rust_log, "debug");
    }

    #[test]
    fn test_validate_env_metrics_port() {
        let mut guard = EnvGuard::new();
        guard.set("GRPC_PORT", "50051");
        guard.set("METRICS_PORT", "9090");

        let config = validate_env().expect("Expected valid configuration");
        assert_eq!(config.metrics_port, 9090);
    }

    #[test]
    fn test_validate_env_invalid_metrics_port() {
        let mut guard = EnvGuard::new();
        guard.set("GRPC_PORT", "50051");
        guard.set("METRICS_PORT", "not-a-number");

        let result = validate_env();
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, ConfigError::InvalidPort(_, _)));
        assert!(err
            .to_string()
            .contains("METRICS_PORT must be a valid port number"));
    }

    #[test]
    fn test_validate_env_missing_grpc_port() {
        let mut guard = EnvGuard::new();
        guard.unset("GRPC_PORT");

        let result = validate_env();
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, ConfigError::MissingVariable(_)));
        assert!(err.to_string().contains("GRPC_PORT is required"));
    }

    #[test]
    fn test_validate_env_invalid_grpc_port() {
        let mut guard = EnvGuard::new();
        guard.set("GRPC_PORT", "not-a-number");

        let result = validate_env();
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, ConfigError::InvalidPort(_, _)));
        assert!(err
            .to_string()
            .contains("GRPC_PORT must be a valid port number"));
    }

    #[test]
    fn test_validate_env_port_out_of_range() {
        let mut guard = EnvGuard::new();
        guard.set("GRPC_PORT", "0");

        let result = validate_env();
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, ConfigError::PortOutOfRange(_)));
        assert!(err.to_string().contains("must be between 1 and 65535"));
    }

    #[test]
    fn test_validate_env_rust_log_defaults() {
        let mut guard = EnvGuard::new();
        guard.set("GRPC_PORT", "50051");
        guard.unset("RUST_LOG");

        let config = validate_env().expect("Expected valid configuration");
        assert_eq!(config.grpc_port, 50051);
        assert_eq!(config.rust_log, "info");
    }

    #[test]
    fn test_validate_env_port_edge_cases() {
        let test_cases = vec![("1", true, 1), ("65535", true, 65535), ("8080", true, 8080)];

        for (port_str, should_succeed, expected_port) in test_cases {
            let mut guard = EnvGuard::new();
            guard.set("GRPC_PORT", port_str);

            let result = validate_env();
            if should_succeed {
                let config = result.unwrap_or_else(|e| {
                    panic!("Expected port {} to be valid, got error: {}", port_str, e)
                });
                assert_eq!(config.grpc_port, expected_port);
            } else {
                assert!(result.is_err(), "Expected port {} to be invalid", port_str);
            }
        }
    }
}
