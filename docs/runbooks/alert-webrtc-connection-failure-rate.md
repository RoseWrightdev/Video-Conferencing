# Runbook: WebRTCConnectionFailureRate

## Severity
CRITICAL

## Description
More than 10% of WebRTC connections are failing to establish.

## Impact
- Users cannot see or hear each other.
- Bad user experience.

## Investigation
1. Check STUN/TURN server availability.
2. Check Client-side logs (via logs aggregation if available).
3. Check Rust SFU logs for ICE failures.
4. Verify Firewall rules allow UDP traffic on updated port ranges.

## Mitigation
- Scale up SFU if CPU is high.
- Check external connectivity (NAT gateways).

## Escalation
Escalate to WebRTC Team immediately.
