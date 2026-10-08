#!/usr/bin/env bash
# Render the routing include of an EXISTING workspace again from the current template and reload the reverse proxy.
#
# provision-workspace.sh renders deploy/nginx/_locations-<slug>.inc once, from deploy/nginx/_locations.conf.template. When
# the template changes (a body cap for the whole server, the website previews at their own root paths ...) a workspace
# provisioned earlier keeps its old copy until it is rendered again - which used to mean editing the file by hand on the
# host. This does it from the workspace's own settings (.env.<slug>: its ports, WS_MAX_BODY, WS_EDGE_LIMITS).
#
# Usage: ./scripts/render-workspace-nginx.sh <slug> [--no-reload]
#   --no-reload   only write the file (shows the diff against the old one)
#
# Only the routing include is touched. The vhost files (<slug>.conf, <slug>-ssl.conf) and the certificates stay as they
# are. The old include is kept as deploy/nginx/_locations-<slug>.inc.bak.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() { echo "Usage: $0 <slug> [--no-reload]" >&2; exit 1; }
[ $# -ge 1 ] || usage
SLUG="$1"; shift
RELOAD=true
for a in "$@"; do [ "$a" = "--no-reload" ] && RELOAD=false || usage; done
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "Error: slug must be lowercase letters, digits and hyphens." >&2; exit 1; }

ENV_FILE=".env.${SLUG}"
OUT="deploy/nginx/_locations-${SLUG}.inc"
[ -f "$ENV_FILE" ] || { echo "Error: $ENV_FILE not found - not a workspace of this checkout." >&2; exit 1; }
[ -f deploy/nginx/_locations.conf.template ] || { echo "Error: deploy/nginx/_locations.conf.template not found." >&2; exit 1; }

get_env() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true; }
port() {
  local v; v="$(get_env "$1")"
  [[ "$v" =~ ^[0-9]+$ ]] || { echo "Error: $1 is missing or not a number in $ENV_FILE." >&2; exit 1; }
  echo "$v"
}

P_ADMIN="$(port WS_ADMIN_DASHBOARD_PORT)"
P_GATEWAY="$(port WS_GATEWAY_PORT)"
P_ASSET="$(port WS_ASSET_PROCESSOR_PORT)"
P_CORE="$(port WS_CORE_API_PORT)"
P_WHOOBE_ONE="$(port WS_WHOOBE_ONE_SPIKE_PORT)"
MAX_BODY="$(get_env WS_MAX_BODY | grep . || echo 100M)"
EDGE_LIMITS="$(get_env WS_EDGE_LIMITS)"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
sed \
  -e "s/__ADMIN_PORT__/${P_ADMIN}/g" \
  -e "s/__CORE_API_PORT__/${P_CORE}/g" \
  -e "s/__ASSET_PROCESSOR_PORT__/${P_ASSET}/g" \
  -e "s/__GATEWAY_PORT__/${P_GATEWAY}/g" \
  -e "s/__WHOOBE_ONE_PORT__/${P_WHOOBE_ONE}/g" \
  -e "s/__MAX_BODY__/${MAX_BODY}/g" \
  -e "s|__EDGE_LIMITS__|${EDGE_LIMITS}|g" \
  deploy/nginx/_locations.conf.template > "$TMP"

if [ -f "$OUT" ] && cmp -s "$TMP" "$OUT"; then
  echo "$OUT is already up to date."
else
  if [ -f "$OUT" ]; then
    cp "$OUT" "${OUT}.bak"
    echo ">>> What changes in $OUT (old copy kept as ${OUT}.bak):"
    diff -u "$OUT" "$TMP" | sed -e '1,2d' || true
  fi
  cp "$TMP" "$OUT"
  echo ">>> Rendered $OUT"
fi

$RELOAD || exit 0

echo ">>> Reloading the reverse proxy ..."
if command -v nginx >/dev/null 2>&1; then
  if ! sudo nginx -t; then
    if [ -f "${OUT}.bak" ]; then cp "${OUT}.bak" "$OUT"; echo "nginx -t failed: the previous include was put back." >&2; fi
    exit 1
  fi
  sudo systemctl reload nginx
  echo "    nginx on the host reloaded."
elif docker ps --format '{{.Names}}' | grep -q '^whoobe-proxy-nginx-1$'; then
  docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" exec -T nginx nginx -t
  docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" exec -T nginx nginx -s reload
  echo "    shared proxy (whoobe-proxy) reloaded."
else
  echo "    No nginx on the host and no whoobe-proxy container: reload your reverse proxy yourself." >&2
fi
