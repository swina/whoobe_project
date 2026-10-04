#!/usr/bin/env bash
# Tear down a workspace stack previously created by
# scripts/provision-workspace.sh / scripts/create-workspace.sh: stops and
# removes its docker compose project (containers + network, and by
# default its Postgres/S3 data volumes too), removes its rendered
# nginx vhost (deploy/nginx/<slug>.conf) and env file (.env.<slug>), and
# either reminds you to unlink it from a host nginx or reloads the shared
# containerized proxy (docker-compose.proxy.yml) so it stops routing to
# the removed workspace.
#
# Usage: ./scripts/remove-workspace.sh [<slug>] [--yes] [--keep-volumes]
#   <slug>           Workspace to remove. If omitted, lists every
#                     workspace found (one .env.<slug> per workspace at
#                     the repo root) and asks which one to remove.
#   --yes            Skip the "type the slug to confirm" prompt.
#   --keep-volumes   Stop and remove the containers but keep the
#                     Postgres/S3 data volumes instead of deleting
#                     them (useful if you just want to pause a workspace
#                     rather than destroy its data).
#
# This is destructive by default - it drops the workspace's database and
# object storage - so it always asks for confirmation unless --yes is
# given.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  echo "Usage: $0 [<slug>] [--yes] [--keep-volumes]" >&2
  exit 1
}

AUTO_YES=false
KEEP_VOLUMES=false
SLUG=""
for arg in "$@"; do
  case "$arg" in
    --yes) AUTO_YES=true ;;
    --keep-volumes) KEEP_VOLUMES=true ;;
    -h|--help) usage ;;
    -*) echo "Unknown argument: $arg" >&2; usage ;;
    *)
      if [ -n "$SLUG" ]; then usage; fi
      SLUG="$arg"
      ;;
  esac
done

list_workspaces() {
  local f slug hostname count found=false
  for f in .env.*; do
    [ -f "$f" ] || continue
    [ "$f" = ".env.example" ] && continue
    slug="${f#.env.}"
    found=true
    hostname="$(grep -oP '^WHOOBE_HOSTNAME=\K.*' "$f" 2>/dev/null || echo "?")"
    count="$(docker compose -p "ws-${slug}" --env-file "$f" ps -q 2>/dev/null | wc -l | tr -d ' ')"
    printf '  %-20s host=%-30s container attivi=%s\n' "$slug" "$hostname" "$count"
  done
  $found || echo "  (nessun workspace trovato - nessun file .env.<slug> alla radice)"
}

if [ -z "$SLUG" ]; then
  echo "Workspace disponibili:"
  list_workspaces
  echo
  read -rp "Slug del workspace da rimuovere: " SLUG
  [ -n "$SLUG" ] || { echo "Errore: slug vuoto" >&2; exit 1; }
fi

[[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "Errore: slug non valido (solo minuscole, cifre e trattini): $SLUG" >&2; exit 1; }
ENV_FILE=".env.${SLUG}"
[ -f "$ENV_FILE" ] || { echo "Errore: $ENV_FILE non trovato - nessun workspace '${SLUG}' da rimuovere." >&2; exit 1; }

HOSTNAME_VAL="$(grep -oP '^WHOOBE_HOSTNAME=\K.*' "$ENV_FILE" 2>/dev/null || echo "?")"

echo
echo ">>> Stai per rimuovere il workspace '${SLUG}' (host: ${HOSTNAME_VAL})"
echo "    - progetto docker compose: ws-${SLUG} (container + rete)"
if $KEEP_VOLUMES; then
  echo "    - volumi dati (Postgres/S3): CONSERVATI (--keep-volumes)"
else
  echo "    - volumi dati (Postgres/S3): ELIMINATI DEFINITIVAMENTE"
fi
echo "    - deploy/nginx/${SLUG}.conf, ${SLUG}-ssl.conf, _locations-${SLUG}.inc"
if $KEEP_VOLUMES; then echo "    - ${ENV_FILE}: CONSERVATO"; else echo "    - ${ENV_FILE}"; fi
echo

if ! $AUTO_YES; then
  read -rp "Digita '${SLUG}' per confermare: " CONFIRM
  [ "$CONFIRM" = "$SLUG" ] || { echo "Conferma non corrispondente - annullato." >&2; exit 1; }
fi

echo ">>> Fermo e rimuovo il progetto docker compose ws-${SLUG} ..."
if $KEEP_VOLUMES; then
  docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" down
else
  docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" down -v
fi

echo ">>> Rimuovo i vhost deploy/nginx/${SLUG}*.conf e _locations-${SLUG}.inc (HTTP, HTTPS e routing) ..."
rm -f "deploy/nginx/${SLUG}.conf" "deploy/nginx/${SLUG}-ssl.conf" "deploy/nginx/_locations-${SLUG}.inc"

echo ">>> Aggiorno il reverse proxy ..."
if command -v nginx >/dev/null 2>&1; then
  if [ -L "/etc/nginx/sites-enabled/${SLUG}" ]; then
    echo "    nginx sull'host: rimuovi anche il symlink e ricarica:"
    echo "      sudo rm -f /etc/nginx/sites-enabled/${SLUG}"
    echo "      sudo nginx -t && sudo systemctl reload nginx"
  else
    echo "    nginx sull'host: nessun symlink in sites-enabled/${SLUG} - niente da fare."
  fi
else
  PROXY_RUNNING="$(docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" ps -q nginx 2>/dev/null || true)"
  if [ -n "$PROXY_RUNNING" ]; then
    docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" exec -T nginx nginx -s reload
    echo "    reverse-proxy condiviso 'whoobe-proxy' ricaricato - non instrada piu' verso '${SLUG}'."
  else
    echo "    reverse-proxy condiviso 'whoobe-proxy' non e' in esecuzione - niente da ricaricare."
  fi
fi

if $KEEP_VOLUMES; then
  # the env file is the only copy of the credentials that open the kept volumes: never delete it in that case
  echo ">>> ${ENV_FILE} CONSERVATO (--keep-volumes): contiene le credenziali dei volumi dati conservati - custodiscilo (mode 600)."
else
  echo ">>> Rimuovo ${ENV_FILE} ..."
  rm -f "$ENV_FILE"
fi

echo
echo ">>> Workspace '${SLUG}' rimosso."
