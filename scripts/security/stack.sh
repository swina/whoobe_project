#!/usr/bin/env bash
# Throwaway Whoobe stack for security / Docker checks: separate compose project,
# own volumes, host ports = dev ports + 100 (see .env.sectest).
# Usage: scripts/security/stack.sh build | up | status | down
# S3_BACKEND=garage uses Garage (docker-compose.garage.yml) instead of MinIO; default is MinIO.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENVF="${SEC_ENV_FILE:-$ROOT/scripts/security/.env.sectest}"
[ -f "$ENVF" ] || "$ROOT/scripts/security/gen-env.sh" "$ENVF"   # first use (also in CI): generate it
export ENV_FILE="$ENVF"   # service env_file (compose resolves it relative to the compose file)
FILES=(-f "$ROOT/docker-compose.yml")
[ "${S3_BACKEND:-minio}" = garage ] && FILES+=(-f "$ROOT/docker-compose.garage.yml")
dc() { docker compose -p whoobe-sectest --env-file "$ENVF" "${FILES[@]}" "$@"; }
case "${1:-}" in
  build)  dc build ;;
  up)
    dc up -d --build
    # one-time bucket (idempotent)
    # read only what is needed: the file is a compose env file, not valid shell (VITE_FONT_FAMILIES contains '|')
    getv() { grep -E "^$1=" "$ENVF" | head -n1 | cut -d= -f2-; }
    S3_ACCESS_KEY_ID=$(getv S3_ACCESS_KEY_ID); S3_SECRET_ACCESS_KEY=$(getv S3_SECRET_ACCESS_KEY); S3_BUCKET=$(getv S3_BUCKET)
    if [ "${S3_BACKEND:-minio}" = garage ]; then
      "$ROOT/scripts/garage-init.sh" "$ENVF" whoobe-sectest
    else
    dc exec -T minio sh -c "mc alias set local http://localhost:9000 '$S3_ACCESS_KEY_ID' '$S3_SECRET_ACCESS_KEY' >/dev/null && mc mb --ignore-existing local/$S3_BUCKET" || echo "bucket creation failed - create $S3_BUCKET manually (minio console :9101)"
    fi
    dc ps ;;
  status) dc ps ;;
  down)   S3_BACKEND=garage; FILES+=(-f "$ROOT/docker-compose.garage.yml"); dc down -v --remove-orphans ;;   # both S3 variants, whichever was running   # -v also deletes the test DB/MinIO volumes
  *) echo "usage: $0 build|up|status|down"; exit 1 ;;
esac
