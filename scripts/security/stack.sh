#!/usr/bin/env bash
# Throwaway Whoobe stack for security / Docker checks: separate compose project,
# own volumes, host ports = dev ports + 100 (see .env.sectest).
# Usage: scripts/security/stack.sh build | up | status | down
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENVF="$ROOT/scripts/security/.env.sectest"
export ENV_FILE="$ENVF"   # service env_file (compose resolves it relative to the compose file)
dc() { docker compose -p whoobe-sectest --env-file "$ENVF" -f "$ROOT/docker-compose.yml" "$@"; }
case "${1:-}" in
  build)  dc build ;;
  up)
    dc up -d --build
    # one-time bucket (idempotent)
    set -a; . "$ENVF"; set +a
    dc exec -T minio sh -c "mc alias set local http://localhost:9000 '$S3_ACCESS_KEY_ID' '$S3_SECRET_ACCESS_KEY' >/dev/null && mc mb --ignore-existing local/$S3_BUCKET" || echo "bucket creation failed - create $S3_BUCKET manually (minio console :9101)"
    dc ps ;;
  status) dc ps ;;
  down)   dc down -v ;;   # -v also deletes the test DB/MinIO volumes
  *) echo "usage: $0 build|up|status|down"; exit 1 ;;
esac
