#!/usr/bin/env bash
# Restore rehearsal: runs the backup and restore tools of docs/release/operations/backup-restore-and-dr.md on a throwaway
# workspace and proves that nothing is lost. Steps: start a workspace (postgres, garage, core-api), write a class and an
# object and put a file in the bucket, back up (database + env file encrypted with a temporary GPG key, bucket copied),
# DESTROY the workspace with its volumes, recreate it from the decrypted env file, restore bucket and database, start
# core-api, and check the migrations, the object, the file and a login.
# Usage: scripts/restore/rehearse.sh [--keep]      Needs Docker and gpg. Slug restoretest, host ports = dev +500.
# It writes .env.restoretest in the repository root (git-ignored) and removes it at the end.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
KEEP=false; [ "${1:-}" = "--keep" ] && KEEP=true
SLUG=restoretest; PROJECT="ws-$SLUG"; ENVF=".env.$SLUG"
[ ! -e "$ENVF" ] || { echo "$ENVF exists: remove it (a previous run, or a real workspace?)" >&2; exit 1; }
WORK="$(mktemp -d)"
scripts/security/gen-env.sh --offset 500 --name rt "$ENVF" >/dev/null
export ENV_FILE="$ROOT/$ENVF" COMPOSE_PROFILES=local-s3 GNUPGHOME="$WORK/gnupg"
envv() { grep -m1 "^$1=" "$ENVF" | cut -d= -f2-; }
API="http://localhost:$(envv WS_CORE_API_PORT)"; DBU=$(envv POSTGRES_USER); DBN=$(envv POSTGRES_DB)
EMAIL=$(envv SEED_ADMIN_EMAIL); PASS=$(envv SEED_ADMIN_PASSWORD)
dc() { docker compose -p "$PROJECT" --env-file "$ENVF" "$@"; }
sql() { dc exec -T postgres psql -U "$DBU" -d "$DBN" -tA -c "$1"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }
cleanup() {
  if $KEEP; then echo "kept: project $PROJECT, $ENVF, $WORK"; return; fi
  dc down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$WORK" "$ENVF"
}
trap cleanup EXIT
wait_health() { for _ in $(seq 1 60); do curl -fs "$API/health" >/dev/null 2>&1 && return 0; sleep 3; done; dc logs --tail 40 core-api >&2; fail "core-api not healthy"; }
login() { curl -fs -c "$WORK/jar" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$API/auth/login" >/dev/null; }
call() { curl -fs -b "$WORK/jar" -H 'content-type: application/json' "$@"; }
wait_garage() { for _ in $(seq 1 40); do scripts/backup-workspace-bucket.sh "$SLUG" --out-dir "$WORK/probe" >/dev/null 2>&1 && return 0; sleep 3; done; fail "the bucket does not answer"; }

echo "== 1. a workspace with data"
dc up -d --build postgres garage core-api >/dev/null
wait_health; wait_garage; login
CLASS=$(call -d '{"name":"RehearsalProbe","label":"RehearsalProbe","fields":[{"name":"title","title":"Title","fieldType":"text"}]}' "$API/data-classes" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("class") or d).get("id",""))')
[ -n "$CLASS" ] || fail "could not create the probe class"
call -d "{\"classId\":\"$CLASS\",\"key\":\"rehearsal-1\",\"attributes\":{\"title\":\"before the disaster\"}}" "$API/data-objects" >/dev/null
MIGS=$(sql 'select count(*) from drizzle.__drizzle_migrations'); USERS=$(sql 'select count(*) from users')
# a file in the bucket (assets are written by asset-processor; here the restore of the bucket is what is tested)
mkdir -p "$WORK/seed"; echo "asset written $(date -u +%FT%TZ)" > "$WORK/seed/probe.txt"; SUM=$(sha256sum < "$WORK/seed/probe.txt")
docker run --rm --network host -v "$WORK/seed:/seed:ro" \
  -e RCLONE_CONFIG_S3_TYPE=s3 -e RCLONE_CONFIG_S3_PROVIDER=Other -e RCLONE_CONFIG_S3_ENDPOINT="http://localhost:$(envv WS_S3_API_PORT)" \
  -e RCLONE_CONFIG_S3_ACCESS_KEY_ID="$(envv S3_ACCESS_KEY_ID)" -e RCLONE_CONFIG_S3_SECRET_ACCESS_KEY="$(envv S3_SECRET_ACCESS_KEY)" \
  rclone/rclone:1.68.2 copyto /seed/probe.txt "S3:$(envv S3_BUCKET)/rehearsal/probe.txt" >/dev/null
