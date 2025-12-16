# Scale.

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

### Quick Start.

**1. Generate Protobufs**
```bash
./scripts/generate_protos.sh