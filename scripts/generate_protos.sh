#!/bin/bash
set -e

# ROOT_DIR is the directory where the script is located, then up one level
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROTO_DIR="$ROOT_DIR/proto"

# Output Directories
GO_OUT_DIR="$ROOT_DIR/backend/go/gen/proto"
TS_OUT_DIR="$ROOT_DIR/frontend/types/proto"

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
rm -rf "$GO_OUT_DIR"
rm -rf "$TS_OUT_DIR"
mkdir -p "$GO_OUT_DIR"
mkdir -p "$TS_OUT_DIR"

# 2. Generate Go (Server)
protoc --proto_path="$PROTO_DIR" \
       --go_out="$GO_OUT_DIR" --go_opt=paths=source_relative \
       --go-grpc_out="$GO_OUT_DIR" --go-grpc_opt=paths=source_relative \
       "$PROTO_DIR"/*.proto

echo "Go generated."

# 3. Generate TypeScript (Client)
# We use --plugin=protoc-gen-ts_proto=PATH to strictly tell protoc where it is
protoc --proto_path="$PROTO_DIR" \
       --plugin="protoc-gen-ts_proto=${TS_PLUGIN}" \
       --ts_proto_out="$TS_OUT_DIR" \
       --ts_proto_opt=esModuleInterop=true \
       --ts_proto_opt=outputEncodeMethods=true \
       --ts_proto_opt=outputJsonMethods=false \
       --ts_proto_opt=outputClientImpl=false \
       "$PROTO_DIR"/*.proto

echo "TypeScript generated."