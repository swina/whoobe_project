#!/usr/bin/env bash
# Rebuilds the public sandbox from nothing (docs/release/operations/sandbox.md): removes the workspace "sandbox"
# with ALL its volumes (database, object store), then provisions it again with fresh secrets and the public demo
# account. Run it from the systemd timer every SANDBOX_INTERVAL_HOURS (default 3), or by hand.
#
# Usage: SANDBOX_HOST=sandbox.example.com ./scripts/sandbox/reset.sh [--scheme http|https]
#   SANDBOX_HOST            public host name (required)
#   SANDBOX_INDEX           workspace index, ports are derived from it (default 1)
#   SANDBOX_DEMO_EMAIL      demo account (default demo@whoobe.example) - it is PUBLIC, shown on the login page
#   SANDBOX_DEMO_PASSWORD   its password (default: whoobe-sandbox-demo)
#   SANDBOX_INTERVAL_HOURS  hours until the next reset, shown in the UI banner (default 3)
# If provisioning fails the stack is removed again and the script exits 1: the sandbox stays off, it never
# keeps serving data from the previous cycle.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

SLUG=sandbox
HOST="${SANDBOX_HOST:?set SANDBOX_HOST to the public host name}"
INDEX="${SANDBOX_INDEX:-1}"
DEMO_EMAIL="${SANDBOX_DEMO_EMAIL:-demo@whoobe.example}"
DEMO_PASSWORD="${SANDBOX_DEMO_PASSWORD:-whoobe-sandbox-demo}"
HOURS="${SANDBOX_INTERVAL_HOURS:-3}"
SCHEME=https
[ "${1:-}" = "--scheme" ] && SCHEME="${2:?--scheme needs http or https}"
[[ "$HOURS" =~ ^[0-9]+$ ]] || { echo "SANDBOX_INTERVAL_HOURS must be a number" >&2; exit 1; }

export COMPOSE_FILE="docker-compose.yml:docker-compose.sandbox.yml"
# edge: 6 MB bodies (5 MB file + multipart overhead), per-address request and connection limits. The zones live in
# deploy/nginx/00-sandbox-zones.conf (conf.d is loaded in the http context, the vhost references the zones).
export WS_MAX_BODY=6M
export WS_EDGE_LIMITS="limit_req zone=sandbox_req burst=40 nodelay; limit_conn sandbox_conn 20; limit_req_status 429; limit_conn_status 429; proxy_read_timeout 60s; proxy_send_timeout 60s;"
mkdir -p deploy/nginx
cat > deploy/nginx/00-sandbox-zones.conf <<'ZONES'
limit_req_zone $binary_remote_addr zone=sandbox_req:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=sandbox_conn:10m;
ZONES
SANDBOX_RESET_AT="$(date -u -d "+${HOURS} hours" +%Y-%m-%dT%H:%M:%SZ)"
export SANDBOX_RESET_AT

echo ">>> $(date -u +%FT%TZ) sandbox reset (next one at $SANDBOX_RESET_AT)"
if [ -f ".env.${SLUG}" ]; then
  ./scripts/remove-workspace.sh "$SLUG" --yes
fi

if ! ./scripts/provision-workspace.sh "$SLUG" "$HOST" "$INDEX" --scheme "$SCHEME" \
     --seed-email "$DEMO_EMAIL" --seed-password "$DEMO_PASSWORD"; then
  echo "!!! provisioning failed: removing the stack, the sandbox stays OFF" >&2
  [ -f ".env.${SLUG}" ] && ./scripts/remove-workspace.sh "$SLUG" --yes || true
  exit 1
fi

# core-api answers /health with the sandbox block only when SANDBOX_MODE reached the container
PORT="$(grep -E '^WS_CORE_API_PORT=' ".env.${SLUG}" | cut -d= -f2-)"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" | grep -q '"sandbox"'; then echo ">>> sandbox is up (reset at $SANDBOX_RESET_AT)"; exit 0; fi
  sleep 2
done
echo "!!! sandbox mode not active after provisioning: removing the stack" >&2
./scripts/remove-workspace.sh "$SLUG" --yes || true
exit 1
