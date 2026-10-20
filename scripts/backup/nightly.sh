#!/usr/bin/env bash
# Nightly backup of one workspace, for a cron job or a systemd timer on the host that runs it: the encrypted database
# dump and env file (backup-workspace.sh), then a copy of the bucket (backup-workspace-bucket.sh), and a marker file that
# says when both succeeded. Everything goes under BACKUP_DIR; copying it off the host is a separate step (pull.sh on
# another machine, or your own sync tool).
#
# Usage: scripts/backup/nightly.sh <slug>
# Settings come from the environment, or from the file BACKUP_ENV_FILE (default /etc/whoobe/backup.env, read when it exists):
#   BACKUP_AGE_RECIPIENT   age public key (or a recipients file)      one of the two is required
#   BACKUP_GPG_RECIPIENT   id of a GPG public key
#   BACKUP_DIR             where the files go (default $HOME/backups/nightly, mode 700)
#   BACKUP_KEEP            how many database dumps to keep on this host (default 14)
#   BACKUP_S3_ENDPOINT     for an external S3 bucket (see backup-workspace-bucket.sh)
# Layout: $BACKUP_DIR/db/<slug>-<stamp>.sql.gz.age and .env.age, $BACKUP_DIR/bucket/<slug>-bucket/, $BACKUP_DIR/<slug>.last-success
# Exit status is not zero when anything failed; the marker is then left as it was, so scripts/backup/check.sh notices.
set -euo pipefail
umask 077
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"
[ $# -eq 1 ] || { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
SLUG="$1"
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "Error: slug must be lowercase letters, digits and hyphens." >&2; exit 1; }

ENV_SETTINGS="${BACKUP_ENV_FILE:-/etc/whoobe/backup.env}"
# shellcheck source=/dev/null
if [ -r "$ENV_SETTINGS" ]; then set -a; . "$ENV_SETTINGS"; set +a; fi
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/nightly}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
[[ "$BACKUP_KEEP" =~ ^[1-9][0-9]*$ ]] || { echo "Error: BACKUP_KEEP must be a number above zero." >&2; exit 1; }
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/bucket"; chmod 700 "$BACKUP_DIR" "$BACKUP_DIR/db" "$BACKUP_DIR/bucket"

log() { echo "$(date -u +%FT%TZ) $*"; }
log "backup of workspace $SLUG -> $BACKUP_DIR"
scripts/backup-workspace.sh "$SLUG" --out-dir "$BACKUP_DIR/db" --keep "$BACKUP_KEEP"
# the bucket right after the dump, so that the two are as close in time as they can be
scripts/backup-workspace-bucket.sh "$SLUG" --out-dir "$BACKUP_DIR/bucket"
date -u +%s > "$BACKUP_DIR/$SLUG.last-success.tmp"
mv "$BACKUP_DIR/$SLUG.last-success.tmp" "$BACKUP_DIR/$SLUG.last-success"
log "done: newest dump $(ls -1t "$BACKUP_DIR/db/${SLUG}"-*.sql.gz.* | head -n1 | xargs -n1 basename)"
