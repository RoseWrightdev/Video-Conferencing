# Runbook: BackendDown

## Severity
CRITICAL

## Description
Backend service is down.

## Mitigation
- Check pod status.
- Check `kubectl describe pod`.
- Restart deployment.
