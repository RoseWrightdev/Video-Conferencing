# DevOps Quick Reference Guide

## 🚀 Quick Deploy Commands

```bash
# Full automated deployment
./devops/deploy.sh deploy

# Dry run (see what would be applied)
DRY_RUN=true ./devops/deploy.sh deploy

# Check system health
./devops/deploy.sh health

# Clean up everything
./devops/deploy.sh cleanup
```

## 📁 Key Files Reference

### Kubernetes Manifests (devops/kubernetes/)
```
├── backend-deployment.yaml       # Go backend (Port: 8080)
├── backend-secrets.yaml          # ⚠️ UPDATE BEFORE DEPLOY
├── frontend-deployment.yaml      # Next.js frontend (Port: 3000)
├── rust-sfu-deployment.yaml      # Rust SFU (Port: 50051 gRPC)
├── security-policies.yaml        # RBAC, NetworkPolicy
├── monitoring.yaml               # HPA, PDB, Prometheus alerts
└── gateway/
    ├── gateway.yaml              # Gateway API entry point
    ├── routes.yaml               # HTTP routing rules
    └── envoy-config.yaml         # Envoy proxy settings
```

### Docker Images (devops/docker/)
```
├── backend.dockerfile            # Go backend (Alpine-based)
├── frontend.dockerfile           # Next.js SSR
└── rust-sfu.dockerfile           # Rust SFU (Alpine-based)
```

## 🔐 Secrets Setup

### 1. Generate Secrets
```bash
# JWT Secret
openssl rand -base64 32

# Encode for Kubernetes
echo -n "your-secret-value" | base64
```

### 2. Update backend-secrets.yaml
Replace these placeholders:
- `JWT_SECRET`
- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `REDIS_URL` (if using Redis)

### 3. Create TLS Secret
```bash
# Using cert-manager (recommended)
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: rosewright-wildcard
  namespace: video-conferencing
spec:
  secretName: rosewright-wildcard-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - "*.rosewright.dev"
EOF

# Or manually
kubectl create secret tls rosewright-wildcard-tls \
  --cert=cert.pem \
  --key=key.pem \
  -n video-conferencing
```

## 🌐 DNS Configuration

Point these to your Gateway LoadBalancer IP:

```bash
# Get Gateway IP
kubectl get gateway video-conferencing-gateway \
  -n video-conferencing \
  -o jsonpath='{.status.addresses[0].value}'

# Add DNS A records:
meet.rosewright.dev      → <GATEWAY_IP>
api.rosewright.dev       → <GATEWAY_IP>
monitor.rosewright.dev   → <GATEWAY_IP>
```

## 📊 Monitoring & Debugging

### Check Pod Status
```bash
kubectl get pods -n video-conferencing
kubectl describe pod <pod-name> -n video-conferencing
kubectl logs <pod-name> -n video-conferencing
```

### Check Services
```bash
kubectl get svc -n video-conferencing
kubectl get gateway -n video-conferencing
kubectl get httproute -n video-conferencing
```

### View Metrics
```bash
# Port-forward to backend metrics
kubectl port-forward -n video-conferencing \
  svc/backend-service 8080:8080

# Access metrics
curl http://localhost:8080/metrics

# Port-forward to Grafana (if deployed in monitoring namespace)
kubectl port-forward -n monitoring \
  svc/prometheus-grafana 3000:80

# Port-forward to Alertmanager
kubectl port-forward -n video-conferencing \
  svc/alertmanager 9093:9093

# Access Alertmanager UI: http://localhost:9093
```

### Check Alerting Status
```bash
# View active alerts in Prometheus
kubectl port-forward -n monitoring svc/prometheus 9090:9090
# Visit: http://localhost:9090/alerts

# View Alertmanager status
kubectl logs -n video-conferencing deployment/alertmanager

# Test Slack integration manually
kubectl exec -n video-conferencing deployment/alertmanager -- \
  amtool alert add test severity=warning message="Test alert"
```

### Check Gateway Status
```bash
# View Gateway details
kubectl describe gateway video-conferencing-gateway \
  -n video-conferencing

# Should see:
# Conditions:
#   Type: Programmed
#   Status: True
```

### Debug Envoy Proxy
```bash
# Check Envoy logs
kubectl logs -n envoy-gateway-system \
  deployment/envoy-gateway

# View Envoy config
kubectl port-forward -n envoy-gateway-system \
  deployment/envoy-gateway 19000:19000

# Access: http://localhost:19000/config_dump
```

## 🏗️ CI/CD Pipeline

### GitHub Actions Workflow
Triggers on:
- **Push to `main`** → Production deployment
- **Push to `develop`** → Staging deployment
- **Pull Request** → Tests only (no deployment)

