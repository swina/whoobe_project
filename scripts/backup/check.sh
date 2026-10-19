#!/usr/bin/env bash
# Is the newest backup recent enough? For a monitor, a cron job that mails on failure, or the end of pull.sh.
# Usage: scripts/backup/check.sh <dir> <slug> [max-hours]       (default 26)
# Looks at <dir>/<slug>.last-success (written by nightly.sh) and at the newest dump in <dir>/db. Exit 0 = fine,
# 1 = too old, missing or empty. Prints one line either way.
set -euo pipefail
[ $# -ge 2 ] || { sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
DIR="$1"; SLUG="$2"; MAX_H="${3:-26}"
[[ "$MAX_H" =~ ^[0-9]+$ ]] || { echo "max-hours must be a number" >&2; exit 2; }
fail() { echo "BACKUP PROBLEM ($SLUG): $*" >&2; exit 1; }
MARK="$DIR/$SLUG.last-success"
[ -s "$MARK" ] || fail "no marker $MARK: no backup has completed here"
LAST="$(cat "$MARK")"; [[ "$LAST" =~ ^[0-9]+$ ]] || fail "the marker is not a time"
AGE_H=$(( ( $(date +%s) - LAST ) / 3600 ))
[ "$AGE_H" -le "$MAX_H" ] || fail "last success $AGE_H h ago (limit $MAX_H h)"
NEWEST="$(ls -1t "$DIR/db/${SLUG}"-*.sql.gz.* 2>/dev/null | head -n1 || true)"
[ -n "$NEWEST" ] && [ -s "$NEWEST" ] || fail "no dump in $DIR/db, or it is empty"
echo "backup ok ($SLUG): last success $AGE_H h ago, newest dump $(basename "$NEWEST") ($(stat -c %s "$NEWEST") bytes)"
