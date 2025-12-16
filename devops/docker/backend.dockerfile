# Backend Dockerfile for Go Social Media App
# Multi-stage build for production optimization

# Stage 1: Build the Go application
FROM golang:1.24.5-alpine AS builder

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

# Stage 2: Production runtime
FROM scratch

# Copy timezone data
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Copy CA certificates
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the binary
COPY --from=builder /app/main /main

# Set environment variables
ENV PORT=8080
ENV GO_ENV=production

# Expose port
EXPOSE 8080

# Health check (using wget from alpine)
FROM alpine:latest AS healthcheck
RUN apk --no-cache add curl

# Final stage
FROM scratch AS final
COPY --from=builder /app/main /main
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Add health check binary
COPY --from=healthcheck /usr/bin/curl /usr/bin/curl

EXPOSE 8080
CMD ["/main"]
