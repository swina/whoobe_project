#!/bin/bash
# Start all CMS apps in parallel for development.
# Usage: ./dev-cms.sh [--build] [--hostname <name>] [--stop]
#
# --build            Builds the workspace packages the apps import (core, schema,
#                    logger, migration-tool, ...; they resolve to their dist/
#                    outputs) before starting. Required once after a fresh clone.
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

PORTS=(3000 3001 3002 3003 3006)

# PIDs listening on a port. lsof is not installed everywhere (it is not on a default WSL/Ubuntu), ss is.
port_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti:"$1" 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true
  fi
}

if [ "$STOP" = "1" ]; then
  echo "Stopping all CMS dev servers..."
  for app in "${APPS[@]}"; do
    pkill -f ".*tsx.*$app.*" 2>/dev/null || true
    pkill -f ".*vite.*$app.*" 2>/dev/null || true
  done
  # whatever still listens on the dev ports, from this checkout or another one (a renamed or older copy)
  for port in "${PORTS[@]}"; do
    for pid in $(port_pids "$port"); do kill "$pid" 2>/dev/null || true; done
  done
  sleep 1
  for port in "${PORTS[@]}"; do
    for pid in $(port_pids "$port"); do kill -9 "$pid" 2>/dev/null || true; done
  done
  held=""
  for port in "${PORTS[@]}"; do [ -n "$(port_pids "$port")" ] && held="$held $port"; done
  if [ -n "$held" ]; then echo "Still in use:$held (not stopped: check which process holds them)" >&2; exit 1; fi
  echo "Stopped."
  exit 0
fi

# Refuse to start on top of another instance: the second one would fail on every port it cannot bind, with a
# screenful of EADDRINUSE errors that hide the real picture.
busy=""
for port in "${PORTS[@]}"; do
  pid="$(port_pids "$port" | head -1)"
  if [ -n "$pid" ]; then busy="$busy\n  port $port: pid $pid ($(readlink "/proc/$pid/cwd" 2>/dev/null || echo '?'))"; fi
done
if [ -n "$busy" ]; then
  printf "Ports already in use, another instance is probably running:%b\n" "$busy" >&2
  echo "Run ./dev-cms.sh --stop first." >&2
  exit 1
fi

if [ "$BUILD" = "1" ]; then
  # A fresh clone has no build output, and the apps import their workspace packages (core, schema, logger,
  # migration-tool, ...) from their dist/. "<app>^..." = everything that app depends on, itself excluded, dependencies
  # first, so exactly what the five dev servers need and nothing else.
  echo "Building the workspace packages the dev servers depend on..."
  pnpm \
    --filter '@whoobe-cms/admin-dashboard^...' \
    --filter '@whoobe-cms/core-api^...' \
    --filter '@whoobe-cms/asset-processor^...' \
    --filter '@whoobe-cms/gateway^...' \
    --filter '@whoobe-cms/whoobe-one-spike^...' \
    build
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