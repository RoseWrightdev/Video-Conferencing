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

# 2. Generate Go (Server)
# Use $ROOT_DIR as proto_path so imports like "proto/signaling.proto" work.
# Changes:
# - proto_path="$ROOT_DIR"
# - go_out="$GO_OUT_DIR" (parent of proto, so we get gen/proto/foo.pb.go)
# - Input files: proto/*.proto (relative to CWD or absolute, but paths in .proto must match import paths relative to proto_path)
protoc --proto_path="$ROOT_DIR" \
       --go_out="$GO_OUT_DIR" --go_opt=paths=source_relative \
       --go-grpc_out="$GO_OUT_DIR" --go-grpc_opt=paths=source_relative \
       proto/*.proto

echo "Go generated."

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