FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
# Targeting the session server entrypoint verified at cmd/v1/session/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/v1/session

FROM alpine:3.19

WORKDIR /app

COPY --from=builder /app/main .
COPY --from=builder /app/.env.example .env.example

# Expose port
EXPOSE 8080

CMD ["./main"]
