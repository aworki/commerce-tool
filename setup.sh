#!/usr/bin/env bash
set -euo pipefail

DB_NAME="gstack_web2skill"
DB_USER="${USER:-bytedance}"

have() {
  command -v "$1" >/dev/null 2>&1
}

echo "==> Checking Bun"
if ! have bun; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

echo "==> Checking PostgreSQL"
if ! have psql; then
  if ! have brew; then
    echo "Homebrew is required to install PostgreSQL automatically."
    echo "Install Homebrew first, then re-run setup.sh."
    exit 1
  fi

  echo "Installing PostgreSQL via Homebrew..."
  brew install postgresql
fi

if have brew; then
  echo "==> Starting PostgreSQL service"
  brew services start postgresql >/dev/null 2>&1 || true
fi

echo "==> Waiting for PostgreSQL"
for _ in {1..15}; do
  if pg_isready >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! pg_isready >/dev/null 2>&1; then
  echo "PostgreSQL is not ready. Start it manually and re-run setup.sh."
  exit 1
fi

echo "==> Creating database if needed"
if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  createdb "$DB_NAME"
fi

echo "==> Installing project dependencies"
bun install

cat <<EOF

Setup complete.

Default database URL:
  postgres://${DB_USER}@localhost:5432/${DB_NAME}

Useful commands:
  bun test
  bun run skill:catalog <yupoo-album-or-category-url> [limit-for-category]
  bun run inspect:category <category-url> <limit>
  bun run ingest:category <category-url> <limit>

EOF
