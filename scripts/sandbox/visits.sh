#!/usr/bin/env bash
# Who tried the public sandbox: a summary of its visit log (deploy/profiles/sandbox.nginx-http.conf writes it to
# /var/log/nginx/sandbox-access.log, rotated by the host's logrotate: 14 days).
#
#   scripts/sandbox/visits.sh [days]            on the host (needs read access to the log: the `adm` group on Ubuntu)
#   ssh oracle 'cd /opt/whoobe/whoobe_cms && scripts/sandbox/visits.sh 7'
#
# The log is anonymous by design: the address is cut to its network (IPv4 /24, IPv6 /48), the query string is not logged. So a
# "visitor" below is a network + browser pair: people behind one office address with the same browser count once, and one person
# on mobile data who changes network counts more than once. Read the numbers as an order of magnitude.
#   visitors  distinct network+browser pairs that are not a known robot (user agent with bot, crawl, spider, curl, python...)
#   logins    successful sign-ins of the demo account (POST /auth/login answered 200)
#   active    visitors who signed in and then changed something (a POST/PUT/PATCH/DELETE that succeeded, other than sign-in/out)
# Times are UTC. LOG=<file or glob> reads another log (default /var/log/nginx/sandbox-access.log*).
set -euo pipefail

DAYS="${1:-7}"
[[ "$DAYS" =~ ^[0-9]+$ ]] || { echo "usage: $0 [days]" >&2; exit 2; }
LOG="${LOG:-/var/log/nginx/sandbox-access.log*}"
SINCE="$(date -u -d "$DAYS days ago" +%F)"

# shellcheck disable=SC2086
files=( $LOG )
[ -e "${files[0]}" ] || { echo "no log found at: $LOG (is the sandbox's vhost on the profile with the visit log? sandbox.md)" >&2; exit 1; }

echo "Sandbox visits since $SINCE (UTC) - addresses are cut to their network, see the header of this script"
zcat -f "${files[@]}" | awk -v since="$SINCE" '
function isbot(ua) { return tolower(ua) ~ /bot|crawl|spider|slurp|curl|wget|python|go-http|java\/|scanner|monitor|uptime|headless|httpclient|libwww|okhttp|node-fetch|axios|postman/ }
{
  n = split($0, q, "\"")
  if (n < 5) next
  split(q[1], f, " ")
  ts = f[1]; ip = f[2]; method = f[3]; path = f[4]; status = f[5]
  day = substr(ts, 1, 10)
  if (day < since) next
  ref = q[2]; ua = q[4]
  if (isbot(ua)) { botreq[day]++; days[day] = 1; next }
  days[day] = 1
  req[day]++
  vis = ip "|" ua
  if (!((day, vis) in seen)) { seen[day, vis] = 1; visitors[day]++ }
  if (method == "POST" && path == "/auth/login" && status == 200) {
    logins[day]++
    if (!((day, vis) in li)) li[day, vis] = 1
  }
  if (method != "GET" && method != "HEAD" && method != "OPTIONS" && status ~ /^2/ && path != "/auth/login" && path != "/auth/logout") wr[day, vis] = 1
  if (method == "GET" && path !~ /^\/(auth|health|api)\//) pages[path]++
  if (!((day, vis) in refseen)) {
    refseen[day, vis] = 1
    host = ref; sub(/^[a-z]+:\/\//, "", host); sub(/\/.*$/, "", host)
    if (host == "-" || host == "") host = "(direct)"
    if (host !~ /whoobe\.dev$/) refs[host]++
  }
}
END {
  for (k in wr) { split(k, p, SUBSEP); if (k in li) active[p[1]]++ }
  nd = 0; for (d in days) order[++nd] = d
  # sort the days (few) with a simple insertion sort
  for (i = 2; i <= nd; i++) { v = order[i]; j = i - 1; while (j > 0 && order[j] > v) { order[j+1] = order[j]; j-- } order[j+1] = v }
  printf "%-11s %9s %9s %7s %7s %12s\n", "day", "requests", "visitors", "logins", "active", "robot reqs"
  for (i = 1; i <= nd; i++) { d = order[i]; printf "%-11s %9d %9d %7d %7d %12d\n", d, req[d], visitors[d], logins[d], active[d], botreq[d]; tr += req[d]; tv += visitors[d]; tl += logins[d]; ta += active[d]; tb += botreq[d] }
  printf "%-11s %9d %9d %7d %7d %12d\n", "total", tr, tv, tl, ta, tb
  print ""
  print "Where visitors came from (distinct visitor-days, outside whoobe.dev):"
  c = 0; for (h in refs) { rl[++c] = refs[h] "\t" h }
  m = 0; for (i = 1; i <= c; i++) { split(rl[i], t, "\t"); rc[i] = t[1] + 0; rn[i] = t[2] }
  for (shown = 0; shown < 10; shown++) { best = 0; for (i = 1; i <= c; i++) if (rc[i] > best) { best = rc[i]; bi = i } ; if (!best) break; printf "  %5d  %s\n", rc[bi], rn[bi]; rc[bi] = 0 }
  print ""
  print "Most requested pages (GET, no robots):"
  c = 0; for (pp in pages) { pc[++c] = pages[pp]; pn[c] = pp }
  for (shown = 0; shown < 10; shown++) { best = 0; for (i = 1; i <= c; i++) if (pc[i] > best) { best = pc[i]; bi = i } ; if (!best) break; printf "  %5d  %s\n", pc[bi], pn[bi]; pc[bi] = 0 }
}'
