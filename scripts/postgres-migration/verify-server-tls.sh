#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

require_env POSTGRES_SERVER_IP
require_env DATABASE_SSL_CA_CERT_PATH
require_readable_file DATABASE_SSL_CA_CERT_PATH "$DATABASE_SSL_CA_CERT_PATH"

san_output="$(openssl s_client -starttls postgres -connect "${POSTGRES_SERVER_IP}:5432" -verify_return_error -CAfile "$DATABASE_SSL_CA_CERT_PATH" < /dev/null 2>/dev/null | openssl x509 -noout -ext subjectAltName)"
printf '%s\n' "$san_output"
printf '%s\n' "$san_output" | grep -F "IP Address:${POSTGRES_SERVER_IP}" >/dev/null
