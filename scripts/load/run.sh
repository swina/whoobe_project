#!/usr/bin/env bash
# Load test of a throwaway stack: public page, public data query, API-client read and login, one at a time, with k6
# (Docker image). Writes scripts/load/reports/<date>/load-<time>.{json,txt} (git-ignored) and prints the table.
# Usage: scripts/load/run.sh [--vus N] [--duration 30s] [--limits sandbox|none] [--keep]
#   --limits sandbox  (default) container limits of docker-compose.sandbox.yml, the smallest configuration that has been
#                     operated (core-api 768 MB / 1 CPU, gateway 384 MB / 0.5, postgres 512 MB / 1, garage 512 MB / 1)
#   --limits none     no limits: the figures show the machine, not the configuration
# The per-address request limits of core-api are switched OFF for the run (one source address would hit them at once);
# the figures are therefore the capacity of the services, not what one address is allowed. Needs Docker, curl, python3.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VUS=20; DURATION=30s; LIMITS=sandbox; KEEP=false
while [ $# -gt 0 ]; do case "$1" in
  --vus) VUS="$2"; shift 2 ;;
  --duration) DURATION="$2"; shift 2 ;;
  --limits) LIMITS="$2"; shift 2 ;;
  --keep) KEEP=true; shift ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac; done
