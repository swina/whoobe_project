#!/usr/bin/env bash
# Enable HTTPS (Let's Encrypt, webroot challenge) for an already
# provisioned workspace. Works the same way regardless of which reverse
# proxy scripts/provision-workspace.sh set up (host nginx or the shared
# containerized one, docker-compose.proxy.yml) - certbot only needs a
# webroot directory nginx serves /.well-known/acme-challenge/ from
# (already wired into every vhost, see deploy/nginx/workspace.conf.template),
# it never has to touch nginx itself.
#
# Requirements - this is Let's Encrypt talking to your server over the
# public internet, not something that can work for a dev-only hostname:
#   - <slug> must already be provisioned (.env.<slug> exists).
#   - Its WHOOBE_HOSTNAME must be a real domain, public DNS A/AAAA record
#     pointing at this host's public IP, with port 80 reachable from the
#     internet (the HTTP-01 challenge). ".local"/"localhost"/private or
#     loopback IPs are refused up front (use mkcert for local TLS instead
#     - Let's Encrypt cannot issue certificates for those).
#
# Usage: ./scripts/enable-tls.sh <slug> --email EMAIL [--yes] [--staging] [--force]
#   --email EMAIL   Required. Let's Encrypt account email (expiry/
#                     problem notices only - not shown publicly).
#   --yes           Skip the confirmation prompt.
#   --staging       Use Let's Encrypt's staging CA (untrusted test certs,
#                     but no rate limits) - use this first to check the
#                     whole flow works before spending a real attempt.
#   --force         Skip the public-hostname reachability guard.
#
# What it does once the certificate is issued: renders
# deploy/nginx/<slug>.conf from workspace-redirect.conf.template (HTTP
# now redirects to HTTPS, except the renewal challenge path) and
# deploy/nginx/<slug>-ssl.conf from workspace-ssl.conf.template (the 443
# vhost, same routing as before via the shared
# deploy/nginx/_locations-<slug>.inc), then reloads whichever reverse
# proxy is in use. Safe to re-run later (e.g. after DNS finally
# propagates) - certbot skips re-issuing a still-valid certificate.
#
# Renewal: Let's Encrypt certificates last 90 days. Run
# ./scripts/renew-certs.sh periodically (e.g. from cron) to renew every
# workspace's certificate and reload the proxy - this script only issues
# the first one.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  echo "Usage: $0 <slug> --email EMAIL [--yes] [--staging] [--force]" >&2
  exit 1
}

[ $# -ge 1 ] || usage
SLUG="$1"
shift

EMAIL=""
AUTO_YES=false
STAGING=false
FORCE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --email) EMAIL="$2"; shift 2 ;;
    --yes) AUTO_YES=true; shift ;;
    --staging) STAGING=true; shift ;;
    --force) FORCE=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

ENV_FILE=".env.${SLUG}"
[ -f "$ENV_FILE" ] || { echo "Errore: $ENV_FILE non trovato - provisiona prima il workspace con provision-workspace.sh / create-workspace.sh." >&2; exit 1; }

HOSTNAME_VAL="$(grep -oP '^WHOOBE_HOSTNAME=\K.*' "$ENV_FILE" 2>/dev/null || true)"
[ -n "$HOSTNAME_VAL" ] || { echo "Errore: WHOOBE_HOSTNAME non trovato in $ENV_FILE." >&2; exit 1; }

if [ -z "$EMAIL" ]; then
  read -rp "Email per l'account Let's Encrypt (avvisi di scadenza/problemi): " EMAIL
fi
[ -n "$EMAIL" ] || { echo "Errore: email richiesta." >&2; exit 1; }

hostname_looks_public() {
  local host="$1" ip
  case "$host" in
    *.local|localhost|*.localhost|*.test|*.invalid|*.example) return 1 ;;
  esac
  ip="$(getent hosts "$host" 2>/dev/null | awk '{print $1}' | head -n1)"
  [ -n "$ip" ] || return 1
  case "$ip" in
    127.*|10.*|192.168.*|169.254.*) return 1 ;;
    172.1[6-9].*|172.2[0-9].*|172.3[0-1].*) return 1 ;;
  esac
  return 0
}

if ! $FORCE && ! hostname_looks_public "$HOSTNAME_VAL"; then
  cat >&2 <<EOF
