#!/bin/bash
set -e

# ROOT_DIR is the directory where the script is located, then up one level
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROTO_DIR="$ROOT_DIR/proto"

# Output Directories
GO_OUT_DIR="$ROOT_DIR/backend/go/gen"
TS_OUT_DIR="$ROOT_DIR/frontend/types"

# PATH TO PLUGIN (Direct Reference)
TS_PLUGIN="$ROOT_DIR/frontend/node_modules/.bin/protoc-gen-ts_proto"

# Force add Go bin to path for this session
export PATH=$PATH:$(go env GOPATH)/bin:$HOME/go/bin

echo "Checking tools..."

# Check if ts-proto is installed
if [ ! -f "$TS_PLUGIN" ]; then
    echo "Error: protoc-gen-ts_proto not found at: $TS_PLUGIN"
    echo "Run 'npm install --save-dev ts-proto' inside the frontend folder."
    exit 1
fi

echo "Generating Protobufs from $PROTO_DIR..."

# 1. Clean old files
# We now clean the specific subdirectory to avoid wiping the parent if it contained other things (though here they are dedicated)
rm -rf "$GO_OUT_DIR/proto"
rm -rf "$TS_OUT_DIR/proto"
mkdir -p "$GO_OUT_DIR/proto"
mkdir -p "$TS_OUT_DIR/proto"

# 2. Generate Go (Server) - Main Protos (sfu, signaling)
# Use $ROOT_DIR as proto_path so imports like "proto/signaling.proto" work.
protoc --proto_path="$ROOT_DIR" \
       --go_out="$GO_OUT_DIR" --go_opt=paths=source_relative \
       --go-grpc_out="$GO_OUT_DIR" --go-grpc_opt=paths=source_relative \
       proto/sfu.proto proto/signaling.proto

# 2b. Generate Go (Server) - Stream Processor Proto
mkdir -p "$GO_OUT_DIR/stream_processor"
protoc --proto_path="$ROOT_DIR" \
       --go_out="$GO_OUT_DIR/stream_processor" --go_opt=paths=source_relative \
       --go-grpc_out="$GO_OUT_DIR/stream_processor" --go-grpc_opt=paths=source_relative \
       proto/stream-processor.proto

# 2c. Generate Go (Server) - Summary Service Proto
mkdir -p "$GO_OUT_DIR/summary_service"
protoc --proto_path="$ROOT_DIR" \
       --go_out="$GO_OUT_DIR/summary_service" --go_opt=paths=source_relative \
       --go-grpc_out="$GO_OUT_DIR/summary_service" --go-grpc_opt=paths=source_relative \
       proto/summary-service.proto

echo "Go generated."

# 2d. Generate Python (Stream Processor)
cd "$ROOT_DIR/backend/python/stream-processor"
mkdir -p proto
touch proto/__init__.py
.venv/bin/python -m grpc_tools.protoc -I"$ROOT_DIR" \
       --python_out=. --grpc_python_out=. \
       proto/stream-processor.proto

# 2e. Generate Python (Summary Service)
cd "$ROOT_DIR/backend/python/summary-service"
mkdir -p proto
touch proto/__init__.py
.venv/bin/python -m grpc_tools.protoc -I"$ROOT_DIR" \
       --python_out=. --grpc_python_out=. \
       proto/summary-service.proto

cd "$ROOT_DIR"
echo "Python generated."

# 3. Generate TypeScript (Client)
protoc --proto_path="$ROOT_DIR" \
       --plugin="protoc-gen-ts_proto=${TS_PLUGIN}" \
       --ts_proto_out="$TS_OUT_DIR" \
       --ts_proto_opt=esModuleInterop=true \
       --ts_proto_opt=outputEncodeMethods=true \
       --ts_proto_opt=outputJsonMethods=false \
       --ts_proto_opt=outputClientImpl=false \
       proto/*.proto

echo "TypeScript generated."