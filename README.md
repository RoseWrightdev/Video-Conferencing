# Video Conferencing.

**Distributed, high-performance video conferencing.**

A "Split-Brain" SFU architecture decoupling signaling from media routing for massive scalability.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

### Tech Stack.

* **Frontend:** Next.js 16, React 19, Zustand, Turbopack.
* **Control Plane (Go):** Gin, Gorilla WebSocket, Redis Pub/Sub.
* **Data Plane (Rust):** Tokio, WebRTC.rs, Tonic (gRPC).
* **Protocol:** Protocol Buffers (gRPC/Protobuf) for all contracts.
* **Infrastructure:** AWS ECS (Fargate & EC2), Terraform.
* **Routing:** Kubernetes Gateway API.
* **Observability:** Prometheus & Grafana.

---

### Architecture.

[Image of Hybrid Microservices Architecture Diagram NextJS Go Rust]

**1. Connect (Control Plane)**
Client connects via WebSocket to the **Go** signaling server. Go manages auth, chat, and room state. It is stateless and scalable.

**2. Negotiate (Bridge)**
Go calls **Rust** via gRPC to allocate resources. Rust reserves UDP ports and returns an SDP Offer.

**3. Stream (Data Plane)**
Client establishes a direct WebRTC connection with **Rust**. The Rust SFU ingests UDP packets and fan-outs to subscribers with zero-GC overhead.

---

### DevOps & Monitoring.

**Routing: Gateway API**
L4 (UDP) and L7 (HTTP) traffic managed via standardized Kubernetes Gateway API resources, decoupling routing from infrastructure.

**Metrics: Prometheus & Grafana**
Real-time observability into packet loss, jitter, Go goroutines, and Rust memory usage.

---

### Environment Variables.

The application requires specific environment variables to be set before starting. **The application will fail to start with a clear error message if required variables are missing or invalid.**

#### Required Variables

**Go Backend (Session Server):**
- `JWT_SECRET` - JWT secret for token signing (minimum 32 characters)
  - Generate with: `openssl rand -base64 32`
- `PORT` - Server port (valid port number 1-65535, typically `8080`)
- `RUST_SFU_ADDR` - Rust SFU gRPC address (format: `host:port`, e.g., `localhost:50051`)
- `REDIS_ADDR` - Redis address (format: `host:port`, required if `REDIS_ENABLED=true`)

**Rust SFU (Media Server):**
- `GRPC_PORT` - gRPC server port (valid port number 1-65535, typically `50051`)

**Frontend (Next.js):**
- `NEXT_PUBLIC_WS_URL` - WebSocket URL for backend connection (must start with `ws://` or `wss://`)

#### Optional Variables (with defaults)

**Go Backend:**
- `GO_ENV` - Environment mode (defaults to `production`)
- `LOG_LEVEL` - Logging level (defaults to `info`)
- `REDIS_ENABLED` - Enable Redis pub/sub (defaults to `false`)
- `DEVELOPMENT_MODE` - Development mode flag (defaults to `false`)
- `SKIP_AUTH` - Skip authentication (defaults to `false`, **DO NOT USE IN PRODUCTION**)

**Rust SFU:**
- `RUST_LOG` - Logging level (defaults to `info`)

#### Configuration

1. Copy the example environment file:
   ```bash
   cp devops/.env.example .env
   ```

2. Update the required variables in `.env`:
   ```bash
   # Generate a secure JWT secret
   JWT_SECRET=$(openssl rand -base64 32)
   
   # Set other required variables
   PORT=8080
   RUST_SFU_ADDR=localhost:50051
   GRPC_PORT=50051
   NEXT_PUBLIC_WS_URL=ws://localhost:8080
   ```

3. The application will validate all environment variables at startup and exit with clear error messages if any are missing or invalid.

---

### Quick Start.

**1. Generate Protobufs**
```bash
./scripts/generate_protos.sh
