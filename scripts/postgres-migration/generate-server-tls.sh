#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_env OUTPUT_DIR
require_env POSTGRES_SERVER_IP

mkdir -p "$OUTPUT_DIR"

cat > "$OUTPUT_DIR/server-ext.cnf" <<EOF
subjectAltName = IP:${POSTGRES_SERVER_IP}
extendedKeyUsage = serverAuth
EOF

openssl genrsa -out "$OUTPUT_DIR/internal-ca.key" 4096
openssl req -x509 -new -nodes -key "$OUTPUT_DIR/internal-ca.key" -sha256 -days 3650 -out "$OUTPUT_DIR/internal-ca.pem" -subj "/CN=gstack-web2skill-postgres-ca"
openssl genrsa -out "$OUTPUT_DIR/server.key" 4096
chmod 600 "$OUTPUT_DIR/server.key"
openssl req -new -key "$OUTPUT_DIR/server.key" -out "$OUTPUT_DIR/server.csr" -subj "/CN=${POSTGRES_SERVER_IP}"
openssl x509 -req -in "$OUTPUT_DIR/server.csr" -CA "$OUTPUT_DIR/internal-ca.pem" -CAkey "$OUTPUT_DIR/internal-ca.key" -CAcreateserial -out "$OUTPUT_DIR/server.crt" -days 825 -sha256 -extfile "$OUTPUT_DIR/server-ext.cnf"

printf '%s\n' "$OUTPUT_DIR/internal-ca.pem"
printf '%s\n' "$OUTPUT_DIR/server.crt"
printf '%s\n' "$OUTPUT_DIR/server.key"
