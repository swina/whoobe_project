#!/usr/bin/env bash
# Copy of a workspace's S3 bucket (assets, logs) to a directory, or back into the bucket. Uses rclone from a pinned
# Docker image, with the S3 key of .env.<slug>. The files are NOT encrypted here: put DIR on encrypted storage
# (docs/release/operations/encryption.md) and take it right after backup-workspace.sh so database and bucket match.
#
# Usage: ./scripts/backup-workspace-bucket.sh <slug> [--out-dir DIR] [--restore]
#   --out-dir DIR  the copy goes to DIR/<slug>-bucket (default ./backups)
#   --restore      copy DIR/<slug>-bucket into the bucket (it must exist: start the workspace's garage first). Adds and
#                  overwrites, deletes nothing.
# Endpoint: http://localhost:$WS_S3_API_PORT for the bundled Garage (published on the loopback); for an external S3 set
# BACKUP_S3_ENDPOINT in the environment of this script.
set -euo pipefail
umask 077
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
[ $# -ge 1 ] || usage
SLUG="$1"; shift
OUT_DIR="./backups"; RESTORE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --out-dir) OUT_DIR="${2:?--out-dir needs a value}"; shift 2 ;;
    --restore) RESTORE=true; shift ;;
    *) usage ;;
  esac
done
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "Error: slug must be lowercase letters, digits and hyphens." >&2; exit 1; }
ENV_FILE=".env.${SLUG}"
[ -f "$ENV_FILE" ] || { echo "Error: $ENV_FILE not found - not a workspace of this checkout." >&2; exit 1; }
get_env() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true; }
BUCKET="$(get_env S3_BUCKET)"; KEY="$(get_env S3_ACCESS_KEY_ID)"; SECRET="$(get_env S3_SECRET_ACCESS_KEY)"
REGION="$(get_env S3_REGION)"; PORT="$(get_env WS_S3_API_PORT)"
ENDPOINT="${BACKUP_S3_ENDPOINT:-http://localhost:${PORT:-9000}}"
[ -n "$BUCKET" ] && [ -n "$KEY" ] && [ -n "$SECRET" ] || { echo "Error: S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY missing in $ENV_FILE." >&2; exit 1; }

mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"
DEST="$(cd "$OUT_DIR" && pwd)/${SLUG}-bucket"
mkdir -p "$DEST"
rc() { # secrets go in the environment of the container, not on the command line
  docker run --rm --network host -u "$(id -u):$(id -g)" -v "$DEST:/data" \
    -e RCLONE_CONFIG_S3_TYPE=s3 -e RCLONE_CONFIG_S3_PROVIDER=Other -e RCLONE_CONFIG_S3_ENDPOINT="$ENDPOINT" \
    -e RCLONE_CONFIG_S3_REGION="${REGION:-us-east-1}" -e RCLONE_CONFIG_S3_ACCESS_KEY_ID="$KEY" -e RCLONE_CONFIG_S3_SECRET_ACCESS_KEY="$SECRET" \
    rclone/rclone:1.68.2 "$@"
}
if $RESTORE; then
  echo ">>> $DEST -> bucket $BUCKET ($ENDPOINT)"
  rc copy /data "S3:$BUCKET" --stats-one-line -v
else
  echo ">>> bucket $BUCKET ($ENDPOINT) -> $DEST"
  rc sync "S3:$BUCKET" /data --stats-one-line -v
fi
echo ">>> Done: $(find "$DEST" -type f | wc -l) files in $DEST. Not encrypted: keep it on encrypted storage."
