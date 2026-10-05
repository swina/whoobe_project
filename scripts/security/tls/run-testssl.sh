#!/usr/bin/env bash
# TLS test of the PRODUCTION nginx templates (deploy/nginx/workspace-ssl.conf.template + _locations.conf.template)
# with testssl.sh. No real certificate or domain is needed: a self-signed certificate for "localhost" is generated,
# the templates are rendered the way scripts/enable-tls.sh renders them, and an nginx container (host network, port
# 8443) serves them in front of the disposable stack. Certificate-trust findings (self-signed) are expected and ignored.
# Usage: scripts/security/tls/run-testssl.sh [nginx-image]     default: the image of docker-compose.proxy.yml
# Reports: scripts/security/reports/<date>/testssl-<image>-<time>.json, summary by summarize.py.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEC="$(cd "$HERE/.." && pwd)"; ROOT="$(cd "$SEC/../.." && pwd)"
IMG="${1:-$(grep -m1 'image:' "$ROOT/docker-compose.proxy.yml" | awk '{print $2}')}"
TIME="$(date +%H-%M-%S)"; DATE="$(date +%F)"
REPORTS="$SEC/reports/$DATE"; mkdir -p "$REPORTS"
WORK="$(mktemp -d)"; NAME="whoobe-tls-test"; PORT="${TLS_TEST_PORT:-8443}"
trap 'docker rm -f "$NAME" >/dev/null 2>&1; rm -rf "$WORK"' EXIT

mkdir -p "$WORK/certs/live/localhost" "$WORK/conf"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" \
  -keyout "$WORK/certs/live/localhost/privkey.pem" -out "$WORK/certs/live/localhost/fullchain.pem" 2>/dev/null
chmod 644 "$WORK"/certs/live/localhost/*.pem

sed -e "s/__ADMIN_PORT__/3100/g" -e "s/__CORE_API_PORT__/3103/g" -e "s/__ASSET_PROCESSOR_PORT__/3102/g" \
    -e "s/__GATEWAY_PORT__/3101/g" -e "s/__WHOOBE_ONE_PORT__/3106/g" "$ROOT/deploy/nginx/_locations.conf.template" > "$WORK/conf/_locations.inc"
sed -e "s/__HOSTNAME__/localhost/g" -e "s|__CERT_DIR__|/etc/letsencrypt|g" -e "s|__LOCATIONS_INCLUDE__|/etc/nginx/conf.d/_locations.inc|g" \
    -e "s/listen 443 ssl/listen ${PORT} ssl/" "$ROOT/deploy/nginx/workspace-ssl.conf.template" > "$WORK/conf/ssl.conf"

docker run -d --rm --name "$NAME" --network host -v "$WORK/conf:/etc/nginx/conf.d:ro" -v "$WORK/certs:/etc/letsencrypt:ro" "$IMG" >/dev/null || exit 2
for _ in $(seq 1 20); do (echo > "/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break; sleep 0.5; done
docker exec "$NAME" nginx -v 2>&1 | head -1
SAFE="$(echo "$IMG" | tr '/:@' '___' | cut -c1-40)"
chmod 777 "$WORK"   # testssl.sh runs as its own uid in the container; mktemp -d is 0700 (fails on CI runners)
docker run --rm --network host -v "$WORK:/data" drwetter/testssl.sh:latest --quiet --warnings off --jsonfile "/data/testssl.json" "localhost:$PORT" >"$WORK/testssl.log" 2>&1
cp "$WORK/testssl.json" "$REPORTS/testssl-$SAFE-$TIME.json" 2>/dev/null
cp "$WORK/testssl.log" "$REPORTS/testssl-$SAFE-$TIME.txt" 2>/dev/null
python3 "$HERE/summarize.py" "$REPORTS/testssl-$SAFE-$TIME.json" "$IMG"
