#!/bin/bash
set -euo pipefail

# Deploy entity-todo to Cloudflare Workers.
#
# Usage:
#   D1_DATABASE_ID=<uuid> bun run deploy
#
# The D1_DATABASE_ID is injected into wrangler.toml at deploy time
# and restored to the placeholder after deploy (or on failure).

if [ -z "${D1_DATABASE_ID:-}" ]; then
  echo "Error: D1_DATABASE_ID env var is required."
  echo "Usage: D1_DATABASE_ID=<uuid> bun run deploy"
  echo ""
  echo "To find your database ID: npx wrangler d1 list"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

PLACEHOLDER="your-database-id-here"

restore_placeholder() {
  sed -i '' "s|database_id = \"$D1_DATABASE_ID\"|database_id = \"$PLACEHOLDER\"|" wrangler.toml
}

# Inject real database ID
sed -i '' "s|database_id = \"$PLACEHOLDER\"|database_id = \"$D1_DATABASE_ID\"|" wrangler.toml
trap restore_placeholder EXIT

# Build
bun run build

# Post-build: unhash client entry, remove SPA fallback
cp dist/client/assets/entry-client-*.js dist/client/assets/entry-client.js
rm -f dist/client/index.html

# Deploy
npx wrangler deploy
