# Rust SFU Dockerfile for Video Conferencing
# Multi-stage build for production optimization

# Stage 1: Build the Rust application
FROM rust:1.75-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    musl-dev \
    pkgconfig \
    openssl-dev \
    protobuf-dev \
    protoc

# Copy Cargo files
COPY backend/rust/sfu/Cargo.toml backend/rust/sfu/Cargo.lock ./

# Create dummy files to cache dependencies
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    mkdir benches && \
    echo "fn main() {}" > benches/sfu_benchmarks.rs && \
    cargo build --release && \
    rm -rf src benches

# Copy source code
COPY backend/rust/sfu/src ./src
COPY proto ./proto

# Build the actual application
RUN cargo build --release

# Install grpc-health-probe
RUN GRPC_HEALTH_PROBE_VERSION=v0.4.19 && \
    wget -qO/bin/grpc_health_probe \
    https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64 && \
    chmod +x /bin/grpc_health_probe

# Stage 2: Production runtime
FROM alpine:latest

# Install runtime dependencies
RUN apk --no-cache add ca-certificates libgcc

# Create non-root user
RUN addgroup -g 10001 -S appuser && \
    adduser -u 10001 -S appuser -G appuser

# Copy the binary
COPY --from=builder /app/target/release/sfu /sfu

# Copy health check probe
COPY --from=builder /bin/grpc_health_probe /bin/grpc_health_probe

# Copy CA certificates
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Set ownership
RUN chown -R appuser:appuser /sfu /bin/grpc_health_probe

# Create tmp directory for runtime files
RUN mkdir -p /tmp && chown appuser:appuser /tmp

# Switch to non-root user
USER appuser

# Set environment variables
ENV RUST_LOG=info
ENV GRPC_PORT=50051

# Expose gRPC port
EXPOSE 50051

# Health check using grpc-health-probe
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD ["/bin/grpc_health_probe", "-addr=:50051"]

# Start the application
CMD ["/sfu"]
