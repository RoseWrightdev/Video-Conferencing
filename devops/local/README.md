# Local Observability Stack

Minimal monitoring stack for local development. Learn how production dashboards work without deploying to Kubernetes.

## Quick Start

```bash
# From project root
docker-compose -f docker-compose.observability.yml up

# In separate terminals:
cd frontend && npm run dev                      # http://localhost:3000
cd backend/go && go run cmd/v1/session/main.go  # http://localhost:8080
```

## Access Dashboards

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090

## Stack Components

### Prometheus (Metrics Collection)
- **Port**: 9090
- **Config**: `prometheus.yml`
- **Targets**:
  - Backend: `host.docker.internal:8080/metrics`
  - Frontend: `host.docker.internal:3000/api/metrics` (optional)
- **Scrape Interval**: 10s (backend), 30s (frontend)

### Grafana (Visualization)
- **Port**: 3001
- **Credentials**: admin/admin
- **Datasources**: `grafana-datasources.yml` (Prometheus)
- **Dashboards**: `grafana-dashboards.yml` → loads from `dashboards/`
- **Pre-configured**:
  - WebRTC Dashboard: connections, rooms, participants

## WebRTC Metrics

Backend exposes these metrics at `http://localhost:8080/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `websocket_connections_total` | Gauge | Active WebSocket connections |
| `webrtc_rooms_active` | Gauge | Current number of rooms |
| `room_participants` | Histogram | Participants per room distribution |
| `websocket_events_total` | Counter | Events processed (by type, status) |
| `message_processing_duration_seconds` | Histogram | Event processing latency |

## Example Queries

### WebSocket Connections
```promql
websocket_connections_total
```

### Active Rooms
```promql
webrtc_rooms_active
```

### 95th Percentile Room Size
```promql
histogram_quantile(0.95, rate(room_participants_bucket[5m]))
```

### Average Event Processing Time
```promql
rate(message_processing_duration_seconds_sum[5m]) / 
rate(message_processing_duration_seconds_count[5m])
```

### Connection Success Rate
```promql
rate(webrtc_connection_success_rate_total{status="success"}[5m]) / 
rate(webrtc_connection_success_rate_total[5m])
```

## Testing Workflow

1. **Start Stack**: `docker-compose -f docker-compose.observability.yml up`
2. **Run Backend**: `cd backend/go && go run cmd/v1/session/main.go`
3. **Run Frontend**: `cd frontend && npm run dev`
4. **Generate Traffic**:
   - Open multiple browser windows
   - Join the same room
   - Send chat messages
   - Toggle audio/video
   - Share screen
5. **View Metrics**:
   - Grafana: http://localhost:3001
   - Select "WebRTC Video Conference" dashboard
   - Watch real-time metrics update
6. **Query Prometheus**:
   - Prometheus: http://localhost:9090
   - Try example queries above

## Troubleshooting

### Metrics not showing in Grafana

Check Prometheus targets are healthy:
```bash
open http://localhost:9090/targets
```

Both backend and frontend should show "UP" status.

### Backend metrics endpoint 404

Ensure backend is running and `/metrics` endpoint exists:
```bash
curl http://localhost:8080/metrics
```

Should return Prometheus text format metrics.

## Production vs Local

| Feature | Local | Production |
|---------|-------|------------|
| Metrics Storage | In-memory (lost on restart) | Persistent volume |
| Scrape Interval | 10-30s | 15s |
| Retention | ~2 hours | 15 days |
| High Availability | Single instance | Replicated |
| Authentication | admin/admin | OAuth/LDAP |
| TLS | HTTP only | HTTPS with cert |

## See Also

- [Prometheus Query Language (PromQL)](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboard Guide](https://grafana.com/docs/grafana/latest/dashboards/)
- [Backend Metrics Implementation](../../backend/go/internal/v1/metrics/metrics.go)
- [Production Monitoring Setup](../kubernetes/monitoring.yaml)
