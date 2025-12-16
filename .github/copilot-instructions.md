# AI Coding Agent Instructions

## Project Overview

WebRTC video conferencing platform with Next.js frontend and Go backend. Real-time communication via WebSocket signaling with peer-to-peer video streaming.

## Architecture Principles

### State Management Pattern
- **Backend:** Go channels + separate state maps (`unmuted`, `cameraOn`, `sharingScreen`, `raisingHand`)
- **Frontend:** Zustand with mirrored state structure - participant states in separate `Set<string>` collections, NOT nested in participant objects
- **Why:** Enables efficient lookups (O(1)) and prevents unnecessary re-renders when states change

Example from `frontend/store/types.ts`:
```typescript
// ❌ WRONG - nested state causes full re-render
{ id: '123', isAudioEnabled: true, isVideoEnabled: false }

// ✅ CORRECT - separate Sets, selective updates
unmutedParticipants: Set<string>(['123'])
cameraOnParticipants: Set<string>([])
```

### Component Communication Flow
```
Browser → Next.js Frontend → WebSocket → Go Backend → WebRTC P2P
         ↓                    ↓          ↓
    Zustand Store      Signaling Hub   Room Manager
         ↓                              ↓
   React Components                Go Channels
```

### Permission Hierarchy
`waiting` < `participant` < `screenshare` < `host`

Checked via `backend/go/internal/v1/session/permissions.go` - always validate permissions before state changes.

## Critical Developer Workflows

### Running Services
```bash
# Frontend (port 3000)
cd frontend && npm run dev

# Backend (port 8080)
cd backend/go && go run cmd/v1/session/main.go

# Full deployment
./devops/deploy.sh deploy
```

### Testing Commands
```bash
# Frontend tests (Vitest)
cd frontend && npm run test:unit:run     # Unit tests only
cd frontend && npm run test:run          # All tests

# Backend tests (Go)
cd backend/go && go test ./...           # All packages
cd backend/go && go test -v ./internal/v1/session/  # Verbose session tests

# Full codebase test suite
# Use VS Code task: "Test: Full Codebase" (default test task)
```

### Debugging Tools
- Frontend: Zustand DevTools in browser console
- Backend: Use logger from `backend/go/internal/v1/session/utils.go`
- WebRTC: Check `chrome://webrtc-internals` for connection diagnostics

## Project-Specific Conventions

### Logging (MANDATORY)
**NEVER use `console.log/warn/error` directly** - ALL production logs MUST be silent.

Frontend:
```typescript
import { createLogger } from '@/lib/logger';
const logger = createLogger('ComponentName');
logger.debug('details', { data });  // Silent in production
```

Backend:
```go
DebugPrintf("[Session] Message: %+v", msg)  // Only in debug mode
```

### TypeScript Patterns

#### Custom Hooks (see `frontend/hooks/`)
All hooks follow dependency injection pattern:
```typescript
// ❌ WRONG - direct store access
function useRoom() {
  const store = useRoomStore();
  // ...
}

// ✅ CORRECT - DI for testability
function useRoom({ roomId, token, autoJoin }: RoomOptions) {
  const store = useRoomStore();
  // Pass configs, return service methods
}
```

#### Component Props (see `frontend/components/`)
Always use `dependencies` pattern for services:
```typescript
interface ControlsPanelProps {
  dependencies: {
    mediaService: { isAudioEnabled: boolean; toggleAudio: () => void };
    roomControlService: { leaveRoom: () => void };
  };
}
```

### Go Conventions

#### Thread Safety
Room methods in `room_methods.go` are **NOT** thread-safe by design:
```go
// ❌ WRONG - direct mutation
room.AddParticipant(client)

// ✅ CORRECT - lock before mutation
room.mu.Lock()
room.addParticipant(client)  // lowercase = private, non-thread-safe
room.mu.Unlock()
```

#### Event Handling Pattern
See `backend/go/internal/v1/session/handlers.go`:
1. Validate payload with `Validate()`
2. Check permissions with `HasPermission()`
3. Mutate state with lock
4. Broadcast via `broadcastToRoom()` or `directSend()`

### WebRTC Integration

