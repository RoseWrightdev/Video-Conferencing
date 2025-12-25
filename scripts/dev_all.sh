#!/bin/bash
set -e

# Start Next.js frontend (npm run dev)
cd "$(dirname "$0")/../frontend"
echo "Starting Next.js frontend (npm run dev)..."
npm run dev &
FRONTEND_PID=$!

# Start Go backend (go run main.go)
cd "../backend/go/cmd/v1/session"
echo "Starting Go backend (go run main.go)..."
go run main.go &
GO_PID=$!

# Start Rust SFU (cargo run)
cd "../../../../rust/sfu"
echo "Starting Rust SFU (cargo run)..."
cargo run &
RUST_PID=$!

# Wait for all processes
wait $FRONTEND_PID $GO_PID $RUST_PID