Errore: '${HOSTNAME_VAL}' non sembra un hostname pubblico raggiungibile
(dominio .local/localhost, oppure non risolve via DNS, oppure risolve a
un IP privato/loopback). Let's Encrypt non puo' emettere certificati per
questi casi - per TLS locale usa mkcert, non questo script.
Se sei sicuro che sia corretto (es. DNS split-horizon), rilancia con --force.
EOF
  exit 1
fi

echo
echo ">>> Sto per richiedere un certificato Let's Encrypt${STAGING:+ (staging)} per '${HOSTNAME_VAL}' (workspace '${SLUG}')."
echo "    Richiede che la porta 80 di questo host sia raggiungibile da internet su quell'hostname proprio ora."
if ! $AUTO_YES; then
  read -rp "Continuare? [y/N] " CONFIRM
  case "$CONFIRM" in
    y|Y|yes|si|s) ;;
    *) echo "Annullato." >&2; exit 1 ;;
  esac
fi

mkdir -p deploy/certbot/webroot deploy/certbot/conf

CERTBOT_ARGS=(certonly --webroot -w /var/www/certbot -d "$HOSTNAME_VAL" --email "$EMAIL" --agree-tos --non-interactive)
$STAGING && CERTBOT_ARGS+=(--staging)

echo ">>> Eseguo certbot ..."
docker run --rm \
  -v "$ROOT_DIR/deploy/certbot/conf:/etc/letsencrypt" \
  -v "$ROOT_DIR/deploy/certbot/webroot:/var/www/certbot" \
  certbot/certbot "${CERTBOT_ARGS[@]}"

[ -f "deploy/certbot/conf/live/${HOSTNAME_VAL}/fullchain.pem" ] || {
  echo "Errore: certbot non ha prodotto un certificato in deploy/certbot/conf/live/${HOSTNAME_VAL}/ - controlla l'output sopra (DNS? porta 80 raggiungibile?)." >&2
  exit 1
}

HOST_NGINX=false
command -v nginx >/dev/null 2>&1 && HOST_NGINX=true

if $HOST_NGINX; then
  CERTBOT_WEBROOT="$ROOT_DIR/deploy/certbot/webroot"
  CERT_DIR="$ROOT_DIR/deploy/certbot/conf"
  LOCATIONS_INCLUDE="$ROOT_DIR/deploy/nginx/_locations-${SLUG}.inc"
else
  CERTBOT_WEBROOT="/var/www/certbot"
  CERT_DIR="/etc/letsencrypt"
  LOCATIONS_INCLUDE="/etc/nginx/conf.d/_locations-${SLUG}.inc"
fi

echo ">>> Rendering deploy/nginx/${SLUG}.conf (redirect a HTTPS) ..."
sed \
  -e "s/__HOSTNAME__/${HOSTNAME_VAL}/g" \
  -e "s|__CERTBOT_WEBROOT__|${CERTBOT_WEBROOT}|g" \
  deploy/nginx/workspace-redirect.conf.template > "deploy/nginx/${SLUG}.conf"

echo ">>> Rendering deploy/nginx/${SLUG}-ssl.conf ..."
sed \
  -e "s/__HOSTNAME__/${HOSTNAME_VAL}/g" \
  -e "s|__CERT_DIR__|${CERT_DIR}|g" \
  -e "s|__LOCATIONS_INCLUDE__|${LOCATIONS_INCLUDE}|g" \
  deploy/nginx/workspace-ssl.conf.template > "deploy/nginx/${SLUG}-ssl.conf"

echo ">>> Ricarico il reverse proxy ..."
if $HOST_NGINX; then
  cat <<EOF
    nginx sull'host: ricarica per attivare il certificato:
      sudo nginx -t && sudo systemctl reload nginx
EOF
else
  docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" up -d
  docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" exec -T nginx nginx -s reload
  echo "    reverse-proxy condiviso 'whoobe-proxy' ricaricato."
fi

echo
echo ">>> HTTPS abilitato per '${HOSTNAME_VAL}': https://${HOSTNAME_VAL}"
$STAGING && echo "    (certificato di STAGING - non fidato dai browser, solo per verificare il flusso; rilancia senza --staging per uno reale.)"