#### ICE Candidate Flow
Candidates must be queued until remote description is set:
```typescript
// In webrtc.ts
if (!pc.remoteDescription) {
  this.pendingIceCandidates.push(candidate);  // Queue
} else {
  await pc.addIceCandidate(candidate);  // Apply
}
```

#### Stream Cloning for Audio Detection
**CRITICAL:** Clone audio tracks before creating AudioContext to avoid breaking video playback:
```typescript
// ✅ CORRECT - from app/(room)/[roomid]/page.tsx
const clonedTrack = audioTracks[0].clone();
const sourceStream = new MediaStream([clonedTrack]);
const source = audioContext.createMediaStreamSource(sourceStream);
```

## Known Issues & Workarounds

### From REVIEW.md (frontend/REVIEW.md)
1. **Missing useEffect dependencies** - Always include ALL closure dependencies
2. **TODO comments** - Mute/remove participant features pending backend WebSocket events
3. **Memory leaks** - Audio detection cleanup requires stopping cloned tracks
4. **Race conditions** - WebRTC peer initialization needs retry logic for simultaneous offers

### Testing Gaps
- Current coverage: ~20% frontend, 100% backend critical paths
- Missing: Integration tests for WebRTC negotiation, E2E room join flows
- Run full test suite before PRs: Use VS Code task "Test: Full Codebase"

## File Organization

```
frontend/
├── app/(room)/[roomid]/page.tsx     # Main room UI with audio detection
├── components/                       # Shadcn UI components + custom
├── hooks/                           # Custom React hooks (DI pattern)
├── lib/                             # Core services (websockets, webrtc, logger)
├── store/                           # Zustand slices (modular state)
└── REVIEW.md                        # Comprehensive code review findings

backend/go/
├── cmd/v1/session/main.go           # Entry point
├── internal/v1/session/             # Core session package
│   ├── hub.go                       # Room registry + WebSocket upgrades
│   ├── room.go                      # Room state management
│   ├── client.go                    # WebSocket connection handler
│   ├── handlers.go                  # Event processing logic
│   ├── permissions.go               # RBAC system
│   └── README.md                    # Detailed architecture docs
└── internal/api/v1/session/openapi.yaml  # WebSocket API spec

shared/types/events.ts               # Shared TS/Go event definitions
```

## Authentication

- **Frontend:** NextAuth with Auth0 (`session?.accessToken`)
- **Backend:** JWT validation in `hub.go` before WebSocket upgrade
- **Token flow:** HTTP header → validate → upgrade to WebSocket → store clientInfo

## Quick Reference

### Add New WebSocket Event
1. Define in `shared/types/events.ts`
2. Add handler in `backend/go/internal/v1/session/handlers.go`
3. Check permissions in router (line 80+)
4. Update frontend store action
5. Add tests in `*_test.go`

### Add New UI Component
1. Use shadcn: `npx shadcn@latest add <component>`
2. Create in `frontend/components/` with dependencies pattern
3. Add to Storybook if reusable
4. Use `createLogger('ComponentName')` for debugging

### Deploy Changes
```bash
./devops/deploy.sh deploy  # Full stack to Kubernetes
# Auto-scales: 2-10 frontend pods, 2-15 backend pods
# Includes: Envoy Gateway, ELK logging, Prometheus metrics
```

## DevOps Architecture (Minimal)

### Philosophy: Metrics Over Logs

**Design Decision:** Silent production logs in browser + Prometheus metrics focus

WebRTC applications need **real-time metrics** (peer connections, rooms, streams) NOT heavy log aggregation. The previous ELK stack (~2GB RAM) was massive overkill for:
- Browser logs that are silent in production anyway
- Server logs that can be viewed with `kubectl logs`
- Metrics that tell you "what's happening right now"

### Deployment Pipeline

The `deploy.sh` script orchestrates the entire deployment:

```bash
# Available commands
./devops/deploy.sh prerequisites  # Install Gateway API + Envoy
./devops/deploy.sh build          # Build Docker images only
./devops/deploy.sh deploy         # Full deployment
./devops/deploy.sh cleanup        # Remove all resources
./devops/deploy.sh health         # Health check all components

# Environment variables
KUBECTL_CONTEXT=my-cluster ./devops/deploy.sh deploy
DRY_RUN=true ./devops/deploy.sh deploy  # Test without applying
```

