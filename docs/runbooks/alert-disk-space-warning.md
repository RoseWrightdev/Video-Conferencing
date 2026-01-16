# Runbook: DiskSpaceWarning

## Severity
WARNING

## Description
Disk space usage on a node is > 80%.

## Impact
- Pods may be evicted if ephemeral storage fills up.
- Logs may not be written.

## Investigation
1. Identify the node.
   ```bash
   kubectl get nodes
   ```
2. SSH into node (if possible) or use `kubectl debug`.
3. Check for large log files or unused images.
   ```bash
   docker system prune -a (if applicable)
   ```

## Mitigation
- Add more nodes to the cluster.
- Expand disk size.
- Clean up unused resources.
