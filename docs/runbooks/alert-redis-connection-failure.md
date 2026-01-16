# Runbook: RedisConnectionFailure

## Severity
CRITICAL

## Description
The backend service cannot connect to Redis. This causes failure in room management, participant tracking, and rate limiting.

## Impact
- Users cannot create new rooms.
- Users cannot join existing rooms.
- Rate limiting is disabled (fail-open or fail-closed depending on config).

## Investigation
1. Check Redis pod status:
   ```bash
   kubectl get pods -n video-conferencing -l app=redis
   ```
2. Check Redis logs:
   ```bash
   kubectl logs -n video-conferencing -l app=redis
   ```
3. Check Backend logs for connection errors:
   ```bash
   kubectl logs -n video-conferencing -l app=backend
   ```
4. Verify Network Policies are not blocking traffic.

## Mitigation
- **Restart Redis**: `kubectl rollout restart deployment redis -n video-conferencing`
- **Restart Backend**: `kubectl rollout restart deployment backend -n video-conferencing` (if Redis is up but backend is stuck).

## Escalation
If Redis is persistently down or crashing, escalate to Infrastructure Team.