[[ "$VUS" =~ ^[0-9]+$ && "$DURATION" =~ ^[0-9]+s$ && "$LIMITS" =~ ^(sandbox|none)$ ]] || { echo "bad option" >&2; exit 1; }
PROJECT=whoobe-load
WORK="$(mktemp -d)"; ENVF="$WORK/env"
"$ROOT/scripts/security/gen-env.sh" --offset 600 --name ld "$ENVF" >/dev/null
printf 'PUBLIC_RATE_LIMIT_PER_MINUTE=0\nPUBLIC_QUERY_RATE_LIMIT_PER_MINUTE=0\nPUBLIC_SEARCH_RATE_LIMIT_PER_MINUTE=0\n' >> "$ENVF"
export ENV_FILE="$ENVF" COMPOSE_PROFILES=local-s3
envv() { grep -m1 "^$1=" "$ENVF" | cut -d= -f2-; }
CORE="http://localhost:$(envv WS_CORE_API_PORT)"; GW="http://localhost:$(envv WS_GATEWAY_PORT)"
EMAIL=$(envv SEED_ADMIN_EMAIL); PASSWORD=$(envv SEED_ADMIN_PASSWORD)
dc() { docker compose -p "$PROJECT" --env-file "$ENVF" -f "$ROOT/docker-compose.yml" "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
cleanup() { if $KEEP; then echo "kept: project $PROJECT, $WORK"; else dc down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$WORK"; fi; }
trap cleanup EXIT
jid() { python3 -c 'import json,sys; d=json.load(sys.stdin); print(next((v["id"] for v in d.values() if isinstance(v, dict) and "id" in v), d.get("id","")))'; }
call() { curl -fs -b "$WORK/jar" -H 'content-type: application/json' "$@"; }

dc up -d --build postgres garage core-api asset-processor gateway >/dev/null
for _ in $(seq 1 60); do curl -fs "$CORE/health" >/dev/null 2>&1 && curl -fs "$GW/health" >/dev/null 2>&1 && break; sleep 3; done
if ! { curl -fs "$CORE/health" && curl -fs "$GW/health"; } >/dev/null; then fail "services not healthy"; fi

if [ "$LIMITS" = sandbox ]; then
  lim() { local c; c=$(dc ps -q "$1"); docker update --memory "$2" --memory-swap "$2" --cpus "$3" "$c" >/dev/null; }
  lim core-api 768m 1.0; lim gateway 384m 0.5; lim postgres 512m 1.0; lim garage 512m 1.0; lim asset-processor 1g 1.0
fi

echo "== seed"
curl -fs -c "$WORK/jar" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$CORE/auth/login" >/dev/null
WEBSITE=$(curl -fs "$CORE/public/websites" | python3 -c 'import json,sys; print(json.load(sys.stdin)["websites"][0]["id"])')
CLASS=LoadProbe
CID=$(call -d '{"name":"LoadProbe","label":"LoadProbe","fields":[{"name":"title","title":"Title","fieldType":"text"},{"name":"body","title":"Body","fieldType":"text"}]}' "$CORE/data-classes" | jid)
python3 - "$CID" > "$WORK/bulk.json" <<'PY'
import json, sys
print(json.dumps({"classId": sys.argv[1], "rows": [{"key": f"p-{i}", "attributes": {"title": f"Product {i}", "body": "lorem ipsum " * 20}} for i in range(500)]}))
PY
call -d @"$WORK/bulk.json" "$CORE/data-objects/bulk" >/dev/null || fail "bulk create failed"
dc exec -T postgres psql -U "$(envv POSTGRES_USER)" -d "$(envv POSTGRES_DB)" -qc "update data_objects set published = true, published_at = now() where class_id = '$CID'" || fail "could not publish the objects"
python3 - > "$WORK/page.json" <<PY
import json
blocks = [{"id": f"b{i}", "element": "p", "text": "A paragraph of the page. " * 8} for i in range(40)]
print(json.dumps({"slug": "load-page", "title": "Load page", "websiteId": "$WEBSITE", "content": {"id": "root", "element": "div", "blocks": blocks}}))
PY
PID=$(call -d @"$WORK/page.json" "$CORE/whoobe-one/pages" | jid)
call -X PATCH -d '{"published":true}' "$CORE/whoobe-one/pages/$PID" >/dev/null
KEY=$(call -d "{\"name\":\"load\",\"scopes\":[\"data:read:$CLASS\"],\"rateLimitRps\":1000}" "$GW/api/v1/gateway/clients" | python3 -c 'import json,sys; print(json.load(sys.stdin)["plaintext"])')
curl -fs "$CORE/public/page/load-page?websiteId=$WEBSITE" >/dev/null || fail "the test page is not served"
curl -fs -H "authorization: Bearer $KEY" "$GW/client/v1/data/$CLASS?limit=1" >/dev/null || fail "the client read does not work"
echo "ok: 500 published objects, one page of 40 blocks, one API client"

echo "== k6 ($VUS virtual users, $DURATION per scenario, limits: $LIMITS)"
OUT="$ROOT/scripts/load/reports/$(date -u +%F)"; mkdir -p "$OUT"; STAMP=$(date -u +%H-%M-%S)
mapfile -t IDS < <(dc ps -q core-api gateway postgres garage)
( while sleep 10; do docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' "${IDS[@]}" >> "$WORK/stats.txt" 2>/dev/null || true; done ) &
STATS=$!
docker run --rm --network host -u "$(id -u):$(id -g)" -v "$ROOT/scripts/load:/s:ro" -v "$OUT:/out" \
  -e CORE="$CORE" -e GATEWAY="$GW" -e KEY="$KEY" -e EMAIL="$EMAIL" -e PASSWORD="$PASSWORD" -e WEBSITE="$WEBSITE" -e PAGE=load-page -e CLASS="$CLASS" \
  -e VUS="$VUS" -e DURATION="$DURATION" grafana/k6:0.55.0 run --quiet --summary-export "/out/load-$STAMP.json" /s/load.js > "$OUT/k6-$STAMP.log" 2>&1 || { kill $STATS 2>/dev/null; cat "$OUT/k6-$STAMP.log" >&2; fail "k6 failed"; }
kill $STATS 2>/dev/null || true
python3 "$ROOT/scripts/load/summarize.py" "$OUT/load-$STAMP.json" "$VUS" "$DURATION" "$LIMITS" "$WORK/stats.txt" | tee "$OUT/load-$STAMP.txt"
