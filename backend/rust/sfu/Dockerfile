FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
WORKDIR /app

FROM chef AS planner
COPY backend/rust/sfu .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# Install protobuf compiler for prost-build
RUN apt-get update && apt-get install -y protobuf-compiler
# Build dependencies - this is the caching Docker layer!
RUN cargo chef cook --release --recipe-path recipe.json
# Build application
COPY backend/rust/sfu .
COPY proto /proto
RUN cargo build --release --bin sfu

# We do not need the Rust toolchain to run the binary!
FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/sfu /usr/local/bin

# Expose ports
# gRPC
EXPOSE 50051
# HTTP Metrics
EXPOSE 3030
# UDP range (needs to be large in prod, but limited for local dev/docker)
# We usually use host network for SFU, but if in bridge:
EXPOSE 40000-40200/udp

ENTRYPOINT ["/usr/local/bin/sfu"]
