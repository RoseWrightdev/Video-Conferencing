# DevOps Configuration

Production-ready Kubernetes deployment with minimal, metrics-focused architecture.

## Philosophy: Metrics Over Logs

**Design Decision:** Silent production logs + Prometheus metrics focus

WebRTC applications need **real-time metrics** (peer connections, rooms, streams) NOT heavy log aggregation. Silent browser logs in production + server logs via `kubectl logs` + Prometheus metrics for live monitoring.

## Quick Deploy

```bash
./devops/deploy.sh deploy
```

## Architecture

```text
Internet ←→ Envoy Gateway ←→ Kubernetes Services
                ↓              ↓         ↓
            Gateway API    Frontend   Backend
                ↓           (Next.js)    (Go /metrics)
            Load Balancer   Port 3000  Port 8080
                ↓              ↓         ↓
            TLS Termination  Auto-scale Auto-scale
                                         ↓
                                    Prometheus
```

## Key Highlights

- **Scale:** Auto-scaling 2-10 frontend, 2-15 backend replicas
- **Security:** RBAC, NetworkPolicy, Pod Security, TLS everywhere
- **Observability:** Prometheus metrics (NO heavy ELK stack, NO sidecars)
- **Infrastructure:** Gateway API with Envoy for enterprise routing
- **Simplicity:** Minimal footprint, metrics-driven monitoring

## Structure

```text
devops/
├── deploy.sh                      # Deployment orchestration script
├── README.md                      # This file
├── docker/                       # Docker multi-stage builds
│   ├── frontend.dockerfile       # Node.js → standalone (15MB)
│   └── backend.dockerfile        # Go → scratch (minimal)
├── kubernetes/                   # Kubernetes manifests
│   ├── frontend-deployment.yaml  # Frontend deployment & service (no sidecars)
│   ├── backend-deployment.yaml   # Backend with /metrics endpoint (no sidecars)
│   ├── security-policies.yaml    # RBAC, NetworkPolicy, PSP
│   ├── monitoring.yaml           # HPA, PDB, ServiceMonitor
│   └── gateway/                  # Gateway API configurations
│       ├── gateway.yaml          # Gateway definition (TLS, ports)
│       └── routes.yaml           # HTTPRoute definitions
└── local/                        # Local development observability
    ├── prometheus.yml            # Metrics scraping config
    ├── grafana-datasources.yml   # Grafana data sources
    ├── grafana-dashboards.yml    # Dashboard provisioning
    ├── README.md                 # Local stack guide
    └── dashboards/
        └── webrtc-dashboard.json # Pre-configured WebRTC metrics
```

## Components

**Tech Stack:** Kubernetes 1.25+, Gateway API, Envoy, Docker, Prometheus, Grafana

**Core Infrastructure:**

- **Gateway API** with Envoy for traffic management
- **Auto-scaling** deployments with HPA and PDB
- **Minimal logging** - stdout logs via `kubectl logs` (NO ELK, NO sidecars)
- **Metrics-first** - Prometheus + Grafana for WebRTC monitoring
- **Security** policies and RBAC
- **Health checks** and rolling updates

## Prerequisites

- Kubernetes Cluster (v1.25+)
- kubectl configured  
- Docker for building images

## Deployment

### Deployment Order (Critical!)

Resources must be deployed in this sequence:

1. **Security Policies** → RBAC, NetworkPolicy, PodSecurityPolicy
2. **Backend** → Go service with /metrics endpoint
3. **Frontend** → Next.js service
4. **Gateway** → Envoy Gateway + TLS termination
5. **Routes** → HTTPRoute definitions
6. **Monitoring** → HPA, PDB, ServiceMonitor

### Commands

```bash
# Full deployment (handles ordering automatically)
./devops/deploy.sh deploy

# Step by step
./devops/deploy.sh prerequisites  # Install Gateway API + Envoy
./devops/deploy.sh build          # Build Docker images
./devops/deploy.sh deploy         # Deploy all resources

# Check status
./devops/deploy.sh health
./devops/deploy.sh cleanup        # Remove all resources

# Environment variables
KUBECTL_CONTEXT=my-cluster ./devops/deploy.sh deploy
DRY_RUN=true ./devops/deploy.sh deploy  # Test without applying
```

