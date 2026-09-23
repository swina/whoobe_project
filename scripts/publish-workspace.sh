#!/usr/bin/env bash
# Convenience wrapper around ./publish-site.sh / ./publish-mobile.sh for a
# specific workspace created by create-workspace.sh / provision-workspace.sh.
# Both are generic, workspace-agnostic scripts that just prompt for a CMS
# API URL and a Website ID - this fills in both as the prompt's default so
# you just hit Enter (or type something else to override):
#   - API URL: read straight from .env.<slug>'s VITE_CORE_API_URL - the
#     same URL a browser reaches this workspace's core-api at (http://
#     while TLS isn't enabled yet, https:// once scripts/enable-tls.sh has
#     run for it).
#   - Website ID: queried directly from the workspace's own Postgres
#     (`SELECT id, name FROM websites`) - every freshly provisioned
#     workspace has exactly one, seeded at first core-api boot, so the
#     common case needs no manual lookup in the admin dashboard at all. If
#     more than one website exists, they're listed instead and you pick
#     the ID by hand (still prompted, nothing is guessed for you).
#
# Usage: ./scripts/publish-workspace.sh <slug> site|mobile
#   site    -> runs ./publish-site.sh   (standalone Nuxt/Next site)
#   mobile  -> runs ./publish-mobile.sh (Capacitor mobile app project)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  echo "Usage: $0 <slug> site|mobile" >&2
  exit 1
}

[ $# -eq 2 ] || usage
SLUG="$1"
TARGET="$2"
case "$TARGET" in
  site|mobile) ;;
  *) usage ;;
esac

ENV_FILE=".env.${SLUG}"
[ -f "$ENV_FILE" ] || { echo "Errore: $ENV_FILE non trovato - workspace '${SLUG}' non provisionato." >&2; exit 1; }

API_URL="$(grep -oP '^VITE_CORE_API_URL=\K.*' "$ENV_FILE" 2>/dev/null || true)"
[ -n "$API_URL" ] || { echo "Errore: VITE_CORE_API_URL non trovato in $ENV_FILE." >&2; exit 1; }

DB_USER="$(grep -oP '^DB_USER=\K.*' "$ENV_FILE" 2>/dev/null || true)"
DB_NAME="$(grep -oP '^DB_NAME=\K.*' "$ENV_FILE" 2>/dev/null || true)"

WEBSITE_ID=""
if [ -n "$DB_USER" ] && [ -n "$DB_NAME" ]; then
  # </dev/null: `exec -T` still attaches the local stdin to the container
  # process - without this, psql competes with publish-site.sh/
  # publish-mobile.sh below for whatever's piped into this script (e.g.
  # answers typed ahead, or in a non-interactive test run).
  ROWS="$(docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" exec -T postgres \
    psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT id, name FROM websites ORDER BY created_at;" 2>/dev/null </dev/null || true)"
  COUNT="$(printf '%s\n' "$ROWS" | grep -c '.' || true)"
  if [ "$COUNT" -eq 1 ]; then
    WEBSITE_ID="${ROWS%%|*}"
    echo "Website trovato: ${ROWS#*|} (${WEBSITE_ID})"
  elif [ "$COUNT" -gt 1 ]; then
    echo "Piu' di un website in questo workspace - scegli l'ID manualmente:"
    printf '%s\n' "$ROWS" | awk -F'|' '{printf "  %s  %s\n", $1, $2}'
  else
    echo "Nessun website trovato nel database del workspace (o postgres non raggiungibile) - inserisci l'ID manualmente."
  fi
fi

echo
echo ">>> Pubblico da workspace '${SLUG}' (${API_URL}) ..."
echo

if [ "$TARGET" = "site" ]; then
  PUBLISH_API_URL="$API_URL" PUBLISH_WEBSITE_ID="$WEBSITE_ID" "$ROOT_DIR/publish-site.sh"
else
  MOBILE_API_URL="$API_URL" MOBILE_WEBSITE_ID="$WEBSITE_ID" "$ROOT_DIR/publish-mobile.sh"
fi