### Required GitHub Secrets
```bash
# In repository settings → Secrets and variables → Actions

KUBE_CONFIG_STAGING
KUBE_CONFIG_PRODUCTION

# Optional:
DOCKERHUB_USERNAME
DOCKERHUB_TOKEN
```

### Manual Workflow Trigger
```bash
# Via GitHub CLI
gh workflow run deploy.yml -f environment=staging

# Or use GitHub UI: Actions → Deploy → Run workflow
```

## 🔧 Common Issues & Fixes

### Issue: Pods stuck in ImagePullBackOff
```bash
# Check image exists
docker images | grep video-conferencing

# Re-tag and push
docker tag video-conferencing/backend:latest \
  ghcr.io/yourusername/video-conferencing-backend:latest

docker push ghcr.io/yourusername/video-conferencing-backend:latest
```

### Issue: Gateway not getting IP
```bash
# Check cloud provider LoadBalancer provisioning
kubectl get svc -n envoy-gateway-system

# Check Envoy Gateway is running
kubectl get pods -n envoy-gateway-system
```

### Issue: WebSocket connections failing
```bash
# Check backend logs
kubectl logs -n video-conferencing \
  deployment/backend-deployment --tail=50

# Verify route configuration
kubectl get httproute backend-api-route \
  -n video-conferencing -o yaml

# Should see WebSocket upgrade headers configured
```

### Issue: Rust SFU pods not starting
```bash
# Most likely: gRPC health probe failing
kubectl describe pod rust-sfu-0 -n video-conferencing

# Check if grpc_health_probe is in the image
kubectl exec -it rust-sfu-0 -n video-conferencing \
  -- ls -la /bin/grpc_health_probe

# Temporarily disable health check to debug
kubectl edit statefulset rust-sfu -n video-conferencing
# Comment out livenessProbe and readinessProbe
```

## 📈 Scaling

### Manual Scaling
```bash
# Scale frontend
kubectl scale deployment frontend-deployment \
  --replicas=5 -n video-conferencing

# Scale backend
kubectl scale deployment backend-deployment \
  --replicas=10 -n video-conferencing

# Scale Rust SFU
kubectl scale statefulset rust-sfu \
  --replicas=5 -n video-conferencing
```

### Auto-scaling (HPA)
```bash
# View HPA status
kubectl get hpa -n video-conferencing

# Edit HPA settings
kubectl edit hpa backend-hpa -n video-conferencing
```

## 🧪 Local Testing with Observability

### Start observability stack
```bash
cd devops/local/dashboards
docker-compose -f docker-compose.observability.yml up -d

# Access:
# Grafana:    http://localhost:3001  (admin/admin)
# Prometheus: http://localhost:9090
```

### Run app locally
```bash
# Terminal 1: Frontend
cd frontend && npm run dev

# Terminal 2: Backend
cd backend/go && go run cmd/v1/session/main.go

# Terminal 3: Rust SFU
cd backend/rust/sfu && cargo run
```

### View metrics
1. Open Grafana: http://localhost:3001
2. Navigate to Dashboards → WebRTC Dashboard
3. Generate traffic by joining rooms
4. Watch real-time metrics

## 🎯 Performance Monitoring

### Key Metrics to Watch

**Backend (Go):**
- `websocket_connections_total` - Active WebSocket connections
- `webrtc_rooms_active` - Number of active rooms
- `message_processing_duration_seconds` - Event latency

**Rust SFU:**
- UDP packet loss rate
- Active peer connections
- Memory usage (should be very stable)

**Frontend:**
- Page load times
- Client-side errors

### Prometheus Queries
```promql
# Average WebSocket connections per pod
avg(websocket_connections_total)

# 95th percentile latency
histogram_quantile(0.95, 
  rate(message_processing_duration_seconds_bucket[5m]))

# Connection success rate
rate(webrtc_connection_success_rate_total{status="success"}[5m]) / 
rate(webrtc_connection_success_rate_total[5m])
```

## 🔄 Rollback

```bash
# View deployment history
kubectl rollout history deployment/backend-deployment \
  -n video-conferencing

# Rollback to previous version
kubectl rollout undo deployment/backend-deployment \
  -n video-conferencing

# Rollback to specific revision
kubectl rollout undo deployment/backend-deployment \
  --to-revision=2 -n video-conferencing
```

## 📦 Backup & Recovery

### Backup Namespace
```bash
kubectl get all,secrets,configmaps,pvc \
  -n video-conferencing \
  -o yaml > backup-$(date +%Y%m%d).yaml
```

### Restore from Backup
```bash
kubectl apply -f backup-20251223.yaml
```

---

**Updated:** December 23, 2025  
**Version:** 1.0  
**Maintainer:** DevOps Team
