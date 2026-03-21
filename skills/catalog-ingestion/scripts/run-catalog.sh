#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: ./skills/catalog-ingestion/scripts/run-catalog.sh <yupoo-album-or-category-url> [limit-for-category]" >&2
  exit 1
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
URL="$1"
LIMIT="${2:-}"

cd "$ROOT"

if [ -n "$LIMIT" ]; then
  bun run skill:catalog "$URL" "$LIMIT"
else
  bun run skill:catalog "$URL"
fi
