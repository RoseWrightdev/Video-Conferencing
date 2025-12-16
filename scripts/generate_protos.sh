#!/bin/bash
set -e

# ROOT_DIR is the directory where the script is located, then up one level
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROTO_DIR="$ROOT_DIR/proto"

# Output Directories
GO_OUT_DIR="$ROOT_DIR/backend/go/gen/proto"
TS_OUT_DIR="$ROOT_DIR/frontend/src/generated"

echo "Generating Protobufs from $PROTO_DIR..."

# 1. Clean old files
rm -rf "$GO_OUT_DIR"
rm -rf "$TS_OUT_DIR"
mkdir -p "$GO_OUT_DIR"
mkdir -p "$TS_OUT_DIR"

# 2. Generate Go (Server)
# Requires: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
#           go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
protoc --proto_path="$PROTO_DIR" \
       --go_out="$GO_OUT_DIR" --go_opt=paths=source_relative \
       --go-grpc_out="$GO_OUT_DIR" --go-grpc_opt=paths=source_relative \
       "$PROTO_DIR"/*.proto

echo "Go generated."

# 3. Generate TypeScript (Client)
# Requires: npm install -g ts-proto
# Options: esModuleInterop=true,outputEncodeMethods=true,outputJsonMethods=false,outputClientImpl=false
protoc --proto_path="$PROTO_DIR" \
       --plugin=./frontend/node_modules/.bin/protoc-gen-ts_proto \
       --ts_proto_out="$TS_OUT_DIR" \
       --ts_proto_opt=esModuleInterop=true \
       --ts_proto_opt=outputEncodeMethods=true \
       --ts_proto_opt=outputJsonMethods=false \
       --ts_proto_opt=outputClientImpl=false \
       "$PROTO_DIR"/*.proto

echo "TypeScript generated."