### Deployment Order (Simplified!)

Resources must be deployed in this sequence:

1. **Security Policies** → RBAC, NetworkPolicy, PodSecurityPolicy
2. **Backend** → Go service with /metrics endpoint (NO sidecars)
3. **Frontend** → Next.js service
4. **Gateway** → Envoy Gateway + TLS termination
5. **Routes** → HTTPRoute definitions
6. **Monitoring** → HPA, PDB, ServiceMonitor

### WebRTC Metrics (Backend)

**Backend exposes `/metrics` endpoint with Prometheus metrics:**

```go
// Defined in internal/v1/metrics/metrics.go
- websocket_connections_total (gauge) - Active WebSocket connections
- webrtc_rooms_active (gauge) - Current number of rooms
- room_participants (histogram) - Distribution of participants per room
- websocket_events_total (counter) - Events processed by type and status
- message_processing_duration_seconds (histogram) - Event processing latency
```

**Metrics are automatically recorded:**
- `hub.go:ServeWs()` - Increments websocket_connections_total
- `client.go:readPump()` - Decrements on disconnect
- `hub.go:getOrCreateRoom()` - Increments webrtc_rooms_active
- `hub.go:removeRoom()` - Decrements when room is cleaned up
- `room.go:handleClientConnect()` - Records room_participants distribution

**View metrics locally:**
```bash
# Start backend
cd backend/go && go run cmd/v1/session/main.go

# Query metrics
curl http://localhost:8080/metrics
```

### Frontend Logging (Minimal)

**Production logs are silent in browser, but forwarded to server:**

```typescript
// lib/logger.ts automatically handles environment
logger.debug('message', { data }); // Silent in production
```

**Server-side logging:**
- Logs output to stdout as JSON
- Viewed with `kubectl logs deployment/backend-deployment`
- No ELK stack, no log aggregation, no sidecars
- Keep it simple: metrics for monitoring, logs for debugging

### Multi-Stage Docker Builds

**Frontend (frontend.dockerfile):**
- Stage 1: `node:22-alpine` builder → `npm ci` + `npm run build`
- Stage 2: `node:22-alpine` runner → standalone output + non-root user (1001)
- Health check: `/api/health` endpoint
- Security: Read-only filesystem, capabilities dropped

**Backend (backend.dockerfile):**
- Stage 1: `golang:1.24.5-alpine` builder → `CGO_ENABLED=0` static binary
- Stage 2: `scratch` → minimal 15MB image
- Security: No shell, no package manager, immutable
- Note: Health check uses curl from separate Alpine stage

### Gateway API & Routing

**Listeners defined in `gateway/gateway.yaml`:**
- Port 80 (HTTP) → Redirect to HTTPS
- Port 443 (HTTPS) → TLS termination with `social-media-tls` secret
- Port 8080 (WebSocket) → Backend `/ws` endpoint

**HTTP Routes in `gateway/routes.yaml`:**
- `/` → `frontend-service:80`
- `/ws` → `backend-service:8080` (WebSocket upgrade)
- `/api/*` → `backend-service:8080`

### Monitoring & Auto-Scaling

**HPA Configuration (monitoring.yaml):**
- Frontend: 2-10 replicas, target 70% CPU/memory
- Backend: 2-15 replicas, target 60% CPU/memory
- Scale-up: +2 pods per 30s when threshold exceeded
- Scale-down: -1 pod per 5min (stabilization)

**Metrics Collection:**
- ServiceMonitor scrapes `/metrics` from backend every 30s
- Prometheus aggregates and stores time-series data
- Grafana visualizes WebRTC dashboards (rooms, connections, participants)

### Security Model

**Pod Security (security-policies.yaml):**
- `runAsNonRoot: true` - Frontend uses UID 1001, backend uses scratch
- `readOnlyRootFilesystem: true` - No writes to container FS
- `allowPrivilegeEscalation: false` - Prevent privilege escalation
- `capabilities.drop: [ALL]` - No Linux capabilities

**Network Policies:**
- Frontend → Backend: Port 8080 only
- Ingress: Only via Gateway (ports 80, 443, 8080)