### Access Points

- **Frontend:** <https://social-media.example.com>
- **WebSocket:** wss://social-media.example.com:8080/ws
- **API:** <https://social-media.example.com/api>
- **Metrics:** http://backend-service:8080/metrics (internal)

## WebRTC Metrics (Prometheus)

**Backend exposes `/metrics` endpoint with WebRTC-specific metrics:**

```go
// Defined in internal/v1/metrics/metrics.go
websocket_connections_total (gauge)           - Active WebSocket connections
webrtc_rooms_active (gauge)                   - Current number of rooms
room_participants (histogram)                 - Distribution of participants per room
websocket_events_total (counter)              - Events processed by type and status
message_processing_duration_seconds (histogram) - Event processing latency
webrtc_connection_success_rate_total (counter) - Connection success/failure tracking
```

**Metrics automatically recorded:**

- `hub.go:ServeWs()` → Increments websocket_connections_total
- `client.go:readPump()` → Decrements on disconnect
- `hub.go:getOrCreateRoom()` → Increments webrtc_rooms_active
- `room.go:handleClientConnect()` → Records room_participants distribution

**Query metrics locally:**

```bash
# Start backend
cd backend/go && go run cmd/v1/session/main.go

# Query metrics
curl http://localhost:8080/metrics
```

## Multi-Stage Docker Builds

### Frontend (frontend.dockerfile)

- **Stage 1:** `node:22-alpine` builder → `npm ci` + `npm run build`
- **Stage 2:** `node:22-alpine` runner → standalone output + non-root user (1001)
- **Health check:** `/api/health` endpoint
- **Security:** Read-only filesystem, capabilities dropped

### Backend (backend.dockerfile)

- **Stage 1:** `golang:1.24.5-alpine` builder → `CGO_ENABLED=0` static binary
- **Stage 2:** `scratch` → minimal 15MB image
- **Security:** No shell, no package manager, immutable
- **Note:** Health check uses curl from separate Alpine stage

## Configuration

### Environment Variables

**Frontend:**

- `NEXT_TELEMETRY_DISABLED=1`
- `NODE_ENV=production`
- `BACKEND_URL=http://backend-service:8080`

**Backend:**

- `GO_ENV=production`
- `PORT=8080`
- `JWT_SECRET`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID` (from secrets)

### Secrets Setup

Update the secrets in `backend-deployment.yaml`:

```bash
# Encode your secrets
echo -n "your-jwt-secret" | base64
echo -n "your-auth0-domain" | base64
echo -n "your-auth0-client-id" | base64
```

### TLS Setup

```bash
kubectl create secret tls social-media-tls \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key \
  -n social-media
