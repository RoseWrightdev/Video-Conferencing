# Secrets Management Runbook

## Overview
This runbook describes how to manage secrets for the Video Conferencing Platform. We use Kubernetes Secrets to store sensitive information and inject them as environment variables into our applications.

## Prerequisites
- `kubectl` configured with access to the cluster
- `openssl` or similar tool for generating random strings
- Access to the `video-conferencing` namespace

## Secret Rotation Policy
- **Rotation Frequency**: All secrets must be rotated before the MVP launch and every 90 days thereafter.
- **Immediate Rotation**: Rotate immediately if a secret is suspected to be compromised.

## Creating/Rotating Secrets

### 1. Generate New Secret Values
Generate strong, random values for your secrets.

**JWT Secret (64 chars):**
```bash
openssl rand -base64 48 | tr -d '\n' ; echo
```

**Redis Password:**
```bash
openssl rand -base64 32 | tr -d '\n' ; echo
```

**Auth0 Key:**
Obtain from Auth0 Dashboard.

### 2. Create/Update Kubernetes Secret
We use `kubectl create secret generic` to avoid storing secrets in files.

**Command:**
```bash
# Delete existing secret if rotating
kubectl delete secret backend-secrets -n video-conferencing --ignore-not-found

# Create new secret
kubectl create secret generic backend-secrets \
  --namespace video-conferencing \
  --from-literal=JWT_SECRET="<Paste JWT Secret Here>" \
  --from-literal=REDIS_PASSWORD="<Paste Redis Password Here>" \
  --from-literal=AUTH0_CLIENT_SECRET="<Paste Auth0 Secret Here>" \
  --from-literal=DATABASE_URL="<Paste Database URL Here>"
```

### 3. Restart Deployments
Secrets are mounted as environment variables, so pods must be restarted to pick up new values.

```bash
kubectl rollout restart deployment backend-deployment -n video-conferencing
kubectl rollout restart deployment rust-sfu-deployment -n video-conferencing
```

## Troubleshooting
**Verify Secret Creation:**
```bash
kubectl get secret backend-secrets -n video-conferencing -o yaml
```
*Note: Values in YAML output are base64 encoded.*

**Verify Pod Env Vars:**
```bash
kubectl exec -it -n video-conferencing deploy/backend-deployment -- env | grep SECRET
```

## Migration to External Secrets Operator (Future)
We plan to migrate to External Secrets Operator (ESO) post-MVP.
1. Install ESO via Helm.
2. Configure `ClusterSecretStore` pointing to AWS Secrets Manager.
3. Replace manual `kubectl create secret` with `ExternalSecret` manifests (archived in `devops/kubernetes/external-secrets.yaml`).
