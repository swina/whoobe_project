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
#   SANDBOX_SCHEME          http or https (default https); the --scheme argument wins
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
SCHEME="${SANDBOX_SCHEME:-https}"
[[ "$SCHEME" =~ ^https?$ ]] || { echo "SANDBOX_SCHEME must be http or https" >&2; exit 1; }
[ "${1:-}" = "--scheme" ] && SCHEME="${2:?--scheme needs http or https}"
[[ "$HOURS" =~ ^[0-9]+$ ]] || { echo "SANDBOX_INTERVAL_HOURS must be a number" >&2; exit 1; }

# One reset at a time. A second one (a timer firing while a slow build still runs, a retry after a timeout) would start a second
# docker build against the same workspace and both would hang.
exec 9>"${TMPDIR:-/tmp}/whoobe-sandbox-reset.lock"
flock -n 9 || { echo "another sandbox reset is already running: nothing done" >&2; exit 1; }

# With the lock held, any `docker compose -p ws-<slug>` still running is a leftover of an earlier reset that was killed
# (a snap-installed Docker client is not stopped together with its systemd service): stop it, it would only wait forever.
# (matched from the start of the command line, and only `up`: a shell or an ssh session that merely mentions the project, or a
# `docker compose -p ws-<slug> logs -f`, is left alone)
for pid in $(pgrep -u "$(id -u)" -f "^[^ ]*docker(-compose)? compose -p ws-${SLUG} .* up " || true); do
  [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null || true
done

# When this script is stopped (systemd timeout, Ctrl+C), stop everything it started too: provisioning and the docker
# client below it, otherwise they keep running as orphans.
kill_descendants() {
  local pid
  for pid in $(pgrep -P "$1" 2>/dev/null || true); do kill_descendants "$pid"; kill "$pid" 2>/dev/null || true; done
}
trap 'kill_descendants $$; exit 143' TERM INT HUP

RESET_AT="$(date -u -d "+${HOURS} hours" +%Y-%m-%dT%H:%M:%SZ)"
SETS=(--set "SANDBOX_RESET_AT=$RESET_AT")
for k in SANDBOX_NO_NEW_PRIVILEGES SANDBOX_ALLOW_HOSTS ASSET_MAX_FILE_BYTES ASSET_MAX_COUNT ASSET_MAX_INPUT_PIXELS; do
  [ -n "${!k+x}" ] && SETS+=(--set "$k=${!k}")
done

echo ">>> $(date -u +%FT%TZ) sandbox reset (next one at $RESET_AT)"
# The long steps run in the background and are waited for: bash runs a trap only when the foreground command has ended,
# while `wait` is interrupted by the signal at once (so the trap above can stop the children).
run() { "$@" & wait $!; }

if [ -f ".env.${SLUG}" ]; then
  run ./scripts/remove-workspace.sh "$SLUG" --yes
fi

if ! run ./scripts/provision-workspace.sh "$SLUG" "$HOST" "$INDEX" --scheme "$SCHEME" \
     --seed-email "$DEMO_EMAIL" --seed-password "$DEMO_PASSWORD" --profile sandbox "${SETS[@]}"; then
  echo "!!! provisioning failed: removing the stack, the sandbox stays OFF" >&2
  [ -f ".env.${SLUG}" ] && run ./scripts/remove-workspace.sh "$SLUG" --yes || true
  exit 1
fi

# core-api answers /health with the sandbox block only when SANDBOX_MODE reached the container
PORT="$(grep -E '^WS_CORE_API_PORT=' ".env.${SLUG}" | cut -d= -f2-)"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" | grep -q '"sandbox"'; then echo ">>> sandbox is up (reset at $RESET_AT)"; exit 0; fi
  sleep 2
done
echo "!!! sandbox mode not active after provisioning: removing the stack" >&2
run ./scripts/remove-workspace.sh "$SLUG" --yes || true
exit 1
