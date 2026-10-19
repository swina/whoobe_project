#!/usr/bin/env bash
# Run on ANOTHER machine (your own server, a NAS): pull the backups that nightly.sh made on the workspace host, keep them
# there, and optionally copy them into an S3 bucket (the bundled Garage of that machine, or any S3). The workspace host
# holds no credentials for this machine, so a compromised host cannot delete or encrypt the copies.
# The dumps stay encrypted as they were made; the bucket copy is plain, as on the host (keep it on encrypted storage).
#
# Usage: scripts/backup/pull.sh          Settings from the environment, or the file PULL_ENV_FILE (default /etc/whoobe/pull.env):
#   PULL_REMOTE        user@host of the workspace host (ssh key login)             required
#   PULL_REMOTE_DIR    its BACKUP_DIR, e.g. /home/ubuntu/backups/nightly            required
#   PULL_SLUG          the workspace                                                required
#   PULL_LOCAL_DIR     where to keep the copies here (default $HOME/whoobe-backups)
#   PULL_RETAIN_DAYS   delete dumps older than this here (default 30), always keeping the newest 3
#   PULL_MAX_HOURS     age limit for the check at the end (default 26)
#   PULL_SSH_OPTS      extra ssh options, e.g. "-i /home/me/.ssh/backup_ed25519"
#   S3 copy, optional (needs Docker): PULL_S3_ENDPOINT, PULL_S3_BUCKET, PULL_S3_KEY, PULL_S3_SECRET, PULL_S3_REGION
# Nothing is ever deleted on the source. Files that disappear from the source bucket stay in the local bucket copy.
set -euo pipefail
umask 077
ENV_SETTINGS="${PULL_ENV_FILE:-/etc/whoobe/pull.env}"
if [ -r "$ENV_SETTINGS" ]; then set -a; . "$ENV_SETTINGS"; set +a; fi
: "${PULL_REMOTE:?PULL_REMOTE is required}" "${PULL_REMOTE_DIR:?PULL_REMOTE_DIR is required}" "${PULL_SLUG:?PULL_SLUG is required}"
LOCAL="${PULL_LOCAL_DIR:-$HOME/whoobe-backups}"; DAYS="${PULL_RETAIN_DAYS:-30}"; MAX_H="${PULL_MAX_HOURS:-26}"
[[ "$PULL_SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "Error: PULL_SLUG must be lowercase letters, digits and hyphens." >&2; exit 1; }
[[ "$DAYS" =~ ^[0-9]+$ ]] || { echo "Error: PULL_RETAIN_DAYS must be a number." >&2; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
SSH=(ssh -o BatchMode=yes ${PULL_SSH_OPTS:-})
RS=(rsync -a -e "${SSH[*]}")
mkdir -p "$LOCAL/db" "$LOCAL/bucket"; chmod 700 "$LOCAL" "$LOCAL/db" "$LOCAL/bucket"
log() { echo "$(date -u +%FT%TZ) $*"; }

log "pulling $PULL_SLUG from $PULL_REMOTE:$PULL_REMOTE_DIR"
# the marker comes last: it is copied only when the files it vouches for are already here
"${RS[@]}" --include="${PULL_SLUG}-*" --exclude='*' "$PULL_REMOTE:$PULL_REMOTE_DIR/db/" "$LOCAL/db/"
"${RS[@]}" "$PULL_REMOTE:$PULL_REMOTE_DIR/bucket/${PULL_SLUG}-bucket/" "$LOCAL/bucket/${PULL_SLUG}-bucket/" 2>/dev/null \
  || log "no bucket copy on the source (an external S3 bucket? then it is not part of this)"
"${RS[@]}" "$PULL_REMOTE:$PULL_REMOTE_DIR/${PULL_SLUG}.last-success" "$LOCAL/"

# the source must be fresh before anything is deleted here: a stalled source must not empty this side
"$HERE/check.sh" "$LOCAL" "$PULL_SLUG" "$MAX_H"
if [ "$DAYS" -gt 0 ]; then
  NOW=$(date +%s)
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ $(( NOW - $(stat -c %Y "$f") )) -gt $(( DAYS * 86400 )) ] || continue
    rm -f "$f" "${f%.sql.gz.*}.env.${f##*.}"; log "removed old $(basename "$f")"
  done < <(ls -1t "$LOCAL/db/${PULL_SLUG}"-*.sql.gz.* 2>/dev/null | tail -n +4)
fi

if [ -n "${PULL_S3_ENDPOINT:-}" ]; then
  : "${PULL_S3_BUCKET:?}" "${PULL_S3_KEY:?}" "${PULL_S3_SECRET:?}"
  rc() { docker run --rm --network host -u "$(id -u):$(id -g)" -v "$LOCAL:/data:ro" \
    -e RCLONE_CONFIG_S3_TYPE=s3 -e RCLONE_CONFIG_S3_PROVIDER=Other -e RCLONE_CONFIG_S3_ENDPOINT="$PULL_S3_ENDPOINT" \
    -e RCLONE_CONFIG_S3_REGION="${PULL_S3_REGION:-us-east-1}" -e RCLONE_CONFIG_S3_ACCESS_KEY_ID="$PULL_S3_KEY" \
    -e RCLONE_CONFIG_S3_SECRET_ACCESS_KEY="$PULL_S3_SECRET" rclone/rclone:1.68.2 "$@"; }
  log "copying to S3 bucket $PULL_S3_BUCKET"
  rc copy /data "S3:$PULL_S3_BUCKET" --stats-one-line -v   # copy, never sync: nothing is deleted by a mistake on the source
  [ "$DAYS" -gt 0 ] && rc delete "S3:$PULL_S3_BUCKET/db" --min-age "${DAYS}d" --rmdirs -v || true
fi
log "done"
