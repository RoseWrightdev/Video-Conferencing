# Runbook: GRPCHighErrorRate

## Severity
CRITICAL

## Description
The error rate for gRPC calls between Backend and Rust SFU is > 5%.

## Impact
- Users may fail to connect to media streams.
- Signaling operations may fail.

## Investigation
1. Identify which gRPC method is failing (metrics).
2. Check Rust SFU logs for panics or errors.
   ```bash
   kubectl logs -n video-conferencing -l app=rust-sfu
   ```
3. Check Backend logs for gRPC error codes (e.g., UNAVAILABLE, DEADLINE_EXCEEDED).
4. Check network latency between pods.

## Mitigation
- **Scale Out SFU**: If overloaded, increase SFU replicas.
- **Restart SFUs**: If a specific pod is bad, delete it `kubectl delete pod <sfu-pod>`.

## Escalation
Escalate to Backend/Rust Team if error rate persists.
