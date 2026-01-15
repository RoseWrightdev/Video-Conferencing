# Backend Dockerfile for Go Video Conferencing App
# Multi-stage build for production optimization

# Stage 1: Build the Go application
FROM golang:1.24-alpine AS builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Copy go mod files
COPY backend/go/go.mod backend/go/go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY backend/go/ .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a -installsuffix cgo \
    -o main cmd/v1/session/main.go

# Install grpc-health-probe for health checks
RUN GRPC_HEALTH_PROBE_VERSION=v0.4.19 && \
    wget -qO/bin/grpc_health_probe \
    https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64 && \
    chmod +x /bin/grpc_health_probe

# Stage 2: Production runtime with minimal Alpine base
FROM alpine:latest

# Install minimal runtime dependencies
RUN apk --no-cache add ca-certificates curl

# Create non-root user
RUN addgroup -g 10001 -S appuser && \
    adduser -u 10001 -S appuser -G appuser

# Copy timezone data
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy CA certificates
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the binary
COPY --from=builder /app/main /main

# Copy health check probe (optional - if you prefer HTTP health checks)
COPY --from=builder /bin/grpc_health_probe /bin/grpc_health_probe

# Set ownership
RUN chown -R appuser:appuser /main

# Switch to non-root user
USER appuser

# Set environment variables
ENV PORT=8080
ENV GO_ENV=production

# Expose port
EXPOSE 8080

# Health check using curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["/main"]
