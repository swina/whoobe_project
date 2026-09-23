#!/usr/bin/env bash
# Renew every Let's Encrypt certificate issued by scripts/enable-tls.sh
# and reload whichever reverse proxy is in use. Meant to run periodically
# (e.g. a daily/weekly cron entry) - certbot only actually renews
# certificates within ~30 days of expiry, so running this often is safe
# and a no-op most of the time.
#
# Usage: ./scripts/renew-certs.sh
#
# Not installed into cron automatically - add it yourself, e.g.:
#   (crontab -l 2>/dev/null; echo "17 3 * * * cd $(pwd) && ./scripts/renew-certs.sh >> logs/renew-certs.log 2>&1") | crontab -

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d deploy/certbot/conf/live ] || [ -z "$(ls -A deploy/certbot/conf/live 2>/dev/null)" ]; then
  echo "Nessun certificato da rinnovare (deploy/certbot/conf/live e' vuoto o assente)."
  exit 0
fi

echo ">>> Eseguo certbot renew ..."
docker run --rm \
  -v "$ROOT_DIR/deploy/certbot/conf:/etc/letsencrypt" \
  -v "$ROOT_DIR/deploy/certbot/webroot:/var/www/certbot" \
  certbot/certbot renew --webroot -w /var/www/certbot --non-interactive

echo ">>> Ricarico il reverse proxy ..."
if command -v nginx >/dev/null 2>&1; then
  echo "    nginx sull'host: ricarico per applicare eventuali certificati rinnovati ..."
  sudo nginx -t && sudo systemctl reload nginx
else
  PROXY_RUNNING="$(docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" ps -q nginx 2>/dev/null || true)"
  if [ -n "$PROXY_RUNNING" ]; then
    docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" exec -T nginx nginx -s reload
    echo "    reverse-proxy condiviso 'whoobe-proxy' ricaricato."
  else
    echo "    reverse-proxy condiviso 'whoobe-proxy' non e' in esecuzione - niente da ricaricare."
  fi
fi

echo ">>> Fatto."
