use std::env;
use std::num::ParseIntError;

#[derive(Debug, Clone)]
pub struct Config {
    pub grpc_port: u16,
    pub rust_log: String,
}

#[derive(Debug)]
pub enum ConfigError {
    MissingVariable(String),
    InvalidPort(String, ParseIntError),
    PortOutOfRange(u16),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::MissingVariable(var) => write!(f, "{} is required", var),
            ConfigError::InvalidPort(val, err) => {
                write!(
                    f,
                    "GRPC_PORT must be a valid port number (got '{}': {})",
                    val, err
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
        .map_err(|e| ConfigError::InvalidPort(grpc_port_str.clone(), e))?;

    if grpc_port == 0 {
        return Err(ConfigError::PortOutOfRange(grpc_port));
    }

    // Optional: RUST_LOG (defaults to "info")
    let rust_log = env::var("RUST_LOG").unwrap_or_else(|_| {
        tracing::warn!("RUST_LOG not set, using default: info");
        "info".to_string()
    });

    let config = Config {
        grpc_port,
        rust_log,
    };

    // Log validated configuration
    tracing::info!("✅ Environment configuration validated successfully");
    tracing::info!(
        grpc_port = config.grpc_port,
        rust_log = config.rust_log,
        "Configuration"
    );

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
                let config = result.expect(&format!("Expected port {} to be valid", port_str));
                assert_eq!(config.grpc_port, expected_port);
            } else {
                assert!(result.is_err(), "Expected port {} to be invalid", port_str);
            }
        }
    }
}
