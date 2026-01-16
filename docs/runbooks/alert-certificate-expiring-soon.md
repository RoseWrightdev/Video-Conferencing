# Runbook: CertificateExpiringSoon

## Severity
WARNING

## Description
SSL Certificate expires in less than 7 days.

## Impact
- Service will become unreachable if certificate expires.
- Security warnings for users.

## Investigation
1. Check `cert-manager` logs:
   ```bash
   kubectl logs -n cert-manager -l app=cert-manager
   ```
2. Describe the Certificate resource:
   ```bash
   kubectl describe certificate -n video-conferencing
   ```

## Mitigation
- Force renewal: `kubectl delete secret <cert-secret-name>` (cert-manager should recreate it).
- Check DNS configuration if challenges are failing.