ok "workspace up: $MIGS migrations, $USERS user(s), one object, one file in the bucket"

echo "== 2. backup (the commands of the runbook)"
mkdir -m 700 "$GNUPGHOME"
gpg --batch --quiet --passphrase '' --quick-generate-key rehearsal@whoobe.local default default never
export BACKUP_GPG_RECIPIENT=rehearsal@whoobe.local
OUT="$WORK/backups"
scripts/backup-workspace.sh "$SLUG" --out-dir "$OUT" >/dev/null
scripts/backup-workspace-bucket.sh "$SLUG" --out-dir "$OUT" >/dev/null
DUMP=$(ls "$OUT"/*.sql.gz.gpg); ENVBK=$(ls "$OUT"/*.env.gpg)
scripts/restore-workspace-db.sh --check "$DUMP" >/dev/null && ok "the dump is readable ($(basename "$DUMP"))"
cp "$ENVF" "$WORK/env.original"

echo "== 3. disaster: the workspace and its volumes are deleted"
dc down -v --remove-orphans >/dev/null; rm -f "$ENVF"
[ -z "$(docker volume ls -q --filter "name=${PROJECT}_pgdata")" ] || fail "the database volume is still there"
ok "no containers, no volumes, no env file"

echo "== 4. restore on a clean host (runbook section 5)"
gpg --batch --quiet --decrypt "$ENVBK" > "$ENVF"; chmod 600 "$ENVF"
cmp -s "$ENVF" "$WORK/env.original" || fail "the decrypted env file differs from the original"
ok "env file decrypted, identical to the original"
dc up -d postgres garage >/dev/null
wait_garage
scripts/backup-workspace-bucket.sh "$SLUG" --out-dir "$OUT" --restore >/dev/null
for _ in $(seq 1 30); do sql 'select 1' >/dev/null 2>&1 && break; sleep 2; done
scripts/restore-workspace-db.sh "$SLUG" "$DUMP" --yes >/dev/null
dc up -d --build core-api >/dev/null
wait_health

echo "== 5. checks"
[ "$(sql 'select count(*) from drizzle.__drizzle_migrations')" = "$MIGS" ] || fail "migrations differ"
[ "$(sql 'select count(*) from users')" = "$USERS" ] || fail "user count differs"
[ "$(sql "select attributes->>'title' from data_objects where key = 'rehearsal-1'")" = "before the disaster" ] || fail "the object is lost or changed"
login || fail "login failed after the restore"
mkdir -p "$WORK/after"
docker run --rm --network host -v "$WORK/after:/after" \
  -e RCLONE_CONFIG_S3_TYPE=s3 -e RCLONE_CONFIG_S3_PROVIDER=Other -e RCLONE_CONFIG_S3_ENDPOINT="http://localhost:$(envv WS_S3_API_PORT)" \
  -e RCLONE_CONFIG_S3_ACCESS_KEY_ID="$(envv S3_ACCESS_KEY_ID)" -e RCLONE_CONFIG_S3_SECRET_ACCESS_KEY="$(envv S3_SECRET_ACCESS_KEY)" \
  rclone/rclone:1.68.2 copyto "S3:$(envv S3_BUCKET)/rehearsal/probe.txt" /after/probe.txt >/dev/null
[ "$(sha256sum < "$WORK/after/probe.txt")" = "$SUM" ] || fail "the file in the bucket is lost or changed"
ok "migrations, users, object, file in the bucket and login are as before"
echo "RESTORE REHEARSAL PASSED"
