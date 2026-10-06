#!/usr/bin/env bash
# Rebuilds the public sandbox from nothing (docs/release/operations/sandbox.md). The sandbox is an ordinary workspace
# ("sandbox") created with the profile of the same name (deploy/profiles/sandbox.env): this script only removes it with
# ALL its volumes (database, object store) and provisions it again, with fresh secrets and the public demo account.
# Run it from the systemd timer every SANDBOX_INTERVAL_HOURS (default 3), or by hand.
#
# Usage: SANDBOX_HOST=sandbox.example.com ./scripts/sandbox/reset.sh [--scheme http|https]
#   SANDBOX_HOST            public host name (required)
#   SANDBOX_INDEX           workspace index, ports are derived from it (default 1)
#   SANDBOX_DEMO_EMAIL      demo account (default demo@whoobe.example) - it is PUBLIC, put it on the page that links here
#   SANDBOX_DEMO_PASSWORD   its password (default: whoobe-sandbox-demo)
#   SANDBOX_INTERVAL_HOURS  hours until the next reset, shown in the UI banner (default 3)
# Any of these, when set, overrides the value of the profile (they are passed as --set):
#   SANDBOX_NO_NEW_PRIVILEGES  SANDBOX_ALLOW_HOSTS  ASSET_MAX_FILE_BYTES  ASSET_MAX_COUNT  ASSET_MAX_INPUT_PIXELS
# For anything else: provision-workspace.sh --set KEY=VALUE, or edit deploy/profiles/sandbox.env.
# If provisioning fails the stack is removed again and the script exits 1: the sandbox stays off, it never keeps serving
# data from the previous cycle.
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

RESET_AT="$(date -u -d "+${HOURS} hours" +%Y-%m-%dT%H:%M:%SZ)"
SETS=(--set "SANDBOX_RESET_AT=$RESET_AT")
for k in SANDBOX_NO_NEW_PRIVILEGES SANDBOX_ALLOW_HOSTS ASSET_MAX_FILE_BYTES ASSET_MAX_COUNT ASSET_MAX_INPUT_PIXELS; do
  [ -n "${!k+x}" ] && SETS+=(--set "$k=${!k}")
done

echo ">>> $(date -u +%FT%TZ) sandbox reset (next one at $RESET_AT)"
if [ -f ".env.${SLUG}" ]; then
  ./scripts/remove-workspace.sh "$SLUG" --yes
fi

if ! ./scripts/provision-workspace.sh "$SLUG" "$HOST" "$INDEX" --scheme "$SCHEME" \
     --seed-email "$DEMO_EMAIL" --seed-password "$DEMO_PASSWORD" --profile sandbox "${SETS[@]}"; then
  echo "!!! provisioning failed: removing the stack, the sandbox stays OFF" >&2
  [ -f ".env.${SLUG}" ] && ./scripts/remove-workspace.sh "$SLUG" --yes || true
  exit 1
fi

# core-api answers /health with the sandbox block only when SANDBOX_MODE reached the container
PORT="$(grep -E '^WS_CORE_API_PORT=' ".env.${SLUG}" | cut -d= -f2-)"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" | grep -q '"sandbox"'; then echo ">>> sandbox is up (reset at $RESET_AT)"; exit 0; fi
  sleep 2
done
echo "!!! sandbox mode not active after provisioning: removing the stack" >&2
./scripts/remove-workspace.sh "$SLUG" --yes || true
exit 1
