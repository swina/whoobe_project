#!/bin/bash
# Start all CMS apps in parallel for development.
# Usage: ./dev-cms.sh [--build]
#
# Optional --build flag rebuilds @whoobe-cms/core first.
# Stop all with: ./dev-cms.sh --stop

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPS=(
  "admin-dashboard"
  "core-api"
  "asset-processor"
  "whoobe-one-spike"
)

if [ "$1" = "--stop" ]; then
  echo "Stopping all CMS dev servers..."
  for app in "${APPS[@]}"; do
    pkill -f ".*tsx.*$app.*" 2>/dev/null || true
    pkill -f ".*vite.*$app.*" 2>/dev/null || true
  done
  lsof -ti:3000,3002,3003,3006 2>/dev/null | xargs kill -9 2>/dev/null || true
  echo "Stopped."
  exit 0
fi

if [ "$1" = "--build" ]; then
  echo "Building @whoobe-cms/core..."
  pnpm --filter @whoobe-cms/core build
fi

echo "Starting CMS dev servers..."
echo "  admin-dashboard  → http://localhost:3000"
echo "  core-api         → http://localhost:3003"
echo "  asset-processor  → http://localhost:3002"
echo "  whoobe-one-spike → http://localhost:3006"
echo ""

# Start each app in background, prefixing output with its name
for app in "${APPS[@]}"; do
  pnpm --filter "@whoobe-cms/$app" dev 2>&1 | sed "s/^/[$app] /" &
done

echo "All started. Press Ctrl+C to stop all."
trap 'echo "Stopping..."; kill 0; exit' INT TERM
wait