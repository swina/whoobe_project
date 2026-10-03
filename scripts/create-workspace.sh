#!/usr/bin/env bash
# Interactive front-end to scripts/provision-workspace.sh: asks for the
# workspace's slug, hostname and seed admin credentials, works out the
# next free port-offset index on its own (scans .env.* for WS_POSTGRES_PORT
# so nobody has to keep a manual list of indices), then delegates the
# actual provisioning - env file, docker compose stack, MinIO bucket,
# nginx vhost / containerized reverse-proxy - to provision-workspace.sh.
# Once that succeeds, optionally offers to enable HTTPS for the workspace
# (scripts/enable-tls.sh) - only worth answering yes if the hostname you
# just entered is a real public domain already pointed at this host.
#
# Usage: ./scripts/create-workspace.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

next_free_index() {
  local max=0 f p idx
  for f in .env.*; do
    [ -f "$f" ] || continue
    p="$(grep -oP '^WS_POSTGRES_PORT=\K[0-9]+' "$f" 2>/dev/null || true)"
    [ -n "$p" ] || continue
    idx=$(((p - 5432) / 10))
    [ "$idx" -gt "$max" ] && max=$idx
  done
  echo $((max + 1))
}

read -rp "Slug workspace (minuscolo, lettere/cifre/trattini, es. client-a): " SLUG
read -rp "Hostname pubblico (es. client-a.example.com): " HOSTNAME_ARG

[[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "Errore: lo slug deve contenere solo lettere minuscole, cifre e trattini (ricevuto: $SLUG)" >&2; exit 1; }
[[ "$HOSTNAME_ARG" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?$ ]] || { echo "Errore: hostname non valido (nome host semplice, eventualmente con porta): $HOSTNAME_ARG" >&2; exit 1; }
[ -f ".env.${SLUG}" ] && { echo "Errore: .env.${SLUG} esiste gia' - workspace '${SLUG}' gia' provisionato." >&2; exit 1; }

INDEX="$(next_free_index)"
echo "Indice assegnato automaticamente: ${INDEX}"

read -rp "Email admin di seed [admin@example.com]: " SEED_EMAIL
SEED_EMAIL="${SEED_EMAIL:-admin@example.com}"

read -rsp "Password admin di seed (invio = generata random): " SEED_PASSWORD
echo

ARGS=("$ROOT_DIR/scripts/provision-workspace.sh" "$SLUG" "$HOSTNAME_ARG" "$INDEX" --seed-email "$SEED_EMAIL")
[ -n "$SEED_PASSWORD" ] && ARGS+=(--seed-password "$SEED_PASSWORD")

"${ARGS[@]}"

echo
read -rp "Abilitare HTTPS (Let's Encrypt) per '${HOSTNAME_ARG}'? Richiede un dominio pubblico reale gia' puntato su questo host [y/N]: " ENABLE_TLS
case "$ENABLE_TLS" in
  y|Y|yes|si|s)
    read -rp "Email per l'account Let's Encrypt: " TLS_EMAIL
    "$ROOT_DIR/scripts/enable-tls.sh" "$SLUG" --email "$TLS_EMAIL"
    ;;
  *)
    echo "HTTPS non abilitato ora - puoi farlo in seguito con: ./scripts/enable-tls.sh ${SLUG} --email <email>"
    ;;
esac
