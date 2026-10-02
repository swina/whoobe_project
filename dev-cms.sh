#!/bin/bash
# Start all CMS apps in parallel for development.
# Usage: ./dev-cms.sh [--build] [--hostname <name>] [--stop]
#
# --build            Rebuilds the workspace packages first. core-api imports
#                    @whoobe-cms/core and @whoobe-cms/migration-tool (both
#                    resolve to their dist/ outputs), so both must be built
#                    before it starts.
# --hostname <name>  Overrides ONLY the browser-facing app endpoints - the
#                    VITE_* URLs admin-dashboard talks to - e.g.
# ./dev-cms.sh --hostname whoobecms.local. Pick the
#                    hostname you open the dashboard from, so the session
#                    cookie (host-only + SameSite=Lax) always reaches the
#                    APIs. DB (DB_HOST) and S3 (S3_ENDPOINT) endpoints are
#                    external infrastructure and stay as configured in the
#                    root .env.
# --stop             Stops all dev servers.

set -e

APPS=(
  "admin-dashboard"
  "core-api"
  "asset-processor"
  "gateway"
  "whoobe-one-spike"
)

BUILD=0
STOP=0
HOSTNAME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --build)
      BUILD=1
      ;;
    --stop)
      STOP=1
      ;;
    --hostname)
      HOSTNAME="$2"
      shift
      ;;
    *)
      echo "Unknown option: $1 (expected --build, --hostname <name>, or --stop)" >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$STOP" = "1" ]; then
  echo "Stopping all CMS dev servers..."
  for app in "${APPS[@]}"; do
    pkill -f ".*tsx.*$app.*" 2>/dev/null || true
    pkill -f ".*vite.*$app.*" 2>/dev/null || true
  done
  lsof -ti:3000,3001,3002,3003,3006 2>/dev/null | xargs kill -9 2>/dev/null || true
  echo "Stopped."
  exit 0
fi

if [ "$BUILD" = "1" ]; then
  echo "Building @whoobe-cms/core..."
  pnpm --filter @whoobe-cms/core build
  echo "Building @whoobe-cms/migration-tool..."
  pnpm --filter @whoobe-cms/migration-tool build
fi

if [ -n "$HOSTNAME" ]; then
  export VITE_ASSET_PROCESSOR_URL="http://$HOSTNAME:3002"
  export VITE_CORE_API_URL="http://$HOSTNAME:3003"
  export VITE_GATEWAY_URL="http://$HOSTNAME:3001"
  echo "App endpoints use hostname: $HOSTNAME"
fi

echo "Starting CMS dev servers..."
echo "  admin-dashboard  → http://localhost:3000"
echo "  gateway          → http://localhost:3001"
echo "  asset-processor  → http://localhost:3002"
echo "  core-api         → http://localhost:3003"
echo "  whoobe-one-spike → http://localhost:3006"
echo ""

# Start each app in background, prefixing output with its name
for app in "${APPS[@]}"; do
  pnpm --filter "@whoobe-cms/$app" dev 2>&1 | sed "s/^/[$app] /" &
done

echo "All started. Press Ctrl+C to stop all."
trap 'echo "Stopping..."; kill 0; exit' INT TERM
wait