#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: ./skills/catalog-ingestion/scripts/inspect-category.sh <yupoo-category-url> <limit>" >&2
  exit 1
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
URL="$1"
LIMIT="$2"

cd "$ROOT"
bun run inspect:category "$URL" "$LIMIT"
