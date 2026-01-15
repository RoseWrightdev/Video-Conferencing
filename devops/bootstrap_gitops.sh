#!/bin/bash
set -e

# Colors for output
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_info "Bootstrapping GitOps with ArgoCD..."

# Check prerequisites
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed"
    exit 1
fi

# Create argocd namespace
log_info "Creating argocd namespace..."
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

# Install ArgoCD
log_info "Installing ArgoCD..."
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD server
log_info "Waiting for ArgoCD server to be ready..."
kubectl wait --timeout=300s -n argocd deployment/argocd-server --for=condition=Available

# Apply Root App
log_info "Applying Root Application..."
kubectl apply -f devops/argocd/root-app.yaml

log_success "GitOps Bootstrap completed! ArgoCD is managing the cluster."
log_info "To access ArgoCD UI:"
log_info "kubectl port-forward svc/argocd-server -n argocd 8080:443"
