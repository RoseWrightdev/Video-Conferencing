#!/bin/bash
set -e

# Social Media Platform Kubernetes Deployment Script
# This script deploys the entire platform using Gateway API and Envoy

NAMESPACE="social-media"
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
    docker build -f devops/docker/frontend.dockerfile -t social-media/frontend:latest .
    
    # Build backend image
    log_info "Building backend image..."
    docker build -f devops/docker/backend.dockerfile -t social-media/backend:latest .
    
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
    log_info "Starting Social Media Platform deployment..."
    
    # Set kubectl context if provided
    if [ -n "$KUBECTL_CONTEXT" ]; then
        kubectl config use-context "$KUBECTL_CONTEXT"
    fi
    
    # Deploy in order (minimal stack - no ELK logging infrastructure)
    deploy "devops/kubernetes/security-policies.yaml" "Security Policies and RBAC"
    deploy "devops/kubernetes/backend-deployment.yaml" "Backend Services"
    deploy "devops/kubernetes/frontend-deployment.yaml" "Frontend Services"
    deploy "devops/kubernetes/gateway/gateway.yaml" "Gateway Configuration"
    deploy "devops/kubernetes/gateway/envoy-config.yaml" "Envoy Configuration"
    deploy "devops/kubernetes/gateway/routes.yaml" "HTTP Routes"
    deploy "devops/kubernetes/monitoring.yaml" "Monitoring and Autoscaling"
    
    if [ "$DRY_RUN" = "false" ]; then
        # Wait for backend and frontend to be ready
        log_info "Waiting for services to be ready..."
        kubectl wait --for=condition=ready --timeout=300s pod -l app.kubernetes.io/name=backend -n social-media
        kubectl wait --for=condition=ready --timeout=300s pod -l app.kubernetes.io/name=frontend -n social-media
        
        # Wait for deployments
        log_info "Waiting for deployments to be ready..."
        kubectl wait --for=condition=available --timeout=300s deployment/frontend-deployment -n $NAMESPACE
        kubectl wait --for=condition=available --timeout=300s deployment/backend-deployment -n $NAMESPACE
        
        # Check Gateway status
        log_info "Checking Gateway status..."
        kubectl get gateway social-media-gateway -n $NAMESPACE
        kubectl get httproute -n $NAMESPACE
        
        log_success "Social Media Platform deployed successfully!"
        
        # Show access information
        log_info "Access Information:"
        echo "Frontend: https://social-media.example.com"
        echo "WebSocket: wss://ws.social-media.example.com/ws"
        echo "Kibana (Logs): http://kibana.logging.svc.cluster.local:5601"
        echo "Grafana (Metrics): https://social-media.example.com/grafana"
        echo "Gateway IP: $(kubectl get gateway social-media-gateway -n $NAMESPACE -o jsonpath='{.status.addresses[0].value}' 2>/dev/null || echo 'Not available')"
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up Social Media Platform..."
    
    kubectl delete namespace $NAMESPACE --ignore-not-found=true
    kubectl delete namespace logging --ignore-not-found=true
    
    log_success "Cleanup completed"
}

# Health check function
health_check() {
    log_info "Performing health checks..."
    
    # Check namespaces
    if ! kubectl get namespace $NAMESPACE &> /dev/null; then
        log_error "Namespace $NAMESPACE not found"
        return 1
    fi
    
    if ! kubectl get namespace logging &> /dev/null; then
        log_error "Namespace logging not found"
        return 1
    fi
    
    # Check deployments
    local frontend_ready=$(kubectl get deployment frontend-deployment -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    local backend_ready=$(kubectl get deployment backend-deployment -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    local kibana_ready=$(kubectl get deployment kibana -n logging -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    
    log_info "Frontend pods ready: $frontend_ready"
    log_info "Backend pods ready: $backend_ready"
    log_info "Kibana pods ready: $kibana_ready"
    
    # Check Elasticsearch cluster
    local elasticsearch_pods=$(kubectl get pods -n logging -l app.kubernetes.io/name=elasticsearch --no-headers 2>/dev/null | wc -l)
    local elasticsearch_ready=$(kubectl get pods -n logging -l app.kubernetes.io/name=elasticsearch --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
    log_info "Elasticsearch pods: $elasticsearch_ready/$elasticsearch_pods"
    
    # Check gateway
    if kubectl get gateway social-media-gateway -n $NAMESPACE &> /dev/null; then
        local gateway_status=$(kubectl get gateway social-media-gateway -n $NAMESPACE -o jsonpath='{.status.conditions[0].status}' 2>/dev/null || echo "Unknown")
        log_info "Gateway status: $gateway_status"
    else
        log_warning "Gateway not found"
    fi
    
    # Check logging sidecars
    local fluent_bit_containers=$(kubectl get pods -n $NAMESPACE -o jsonpath='{.items[*].spec.containers[?(@.name=="fluent-bit")].name}' 2>/dev/null | wc -w)
    local vector_containers=$(kubectl get pods -n $NAMESPACE -o jsonpath='{.items[*].spec.containers[?(@.name=="vector")].name}' 2>/dev/null | wc -w)
    log_info "Fluent Bit sidecars: $fluent_bit_containers"
    log_info "Vector sidecars: $vector_containers"
    
    # Test Elasticsearch connectivity
    if [ "$elasticsearch_ready" -gt "0" ]; then
        local es_health=$(kubectl exec -n logging deployment/elasticsearch -- curl -s http://localhost:9200/_cluster/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "unknown")
        log_info "Elasticsearch cluster health: $es_health"
    fi
    
    # Test Kibana connectivity
    if [ "$kibana_ready" -gt "0" ]; then
        local kibana_status=$(kubectl exec -n logging deployment/kibana -- curl -s http://localhost:5601/api/status | grep -o '"overall":{"level":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "unknown")
        log_info "Kibana status: $kibana_status"
    fi
    
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
