#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: ./skills/shoes-transformer/scripts/run-shoes-transformer.sh --source-id <id>|--source-url <url>|--id <catalog-item-id> ... --output <output.xlsx> [--template <template.xlsx>] [--tags <tag1,tag2,tag3>]" >&2
  exit 1
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT"

bun run skill:shoes-transformer "$@"
