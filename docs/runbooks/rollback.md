# Rollback Procedure

This runbook describes how to quickly revert the Video Conferencing platform to a previous stable state in case of a bad deployment.

## Prerequisites

- `kubectl` access to the cluster
- Permissions to perform rollouts in the `video-conferencing` namespace

## Quick Rollback (Previous Version)

If the current deployment is unstable, use these commands to revert to the immediately preceding revision.

### 1. Backend Service
```bash
kubectl rollout undo deployment/backend-deployment -n video-conferencing
```

### 2. Frontend Service
```bash
kubectl rollout undo deployment/frontend-deployment -n video-conferencing
```

### 3. Rust SFU Fleet
```bash
# Note: Agones fleets might require specific handling, but generally support standard rollout undo
kubectl rollout undo fleet/rust-sfu -n video-conferencing
```

---

## Rollback to Specific Revision

If you need to go back further than the last version:

1. **List history:**
   ```bash
   kubectl rollout history deployment/backend-deployment -n video-conferencing
   ```

2. **Rollback to specific revision (e.g., revision 2):**
   ```bash
   kubectl rollout undo deployment/backend-deployment --to-revision=2 -n video-conferencing
   ```

---

## Verification

After triggering a rollback, verify the service health:

1. **Check Rollout Status:**
   ```bash
   kubectl rollout status deployment/backend-deployment -n video-conferencing
   ```

2. **Verify Pod Health:**
   ```bash
   kubectl get pods -n video-conferencing
   ```
   Ensure all pods are `Running` and passing health checks (`1/1` in READY column).

3. **Check Logs:**
   ```bash
   kubectl logs -l app.kubernetes.io/name=backend -n video-conferencing --tail=50
   ```
