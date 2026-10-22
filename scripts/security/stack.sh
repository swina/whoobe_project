#!/usr/bin/env bash
# Throwaway Whoobe stack for security / Docker checks: separate compose project,
# own volumes, host ports = dev ports + 100 (see .env.sectest).
# Usage: scripts/security/stack.sh build | up | status | down
# SEC_STACK=b   a second, fully separate stack (project whoobe-sectest-b, .env.sectest-b, ports +200) for the
#               workspace-isolation tests; SEC_SERVICES="postgres garage core-api ..." starts only those (default: all).
# SEC_COMPOSE_FILE=offline.override.yml   an extra compose file; the one given here runs the stack on a network with no route out (see internal-bridge.sh)
# S3 store: Garage (creates its own bucket/key).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SUFFIX=""; PROJECT=whoobe-sectest; GEN=()
if [ "${SEC_STACK:-}" = b ]; then SUFFIX=-b; PROJECT=whoobe-sectest-b; GEN=(--offset 200 --name b); fi
ENVF="${SEC_ENV_FILE:-$ROOT/scripts/security/.env.sectest$SUFFIX}"
[ -f "$ENVF" ] || "$ROOT/scripts/security/gen-env.sh" "${GEN[@]}" "$ENVF"   # first use (also in CI): generate it
export ENV_FILE="$ENVF"   # service env_file (compose resolves it relative to the compose file)
FILES=(-f "$ROOT/docker-compose.yml")
[ -z "${SEC_COMPOSE_FILE:-}" ] || FILES+=(-f "$SEC_COMPOSE_FILE")
export COMPOSE_PROFILES=local-s3
dc() { docker compose -p "$PROJECT" --env-file "$ENVF" "${FILES[@]}" "$@"; }
case "${1:-}" in
  build)  dc build ;;
  up)
    # shellcheck disable=SC2086  # SEC_SERVICES is a word list on purpose
    dc up -d --build ${SEC_SERVICES:-}
    dc ps ;;   # Garage creates its bucket and key by itself
  status) dc ps ;;
  down)   dc down -v --remove-orphans ;;   # -v also deletes the test DB and object-store volumes
  *) echo "usage: $0 build|up|status|down"; exit 1 ;;
esac
