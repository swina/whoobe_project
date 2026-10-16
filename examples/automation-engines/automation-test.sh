#!/usr/bin/env bash
# EXAMPLE ONLY - NOT PART OF THE WHOOBE DISTRIBUTION (see examples/automation-engines/README.md).
# Toggle the local automation test containers: running -> stop, stopped or missing -> start (create).
#   examples/automation-engines/automation-test.sh [activepieces|n8n]      default: activepieces (+ its SMTP forward to Mailhog)
# Data lives in Docker volumes, so stopping keeps flows and accounts. Guides: docs/plans/automations/.
set -euo pipefail

TARGET="${1:-activepieces}"
NET=whoobe-automation-test
AP_ENV="${AP_ENV_FILE:-$HOME/.config/whoobe/activepieces.env}"   # AP_JWT_SECRET, AP_ENCRYPTION_KEY (mode 600)
MAILHOG="${MAILHOG_ADDR:-192.168.1.102:1025}"

running() { [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = true ]; }
exists()  { docker inspect "$1" >/dev/null 2>&1; }

# $1 = container; the rest = docker run arguments, used only when the container does not exist yet
start() {
  local name=$1; shift
  if exists "$name"; then docker start "$name" >/dev/null; else docker run -d --name "$name" --restart unless-stopped "$@" >/dev/null; fi
  echo "started $name"
}

case "$TARGET" in
  activepieces)
    names=(whoobe-activepieces-test whoobe-smtp-forward)
    if running whoobe-activepieces-test; then
      docker stop "${names[@]}" >/dev/null 2>&1 || true
      echo "stopped: ${names[*]}"; exit 0
    fi
    [ -f "$AP_ENV" ] || { echo "missing $AP_ENV (AP_JWT_SECRET and AP_ENCRYPTION_KEY): keep the same values, stored connections depend on them" >&2; exit 1; }
    docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
    docker volume inspect whoobe-activepieces-test >/dev/null 2>&1 || docker volume create whoobe-activepieces-test >/dev/null
    start whoobe-smtp-forward --network "$NET" alpine/socat tcp-listen:2525,fork,reuseaddr "tcp:$MAILHOG"
    start whoobe-activepieces-test --network "$NET" -p 127.0.0.1:8090:80 -v whoobe-activepieces-test:/root/.activepieces \
      --env-file "$AP_ENV" -e AP_DB_TYPE=PGLITE -e AP_REDIS_TYPE=MEMORY -e AP_FRONTEND_URL=http://localhost:8090 \
      activepieces/activepieces:latest
    echo "Activepieces: http://localhost:8090 (a minute to be ready) | SMTP piece: host whoobe-smtp-forward, port 2525 -> $MAILHOG"
    ;;
  n8n)
    if running whoobe-n8n-test; then docker stop whoobe-n8n-test >/dev/null; echo "stopped whoobe-n8n-test"; exit 0; fi
    docker volume inspect whoobe-n8n-test >/dev/null 2>&1 || docker volume create whoobe-n8n-test >/dev/null
    start whoobe-n8n-test -p 127.0.0.1:5678:5678 -v whoobe-n8n-test:/home/node/.n8n \
      -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
      -e N8N_PERSONALIZATION_ENABLED=false -e N8N_SECURE_COOKIE=false n8nio/n8n:latest
    echo "n8n: http://localhost:5678"
    ;;
  *) echo "usage: $0 [activepieces|n8n]" >&2; exit 2 ;;
esac
