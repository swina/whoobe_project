#!/usr/bin/env bash
# Upgrade test: install release N-1, load data, upgrade to the current tree on the same volumes, check the migrations and a login.
# Usage: scripts/upgrade/upgrade-test.sh [--from <git ref>] [--keep]     (default --from v0.1.0; the target is the working tree)
# Throwaway stack: compose project whoobe-upgrade, own volumes, host ports = dev +400 (like scripts/security/stack.sh).
# Starts only postgres, garage and core-api: the migrations run when core-api starts. Exit 1 on the first failed check.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FROM=v0.1.0; KEEP=false
while [ $# -gt 0 ]; do case "$1" in
  --from) FROM="$2"; shift 2 ;;
  --keep) KEEP=true; shift ;;
  *) echo "usage: $0 [--from <git ref>] [--keep]"; exit 1 ;;
esac; done
PROJECT=whoobe-upgrade
WORK="$(mktemp -d)"
ENVF="$WORK/env"
"$ROOT/scripts/security/gen-env.sh" --offset 400 --name up "$ENVF" >/dev/null
envv() { grep -m1 "^$1=" "$ENVF" | cut -d= -f2-; }
WS_CORE_API_PORT=$(envv WS_CORE_API_PORT); POSTGRES_USER=$(envv POSTGRES_USER); POSTGRES_DB=$(envv POSTGRES_DB)
SEED_ADMIN_EMAIL=$(envv SEED_ADMIN_EMAIL); SEED_ADMIN_PASSWORD=$(envv SEED_ADMIN_PASSWORD)
export ENV_FILE="$ENVF" COMPOSE_PROFILES=local-s3
API="http://localhost:${WS_CORE_API_PORT}"
SERVICES=(postgres garage core-api)
dc() { docker compose -p "$PROJECT" --env-file "$ENVF" -f "$1/docker-compose.yml" "${@:2}"; }
sql() { dc "$2" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }
cleanup() {
  if $KEEP; then echo "kept: project $PROJECT, files $WORK"; return; fi
  dc "$ROOT" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

wait_health() {
  for _ in $(seq 1 60); do curl -fs "$API/health" >/dev/null 2>&1 && return 0; sleep 3; done
  dc "$1" logs --tail 40 core-api >&2; fail "core-api not healthy ($2)"
}
login() { curl -fs -c "$WORK/jar" -H 'content-type: application/json' -d "{\"email\":\"$SEED_ADMIN_EMAIL\",\"password\":\"$SEED_ADMIN_PASSWORD\"}" "$API/auth/login" >/dev/null; }
journal_count() { python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]+"/packages/core/drizzle/meta/_journal.json"))["entries"]))' "$1"; }
call() { curl -fs -b "$WORK/jar" -H 'content-type: application/json' "$@"; }

# 1. release N-1
OLD="$WORK/old"; mkdir "$OLD"
git -C "$ROOT" archive "$FROM" | tar -x -C "$OLD"
OLD_MIGS=$(journal_count "$OLD")
NEW_MIGS=$(journal_count "$ROOT")
echo "== install $FROM ($OLD_MIGS migrations), then upgrade to the working tree ($NEW_MIGS migrations)"
dc "$OLD" up -d --build "${SERVICES[@]}" >/dev/null
wait_health "$OLD" "$FROM"
[ "$(sql 'select count(*) from drizzle.__drizzle_migrations' "$OLD")" = "$OLD_MIGS" ] || fail "$FROM did not apply $OLD_MIGS migrations"
ok "$FROM started, $OLD_MIGS migrations applied"

# 2. data written by N-1
login
CLASS=$(call -d '{"name":"UpgradeProbe","label":"UpgradeProbe","fields":[{"name":"title","title":"Title","fieldType":"text"}]}' "$API/data-classes" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("class") or d).get("id",""))')
[ -n "$CLASS" ] && [ "$CLASS" != null ] || fail "could not create the probe class"
call -d "{\"classId\":\"$CLASS\",\"key\":\"before-upgrade\",\"attributes\":{\"title\":\"written by $FROM\"}}" "$API/data-objects" >/dev/null
USERS_BEFORE=$(sql 'select count(*) from users' "$OLD")
ok "probe class and object written (users: $USERS_BEFORE)"

# 3. upgrade: stop the old core-api, start the current tree on the same volumes
dc "$OLD" stop core-api >/dev/null
dc "$ROOT" up -d --build "${SERVICES[@]}" >/dev/null
wait_health "$ROOT" "working tree"

# 4. checks
[ "$(sql 'select count(*) from drizzle.__drizzle_migrations' "$ROOT")" = "$NEW_MIGS" ] || fail "expected $NEW_MIGS migrations after the upgrade"
ok "$NEW_MIGS migrations applied"
# tables created by the migration files added since $FROM
while read -r t; do
  [ "$(sql "select to_regclass('public.$t') is not null" "$ROOT")" = t ] || fail "table $t from a new migration is missing"
done < <(git -C "$ROOT" diff --name-only --diff-filter=A "$FROM" HEAD -- 'packages/core/drizzle/*.sql' \
  | while read -r f; do git -C "$ROOT" show "HEAD:$f"; done \
  | grep -oE 'CREATE TABLE( IF NOT EXISTS)? "?[a-z_]+"?' | sed -E 's/.*TABLE( IF NOT EXISTS)? //; s/"//g' | sort -u)
ok "tables of the new migrations exist"
[ "$(sql 'select count(*) from users' "$ROOT")" = "$USERS_BEFORE" ] || fail "user count changed"
login || fail "login as the seeded administrator failed after the upgrade"
ok "login works"
[ "$(sql "select attributes->>'title' from data_objects where key = 'before-upgrade'" "$ROOT")" = "written by $FROM" ] || fail "the object written by $FROM is gone or changed"
ok "data written by $FROM is intact"
echo "UPGRADE TEST PASSED: $FROM -> working tree"
