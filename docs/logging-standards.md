# Logging Standards

## Overview
This document outlines the logging standards for the Video Conferencing application. All services must adhere to these standards to ensure logs are consistent, parsable, and useful for debugging.

## Log Format
All logs in **production** must be valid JSON.
In **development**, console-friendly text format is permitted (and encouraged).

### Required Fields
Every log entry must include:
- `timestamp`: ISO-8601 format.
- `level`: `INFO`, `WARN`, `ERROR` (Debug only in dev).
- `service`: Name of the service (e.g., `backend-go`, `sfu-rust`, `frontend`).
- `correlation_id`: Unique ID tracing the request across services.
- `message`: Human-readable description.

### Optional Context Fields
- `user_id`: If authenticated.
- `room_id`: If applicable.
- `error`: Error message/stack trace.

## Correlation ID
- **Header**: `X-Correlation-ID`
- **Propagation**:
  - Frontend generates or receives it.
  - Go Backend reads header or generates new UUID.
  - Go Backend passes it to Rust SFU via gRPC metadata.
  - Rust SFU includes it in all traces.

## PII Redaction
**NEVER LOG**:
- Passwords
- API Tokens / JWTs
- Credit Card info

**MUST REDACT**:
- Email addresses: `j***@example.com`
- IP Addresses: `192.168.x.x`

## Implementation Details

### Go
Use `go.uber.org/zap`.
```go
logger.Info("User joined",
    zap.String("correlation_id", ctx.CorrelationID),
    zap.String("user_id", userID),
)
```

### Rust
Use `tracing`.
```rust
info!(correlation_id = %correlation_id, "Handling request");
```

### Frontend
Use `lib/logger.ts`.
Errors are sent to `POST /api/logs`.
