# Copilot Instructions

You are a Senior Systems Architect working on **Scale**, a distributed, high-performance video conferencing platform.

## 🧠 The Architecture (Split-Brain)

We do not use a standard Monolith or P2P Mesh. You must strictly adhere to the **Split-Brain** separation of concerns:

1.  **Control Plane (Go):** Handles Auth, Chat, Room State, and Signaling. It is stateless and syncs via Redis.
    * *Rule:* Never process media packets (RTP/UDP) in Go.
2.  **Data Plane (Rust):** Handles Media Routing (SFU). It is stateful and high-performance.
    * *Rule:* Never handle business logic (Auth/Permissions) in Rust.
3.  **Contract (Protobuf):** The single source of truth.
    * *Rule:* Never manually type JSON interfaces. Always generate from `.proto`.

---

## 🛠 Tech Stack & Style

### 1. Protocols (The Law)
* **Format:** Protocol Buffers (proto3).
* **Transport:** gRPC for internal (Go<->Rust), WebSocket (Binary) for external (Client<->Go).
* **Workflow:** If a data structure changes, modify `proto/*.proto` first, then run `./scripts/generate_protos.sh`. Do not manually patch generated files.

### 2. Frontend (Next.js 16)
* **Stack:** React 19, Zustand, Turbopack.
* **Pattern:** "Dumb Terminal." The frontend maintains **one** WebRTC connection to the Rust SFU.
* **Forbidden:** Do not implement P2P Mesh logic (e.g., `Map<UserId, PeerConnection>`).
* **State:** Use Zustand for video grid state. Use React Server Components (RSC) for initial shell rendering.

### 3. Backend (Go 1.22+)
* **Concurrency:** Use Goroutines for I/O. strictly lock shared state with `sync.RWMutex`.
* **Error Handling:** Return wrapped errors. Log with `slog`.
* **Security:** Always overwrite `ClientId` and `DisplayName` in payloads with the authenticated session values. Never trust user input for identity.

### 4. Backend (Rust)
* **Async:** Use `tokio` for the runtime.
* **WebRTC:** Use `webrtc.rs`.
* **Safety:** No `unwrap()`. Use `anyhow` or `thiserror` for result handling.
* **Performance:** Minimize cloning. Use `Arc<Mutex<>>` sparingly; prefer message passing (channels) where possible.

---

## 🚨 Critical Constraints

1.  **No JSON Signaling:** All WebSocket messages must be binary Protobufs.
2.  **No Zombie Goroutines:** Always `close(channels)` or use contexts to tear down `readPump`/`writePump` routines.
3.  **Rate Limiting:** Every public endpoint (WS/HTTP) must have rate limiting logic.
4.  **Observability:** All new services must expose Prometheus metrics (`/metrics`).

## 📝 Commit Style

* **Format:** Conventional Commits (e.g., `feat(sfu): add packet jitter buffer`).
* **Context:** precise and descriptive.