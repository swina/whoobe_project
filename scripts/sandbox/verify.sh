#!/usr/bin/env bash
# Checks a running sandbox from the outside (docs/release/operations/sandbox.md).
# Usage: scripts/sandbox/verify.sh <base-url> <demo-email> <demo-password>     e.g. http://sandbox.localhost demo@whoobe.example ...
# Exits 1 on the first failed check. Leaves a few small test assets behind: it is meant for a sandbox that is reset anyway.
set -uo pipefail
BASE="${1:?base url}"; EMAIL="${2:?demo email}"; PASS="${3:?demo password}"
JAR="$(mktemp)"; TMP="$(mktemp -d)"; trap 'rm -rf "$JAR" "$TMP"' EXIT
fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "  ok    $1 ($3)"; else echo "  FAIL  $1: expected $2, got $3"; fail=1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -c "$JAR" "$@"; }

echo "health"
check "sandbox block in /health" 1 "$(curl -s "$BASE/health" | grep -c '"sandbox"')"
echo "login"
check "demo login" 200 "$(code -X POST "$BASE/auth/login" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")"
echo "disabled features"
check "AI generate"         403 "$(code -X POST "$BASE/ai/generate" -H 'content-type: application/json' -d '{}')"
check "AI settings"         403 "$(code "$BASE/ai/settings")"
check "mail settings"       403 "$(code "$BASE/mail-settings")"
check "mail test"           403 "$(code -X POST "$BASE/mail-settings/test" -H 'content-type: application/json' -d '{}')"
check "figma import"        403 "$(code -X POST "$BASE/figma/import" -H 'content-type: application/json' -d '{}')"
echo "users and roles: readable, not changeable"
check "list users"   200 "$(code "$BASE/auth/users")"
check "list roles"   200 "$(code "$BASE/auth/roles")"
check "create user"  403 "$(code -X POST "$BASE/auth/users" -H 'content-type: application/json' -d '{"email":"x@example.com","password":"Abcdefgh1234!","role":"viewer"}')"
check "create role"  403 "$(code -X POST "$BASE/auth/roles" -H 'content-type: application/json' -d '{"name":"x","permissions":[]}')"
check "disable MFA"  403 "$(code -X POST "$BASE/auth/mfa/disable" -H 'content-type: application/json' -d '{}')"
echo "public website settings (F-051)"
WID="$(curl -s "$BASE/public/websites" | python3 -c 'import sys,json; w=json.load(sys.stdin)["websites"]; print(w[0]["id"] if w else "")')"
if [ -n "$WID" ]; then check "only allow-listed settings keys" "" "$(curl -s "$BASE/public/websites/$WID" | python3 -c 'import sys,json; print(",".join(k for k in (json.load(sys.stdin)["website"].get("settings") or {}) if k not in ("themes","defaultThemeId")))')"; else echo "  skip  no website to check"; fi
echo "asset limits"
head -c $((5 * 1024 * 1024 + 1)) /dev/zero > "$TMP/big.bin"
check "file of 5 MB + 1 byte" 413 "$(code -X POST "$BASE/api/v1/dam/upload" -F "file=@$TMP/big.bin;filename=big.bin" -F pimcorePath=/sandbox-verify/big.bin)"
printf 'x' > "$TMP/small.txt"
for i in $(seq 1 60); do
  c="$(code -X POST "$BASE/api/v1/dam/upload" -F "file=@$TMP/small.txt;filename=f$i.txt;type=text/plain" -F "pimcorePath=/sandbox-verify/f$i.txt")"
  [ "$c" = 200 ] || { echo "  upload stopped at #$i with HTTP $c"; check "asset count limit reached with 409" 409 "$c"; break; }
done
[ "${c:-}" = 200 ] && { echo "  FAIL  60 uploads all accepted: no count limit"; fail=1; }
[ "$fail" = 0 ] && echo "All checks passed." || { echo "Some checks FAILED."; exit 1; }