**RBAC:**
- `social-media-backend-sa` - Read pods/services (logging metadata)
- `logging-fluentbit-sa` - Read/list pods/namespaces (Kubernetes filter)
- `logging-elasticsearch-sa` - PVC management

### Troubleshooting Commands

```bash
# Check deployment status
kubectl get all -n social-media
kubectl get gateway social-media-gateway -n social-media -o yaml

# Debug logging sidecars
kubectl logs -n social-media deployment/backend-deployment -c backend
kubectl logs -n social-media deployment/backend-deployment -c fluent-bit
kubectl logs -n social-media deployment/backend-deployment -c vector

# Check Elasticsearch indices
kubectl exec -n logging deployment/elasticsearch -- curl localhost:9200/_cat/indices

# Test Gateway routing
kubectl port-forward -n social-media svc/frontend-service 3000:80
kubectl port-forward -n social-media svc/backend-service 8080:8080

# View HPA status
kubectl get hpa -n social-media -w

# Check PDB (Pod Disruption Budget)
kubectl get pdb -n social-media
```

### Local Development vs Production

**Local (docker-compose.yml):**
- No sidecars, logs to stdout
- Hot reload for frontend (`npm run dev`)
- No Gateway API, direct port mapping
- Single replica, no auto-scaling

**Production (Kubernetes):**
- No sidecars (minimal approach)
- Compiled Next.js standalone server
- Envoy Gateway with TLS + rate limiting
- HPA, PDB, NetworkPolicy, PodSecurity

### Local Observability Stack (Minimal)

Run the minimal monitoring stack locally to learn and debug:

```bash
# Start observability tools only
docker-compose -f docker-compose.observability.yml up

# In separate terminals, run your app in dev mode:
cd frontend && npm run dev          # Terminal 1
cd backend/go && go run cmd/v1/session/main.go  # Terminal 2

# Access dashboards:
# Grafana:        http://localhost:3001 (admin/admin)
# Prometheus:     http://localhost:9090
```

**What you get:**
- **Grafana** - WebRTC metrics dashboards (rooms, connections, participants)
- **Prometheus** - Metrics collection from backend

**Grafana Pre-Configured Datasources:**
1. Prometheus (metrics) - default
2. Elasticsearch (logs) - query `social-media-logs-*` index
3. Jaeger (traces) - request flow visualization

**Example Queries in Grafana:**

Prometheus (Metrics):
```promql
# WebSocket connections
websocket_connections_total

# Active rooms
webrtc_rooms_active

# Room participant distribution
histogram_quantile(0.95, rate(room_participants_bucket[5m]))

# Event processing duration
rate(message_processing_duration_seconds_sum[5m]) / rate(message_processing_duration_seconds_count[5m])

# Connection success rate
rate(webrtc_connection_success_rate_total{status="success"}[5m]) / 
rate(webrtc_connection_success_rate_total[5m])
```

**Quick Learning Path:**
1. Start observability stack
2. Generate traffic (join rooms, send messages, screen share)
3. Watch metrics in Grafana → Prometheus dashboard
4. Understand WebRTC-specific metrics (connections, rooms, participants)

**Files to study:**
- `docker-compose.observability.yml` - Minimal stack definition
- `devops/local/prometheus.yml` - Metrics scraping config
- `devops/local/grafana-datasources.yml` - Data source connections
- `devops/local/dashboards/webrtc-dashboard.json` - WebRTC metrics dashboard

### Common Issues

**Gateway not routing:**
```bash
# Check Gateway status
kubectl describe gateway social-media-gateway -n social-media
# Look for "Programmed: True" condition

# Check Envoy logs
kubectl logs -n envoy-gateway-system deployment/envoy-gateway
```

**Metrics not showing in Grafana:**
```bash
# Check Prometheus targets
kubectl port-forward -n social-media svc/prometheus 9090:9090
# Visit http://localhost:9090/targets

# Check ServiceMonitor is created
kubectl get servicemonitor -n social-media
```

**HPA not scaling:**
```bash
# Check metrics-server is installed
kubectl top nodes
kubectl top pods -n social-media

# View HPA conditions
kubectl describe hpa frontend-hpa -n social-media
```
