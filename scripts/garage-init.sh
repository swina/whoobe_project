#!/usr/bin/env bash
# One-time (idempotent) Garage setup for docker-compose.garage.yml: cluster layout, the app's access key, the bucket.
# Usage: scripts/garage-init.sh [env-file] [compose project name]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="${1:-$ROOT/.env}"; PROJECT="${2:-}"
getv() { grep -E "^$1=" "$ENVF" | head -n1 | cut -d= -f2-; }
KEY_ID=$(getv S3_ACCESS_KEY_ID); SECRET=$(getv S3_SECRET_ACCESS_KEY); BUCKET=$(getv S3_BUCKET)
dc() { docker compose ${PROJECT:+-p "$PROJECT"} --env-file "$ENVF" -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.garage.yml" "$@"; }
g() { dc exec -T garage /garage "$@"; }
NODE=$(g node id -q 2>/dev/null | cut -d@ -f1)
if ! g layout show 2>/dev/null | grep -q "$NODE"; then
  g layout assign -z dc1 -c 100G "$NODE"
  g layout apply --version 1
fi
g key info "$KEY_ID" >/dev/null 2>&1 || g key import --yes -n whoobe "$KEY_ID" "$SECRET"
g bucket info "$BUCKET" >/dev/null 2>&1 || g bucket create "$BUCKET"
g bucket allow --read --write --owner "$BUCKET" --key "$KEY_ID"
echo "garage ready: bucket $BUCKET"
