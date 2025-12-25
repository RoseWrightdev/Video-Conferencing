#!/bin/bash
set -e

# Video Conferencing Platform Kubernetes Deployment Script
# This script deploys the entire platform using Gateway API and Envoy

NAMESPACE="video-conferencing"
KUBECTL_CONTEXT=${KUBECTL_CONTEXT:-""}
DRY_RUN=${DRY_RUN:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check Gateway API CRDs
    if ! kubectl get crd gateways.gateway.networking.k8s.io &> /dev/null; then
        log_warning "Gateway API CRDs not found. Installing..."
        kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml
    fi
    
    # Check Envoy Gateway
    if ! kubectl get namespace envoy-gateway-system &> /dev/null; then
        log_warning "Envoy Gateway not found. Installing..."
        kubectl apply -f https://github.com/envoyproxy/gateway/releases/download/latest/install.yaml
        kubectl wait --timeout=5m -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available
    fi
    
    log_success "Prerequisites check completed"
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."
    
    # Build frontend image
    log_info "Building frontend image..."
    docker build -f devops/docker/frontend.dockerfile -t video-conferencing/frontend:latest .
    
    # Build backend image
    log_info "Building backend image..."
    docker build -f devops/docker/backend.dockerfile -t video-conferencing/backend:latest .
    
    # Build Rust SFU image
    log_info "Building Rust SFU image..."
    docker build -f devops/docker/rust-sfu.dockerfile -t video-conferencing/rust-sfu:latest .
    
    log_success "Docker images built successfully"
}

# Deploy function
deploy() {
    local file=$1
    local description=$2
    
    log_info "Deploying $description..."
    
    if [ "$DRY_RUN" = "true" ]; then
        kubectl apply -f "$file" --dry-run=client -o yaml
    else
        kubectl apply -f "$file"
    fi
}

# Main deployment function
deploy_platform() {
    log_info "Starting Video Conferencing Platform deployment..."
    
    # Set kubectl context if provided
    if [ -n "$KUBECTL_CONTEXT" ]; then
        kubectl config use-context "$KUBECTL_CONTEXT"
    fi
    
    # Deploy in order
    deploy "devops/kubernetes/frontend-deployment.yaml" "Namespace and Frontend Services"
    deploy "devops/kubernetes/security-policies.yaml" "Security Policies and RBAC"
    deploy "devops/kubernetes/backend-secrets.yaml" "Backend Secrets"
    deploy "devops/kubernetes/backend-deployment.yaml" "Backend Services"
    deploy "devops/kubernetes/rust-sfu-deployment.yaml" "Rust SFU Services"
    deploy "devops/kubernetes/gateway/gateway.yaml" "Gateway Configuration"
    deploy "devops/kubernetes/gateway/envoy-config.yaml" "Envoy Configuration"
    deploy "devops/kubernetes/gateway/routes.yaml" "HTTP Routes"
    deploy "devops/kubernetes/monitoring.yaml" "Monitoring and Autoscaling"
    deploy "devops/kubernetes/alertmanager.yaml" "Alertmanager Configuration"
    
    if [ "$DRY_RUN" = "false" ]; then
        # Wait for backend and frontend to be ready
        log_info "Waiting for services to be ready..."
        kubectl wait --for=condition=ready --timeout=300s pod -l app.kubernetes.io/name=backend -n $NAMESPACE || true
        kubectl wait --for=condition=ready --timeout=300s pod -l app.kubernetes.io/name=frontend -n $NAMESPACE || true
        kubectl wait --for=condition=ready --timeout=300s pod -l app.kubernetes.io/name=rust-sfu -n $NAMESPACE || true
        
        # Wait for deployments
        log_info "Waiting for deployments to be ready..."
        kubectl wait --for=condition=available --timeout=300s deployment/frontend-deployment -n $NAMESPACE || true
        kubectl wait --for=condition=available --timeout=300s deployment/backend-deployment -n $NAMESPACE || true
        kubectl wait --for=condition=available --timeout=300s statefulset/rust-sfu -n $NAMESPACE || true
        
        # Check Gateway status
        log_info "Checking Gateway status..."
        kubectl get gateway video-conferencing-gateway -n $NAMESPACE || true
        kubectl get httproute -n $NAMESPACE || true
        
        log_success "Video Conferencing Platform deployed successfully!"
        
        # Show access information
        log_info "Access Information:"
        echo "Frontend: https://meet.rosewright.dev"
        echo "Backend API: https://api.rosewright.dev"
        echo "WebSocket: wss://api.rosewright.dev/ws"
        echo "Monitoring: https://monitor.rosewright.dev"
        echo "Gateway IP: $(kubectl get gateway video-conferencing-gateway -n $NAMESPACE -o jsonpath='{.status.addresses[0].value}' 2>/dev/null || echo 'Not available yet')"
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up Video Conferencing Platform..."
    
    kubectl delete namespace $NAMESPACE --ignore-not-found=true
    
    log_success "Cleanup completed"
}

# Health check function
health_check() {
    log_info "Performing health checks..."
    
    # Check namespace
    if ! kubectl get namespace $NAMESPACE &> /dev/null; then
        log_error "Namespace $NAMESPACE not found"
        return 1
    fi
    
    # Check deployments
    local frontend_ready=$(kubectl get deployment frontend-deployment -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    local backend_ready=$(kubectl get deployment backend-deployment -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    local rust_sfu_ready=$(kubectl get statefulset rust-sfu -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    
    log_info "Frontend pods ready: $frontend_ready"
    log_info "Backend pods ready: $backend_ready"
    log_info "Rust SFU pods ready: $rust_sfu_ready"
    
    # Check gateway
    if kubectl get gateway video-conferencing-gateway -n $NAMESPACE &> /dev/null; then
        local gateway_status=$(kubectl get gateway video-conferencing-gateway -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}' 2>/dev/null || echo "Unknown")
        log_info "Gateway Programmed status: $gateway_status"
        
        local gateway_ip=$(kubectl get gateway video-conferencing-gateway -n $NAMESPACE -o jsonpath='{.status.addresses[0].value}' 2>/dev/null || echo "Not assigned")
        log_info "Gateway IP: $gateway_ip"
    else
        log_warning "Gateway not found"
    fi
    
    # Check services
    log_info "Services:"
    kubectl get svc -n $NAMESPACE
    
    # Check pods
    log_info "Pods:"
    kubectl get pods -n $NAMESPACE
    
    log_success "Health check completed"
}

# Main script logic
case "${1:-deploy}" in
    "prerequisites")
        check_prerequisites
        ;;
    "build")
        build_images
        ;;
    "deploy")
        check_prerequisites
        build_images
        deploy_platform
        ;;
    "cleanup")
        cleanup
        ;;
    "health")
        health_check
        ;;
    *)
        echo "Usage: $0 {prerequisites|build|deploy|cleanup|health}"
        echo ""
        echo "Commands:"
        echo "  prerequisites  - Check and install prerequisites"
        echo "  build         - Build Docker images"
        echo "  deploy        - Full deployment (prerequisites + build + deploy)"
        echo "  cleanup       - Remove all resources"
        echo "  health        - Check deployment health"
        echo ""
        echo "Environment variables:"
        echo "  KUBECTL_CONTEXT - Kubernetes context to use"
        echo "  DRY_RUN        - Set to 'true' for dry run (default: false)"
        exit 1
        ;;
esac
