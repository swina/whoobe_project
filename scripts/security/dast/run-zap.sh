#!/usr/bin/env bash
# DAST with OWASP ZAP (docker) against the throwaway stack - NEVER against anything else (prepare.mjs refuses).
#   - API scan (spider from the OpenAPI document + active scan) of core-api, gateway and asset-processor, with an
#     admin session cookie injected into every request
#   - baseline (spider + passive rules) of the admin and the editor SPAs
# Usage: scripts/security/dast/run-zap.sh [--quick]   (--quick: passive only, ~2 min)
# Reports: scripts/security/reports/<date>/zap-<name>-<time>.{json,html}, then summarised by summarize.py.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEC="$(cd "$HERE/.." && pwd)"
DATE="$(date +%F)"; TIME="$(date +%H-%M-%S)"
REPORTS="$SEC/reports/$DATE"; WORK="$SEC/reports/zap-work"
mkdir -p "$REPORTS" "$WORK"
QUICK=false; [ "${1:-}" = "--quick" ] && QUICK=true
IMAGE="ghcr.io/zaproxy/zaproxy:stable"
ADMIN_URL="${SECURITY_TEST_ADMIN:-http://localhost:3100}"
EDITOR_URL="${SECURITY_TEST_EDITOR:-http://localhost:3106}"

cd "$SEC" && pnpm exec tsx dast/prepare.ts "$WORK" || { echo "prepare failed (is the stack up? scripts/security/stack.sh up)" >&2; exit 2; }
COOKIE="$(cat "$WORK/session-cookie.txt")"
# the session value stays out of the command line shown by `ps` as far as possible: ZAP reads it from a config file
cat > "$WORK/zap-auth.conf" <<CONF
replacer.full_list(0).description=session
replacer.full_list(0).enabled=true
replacer.full_list(0).matchtype=REQ_HEADER
replacer.full_list(0).matchstring=Cookie
replacer.full_list(0).regex=false
replacer.full_list(0).replacement=${COOKIE}
CONF
chmod 600 "$WORK/zap-auth.conf"

run() { docker run --rm --network host -u "$(id -u):$(id -g)" -v "$WORK:/zap/wrk:rw" "$IMAGE" "$@"; }
ZAP_OPTS="-configfile /zap/wrk/zap-auth.conf"

for svc in core-api gateway asset-processor; do
  echo "== ZAP API scan: $svc"
  extra=(); $QUICK && extra+=(-S) || extra+=(-T 12)
  run zap-api-scan.py -t "/zap/wrk/$svc.yaml" -f openapi -r "zap-$svc-$TIME.html" -J "zap-$svc-$TIME.json" -I -z "$ZAP_OPTS" "${extra[@]}" >"$WORK/zap-$svc.log" 2>&1
  echo "   exit=$? (alerts are judged by summarize.py)"
done
echo "== ZAP baseline: admin SPA and editor"
run zap-baseline.py -t "$ADMIN_URL/" -r "zap-admin-$TIME.html" -J "zap-admin-$TIME.json" -I -m 2 >"$WORK/zap-admin.log" 2>&1
run zap-baseline.py -t "$EDITOR_URL/whoobe-one/" -r "zap-editor-$TIME.html" -J "zap-editor-$TIME.json" -I -m 2 >"$WORK/zap-editor.log" 2>&1

mv "$WORK"/zap-*-"$TIME".* "$REPORTS"/ 2>/dev/null
rm -f "$WORK/zap-auth.conf" "$WORK/session-cookie.txt"
python3 "$HERE/summarize.py" "$REPORTS" "$TIME"
