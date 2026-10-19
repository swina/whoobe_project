#!/usr/bin/env bash
# Offline test of check.sh and pull.sh (no Docker, no network): a fake workspace host directory, an `ssh` stand-in that
# runs rsync locally, and the cases that matter: a fresh pull, an old dump pruned, a stale source refused and nothing deleted,
# the marker not copied when the copy fails. Usage: scripts/backup/selftest.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }; ok() { echo "ok: $*"; }
SRC="$W/src"; DST="$W/dst"; mkdir -p "$SRC/db" "$SRC/bucket/ws-bucket/sub" "$W/bin"
cat > "$W/bin/ssh" <<'S'
#!/usr/bin/env bash
# stand-in: ssh [options] host command... -> run the command here
while [[ "${1:-}" == -* ]]; do case "$1" in -o|-i|-p) shift 2 ;; *) shift ;; esac; done
shift; exec "$@"
S
chmod +x "$W/bin/ssh"; export PATH="$W/bin:$PATH"
mk() { echo "$2" > "$SRC/db/$1.sql.gz.age"; echo "env $2" > "$SRC/db/$1.env.age"; }
mk ws-20260101T030000Z old1; mk ws-20260102T030000Z old2; mk ws-20260103T030000Z old3; mk ws-20260104T030000Z old4
mk ws-20260105T030000Z new
for f in "$SRC/db/ws-20260101"* "$SRC/db/ws-20260102"* "$SRC/db/ws-20260103"* "$SRC/db/ws-20260104"*; do touch -d '60 days ago' "$f"; done
echo asset > "$SRC/bucket/ws-bucket/sub/a.txt"
date -u +%s > "$SRC/ws.last-success"

"$HERE/check.sh" "$SRC" ws 26 >/dev/null && ok "check passes on a fresh source"
echo $(( $(date +%s) - 30*3600 )) > "$W/stale"; mkdir -p "$W/s2/db"; cp "$SRC/db/"* "$W/s2/db/"; cp "$W/stale" "$W/s2/ws.last-success"
! "$HERE/check.sh" "$W/s2" ws 26 >/dev/null 2>&1 && ok "check fails when the last success is 30 h old"
! "$HERE/check.sh" "$W" nope 26 >/dev/null 2>&1 && ok "check fails when there is no marker"

export PULL_ENV_FILE=/nonexistent PULL_REMOTE=localhost PULL_REMOTE_DIR="$SRC" PULL_SLUG=ws PULL_LOCAL_DIR="$DST" PULL_RETAIN_DAYS=30
"$HERE/pull.sh" >/dev/null
[ -f "$DST/db/ws-20260105T030000Z.sql.gz.age" ] && [ -f "$DST/bucket/ws-bucket/sub/a.txt" ] && [ -f "$DST/ws.last-success" ] || fail "files not pulled"
ok "a pull brings the dumps, the bucket copy and the marker"
[ ! -e "$DST/db/ws-20260101T030000Z.sql.gz.age" ] && [ ! -e "$DST/db/ws-20260101T030000Z.env.age" ] || fail "an old dump was not pruned (with its env file)"
[ -f "$DST/db/ws-20260104T030000Z.sql.gz.age" ] || fail "the newest three are not kept"
ok "dumps older than 30 days are pruned with their env file, the newest three always stay"
n=$(ls "$SRC/db" | wc -l); [ "$n" = 10 ] || fail "the source was touched ($n files)"
ok "nothing is deleted on the source"

echo $(( $(date +%s) - 40*3600 )) > "$SRC/ws.last-success"; rm -f "$DST/db/ws-20260105T030000Z"*
touch -d '90 days ago' "$DST/db/ws-20260104T030000Z"* 2>/dev/null || true
! "$HERE/pull.sh" >/dev/null 2>&1 && ok "a stale source makes the pull fail"
ls "$DST/db/ws-20260104T030000Z.sql.gz.age" >/dev/null 2>&1 || fail "a stale source emptied the local copy"
ok "and the local copies are not pruned in that case"
echo "BACKUP SCRIPTS SELFTEST PASSED"