```

## Gateway API & Routing

**Listeners defined in `gateway/gateway.yaml`:**

- **Port 80 (HTTP)** → Redirect to HTTPS
- **Port 443 (HTTPS)** → TLS termination with `social-media-tls` secret
- **Port 8080 (WebSocket)** → Backend `/ws` endpoint

**HTTP Routes in `gateway/routes.yaml`:**

- `/` → `frontend-service:80`
- `/ws` → `backend-service:8080` (WebSocket upgrade)
- `/api/*` → `backend-service:8080`

## Security Model

### Pod Security (security-policies.yaml)

- `runAsNonRoot: true` - Frontend uses UID 1001, backend uses scratch
- `readOnlyRootFilesystem: true` - No writes to container FS
- `allowPrivilegeEscalation: false` - Prevent privilege escalation
- `capabilities.drop: [ALL]` - No Linux capabilities

### Network Policies

- Frontend → Backend: Port 8080 only
- Ingress: Only via Gateway (ports 80, 443, 8080)

### RBAC

- `social-media-backend-sa` - Read pods/services (logging metadata)
- Minimal permissions per service account

## Monitoring & Auto-Scaling

### HPA Configuration (monitoring.yaml)

- **Frontend:** 2-10 replicas, target 70% CPU/memory
- **Backend:** 2-15 replicas, target 60% CPU/memory
- **Scale-up:** +2 pods per 30s when threshold exceeded
- **Scale-down:** -1 pod per 5min (stabilization)

### Metrics Collection

- **ServiceMonitor** scrapes `/metrics` from backend every 30s
- **Prometheus** aggregates and stores time-series data
- **Grafana** visualizes WebRTC dashboards (rooms, connections, participants)

### Pod Disruption Budgets

- Ensures minimum availability during cluster operations
- Frontend/Backend: Always maintain at least 1 replica

## Local Development vs Production

### Local (docker-compose.yml)

- No sidecars, logs to stdout
- Hot reload for frontend (`npm run dev`)
- No Gateway API, direct port mapping
- Single replica, no auto-scaling

### Production (Kubernetes)

- No sidecars (minimal approach)
- Compiled Next.js standalone server
- Envoy Gateway with TLS + rate limiting
- HPA, PDB, NetworkPolicy, PodSecurity

## Local Observability Stack

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

**Example Queries in Grafana:**

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

## Troubleshooting

### Check Deployment Status

```bash
kubectl get all -n social-media
kubectl get gateway social-media-gateway -n social-media -o yaml
```

### Debug Logs

```bash
# View application logs (no sidecars!)
kubectl logs -n social-media deployment/backend-deployment -c backend
kubectl logs -n social-media deployment/frontend-deployment -c frontend
```

### Gateway Issues

```bash
# Check Gateway status
kubectl describe gateway social-media-gateway -n social-media
# Look for "Programmed: True" condition

# Check Envoy logs
kubectl logs -n envoy-gateway-system deployment/envoy-gateway

# Check routes
kubectl get httproute -n social-media
```

### Metrics Not Showing

```bash
# Check Prometheus targets
kubectl port-forward -n social-media svc/prometheus 9090:9090
# Visit http://localhost:9090/targets

# Check ServiceMonitor is created
kubectl get servicemonitor -n social-media

# Test backend metrics endpoint
kubectl port-forward -n social-media svc/backend-service 8080:8080
curl http://localhost:8080/metrics
```

### HPA Not Scaling

```bash
# Check metrics-server is installed
kubectl top nodes
kubectl top pods -n social-media

# View HPA conditions
kubectl describe hpa frontend-hpa -n social-media
kubectl describe hpa backend-hpa -n social-media
```

### Test Gateway Routing

```bash
kubectl port-forward -n social-media svc/frontend-service 3000:80
kubectl port-forward -n social-media svc/backend-service 8080:8080
```

### Network Debug

```bash
kubectl get svc -n social-media
kubectl get endpoints -n social-media
kubectl get networkpolicy -n social-media
```

## Advanced Configuration

### Custom Domains

```bash
# Get Gateway LoadBalancer IP
kubectl get gateway social-media-gateway -n social-media -o jsonpath='{.status.addresses[0].value}'
```

1. Update hostnames in `gateway/routes.yaml`
2. Update TLS certificate in `gateway/gateway.yaml`
3. Point DNS to Gateway IP

### Monitoring Stack Installation

The minimal observability stack (Prometheus + Grafana) can be installed via Helm:

```bash
# Deploy Prometheus + Grafana
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace

# ServiceMonitor in monitoring.yaml will auto-configure scraping
```

### GitOps Integration

```yaml
# ArgoCD Application example
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: video-conferencing
spec:
  source:
    repoURL: https://github.com/RoseWrightdev/Video-Conferencing
    path: devops/kubernetes
    targetRevision: HEAD
  destination:
    server: https://kubernetes.default.svc
    namespace: social-media
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## Common Issues

### Gateway not routing

```bash
# Check Gateway status
kubectl describe gateway social-media-gateway -n social-media
# Look for "Programmed: True" condition

# Check Envoy logs
kubectl logs -n envoy-gateway-system deployment/envoy-gateway
```

### Frontend/Backend not starting

```bash
# Check for ImagePullBackOff or CrashLoopBackOff
kubectl describe pod <pod-name> -n social-media

# View container logs
kubectl logs <pod-name> -n social-media -c backend
kubectl logs <pod-name> -n social-media -c frontend
```

## Cleanup

```bash
./devops/deploy.sh cleanup
```
