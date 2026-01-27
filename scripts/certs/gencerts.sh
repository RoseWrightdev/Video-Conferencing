#!/bin/bash
set -e

mkdir -p certs_out
cd certs_out

# 1. Generate CA's Private Key
openssl genrsa -out ca.key 4096

# 2. Generate CA's Self-Signed Certificate
openssl req -x509 -new -nodes -key ca.key -sha256 -days 365 -out ca.crt -subj "/CN=VideoConf-Internal-CA"

# 3. Generate Server's Private Key
openssl genrsa -out server.key 4096

# 4. Generate Certificate Signing Request (CSR)
# Subject CN must match the hostname used by the client (e.g., localhost or summary-service)
# We'll stick to localhost for local dev and add SANs for k8s names
openssl req -new -key server.key -out server.csr -subj "/CN=localhost"

# 5. Create config for SANs (Subject Alternative Names)
cat > server.conf <<EOF
[req]
req_extensions = req_ext
distinguished_name = req_distinguished_name

[req_distinguished_name]
CN = localhost

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = summary-service
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# 6. Sign CSR with CA
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 365 -sha256 -extfile server.conf -extensions req_ext

echo "✅ Certificates generated in certs/certs_out/"
