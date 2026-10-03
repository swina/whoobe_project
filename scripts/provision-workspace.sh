#!/usr/bin/env bash
# Provision a new, fully isolated Whoobe CMS workspace stack.
#
# Usage: ./scripts/provision-workspace.sh <slug> <hostname> <index> [--seed-email EMAIL] [--seed-password PASS]
#   <slug>      Short identifier, lowercase letters/digits/hyphens only
#               (e.g. "client-a"). Used for the compose project name,
#               the .env.<slug> filename, the DB name, and the S3 bucket
#               name.
#   <hostname>  Public hostname this workspace will be reached at (e.g.
#               "client-a.example.com"). Baked into the VITE_* URLs and
#               used as the nginx server_name.
#   <index>     Small positive integer (1, 2, 3, ...), unique per
#               workspace on this host. Ports are derived from it (index
#               * 10 added to each service's usual dev port: 3000s/5432/
#               9000s), so two workspaces never collide - keep a note of
#               which index belongs to which workspace.
#
# What it does:
#   1. Generates .env.<slug> from .env.example, with workspace-specific
#      DB name, S3 bucket, ports, hostname, and freshly generated
#      secrets/credentials (nothing shared with any other workspace).
#   2. Brings up a dedicated Compose project (`ws-<slug>`) from the
#      shared docker-compose.yml - its own Postgres, MinIO, core-api,
#      asset-processor, gateway, admin-dashboard, whoobe-one-spike.
#      core-api creates/migrates its own database schema on first boot,
#      so there is no separate migration step (see docs/deployment.md).
#   3. Creates the workspace's MinIO bucket.
#   4. Renders deploy/nginx/_locations-<slug>.inc (the actual proxy_pass
#      routing, shared by the HTTP and future HTTPS vhosts) and
#      deploy/nginx/<slug>.conf (HTTP-only bootstrap, from
#      deploy/nginx/workspace.conf.template), then wires up the reverse
#      proxy: if nginx is installed on the host, prints the symlink
#      command to add it manually; otherwise brings up (or reloads) a
#      single shared containerized nginx (docker-compose.proxy.yml,
#      project "whoobe-proxy") that serves every workspace's vhost with
#      no host nginx install required.
#
# HTTPS is a separate opt-in step (not part of provisioning, since it
# needs a real public hostname reachable on port 80) - run
# ./scripts/enable-tls.sh <slug> --email <email> once DNS points at this
# host, or answer yes when scripts/create-workspace.sh asks.
#
# Refuses to run if .env.<slug> already exists, so re-running never
# clobbers a provisioned workspace's secrets.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  echo "Usage: $0 <slug> <hostname> <index> [--seed-email EMAIL] [--seed-password PASS]" >&2
  exit 1
}

[ $# -ge 3 ] || usage
SLUG="$1"
HOSTNAME_ARG="$2"
INDEX="$3"
shift 3

SEED_EMAIL="admin@example.com"
SEED_PASSWORD="$(openssl rand -hex 12)"
while [ $# -gt 0 ]; do
  case "$1" in
    --seed-email) SEED_EMAIL="$2"; shift 2 ;;
    --seed-password) SEED_PASSWORD="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

[[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "Error: slug must be lowercase letters/digits/hyphens only (got: $SLUG)" >&2; exit 1; }
[[ "$INDEX" =~ ^[0-9]+$ ]] || { echo "Error: index must be a positive integer (got: $INDEX)" >&2; exit 1; }

# Every value below ends up in sed expressions, an env file and nginx configuration: refuse anything that could
# add a line, a directive or a shell/sed metacharacter instead of trying to escape it.
[[ "$HOSTNAME_ARG" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?$ ]] || { echo "Error: hostname must be a plain host name, optionally with a port (got: $HOSTNAME_ARG)" >&2; exit 1; }
[[ "$SEED_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "Error: invalid seed e-mail (got: $SEED_EMAIL)" >&2; exit 1; }
[[ "$SEED_PASSWORD" =~ ^[A-Za-z0-9._@+=:,%-]{8,128}$ ]] || { echo "Error: seed password must be 8-128 characters from A-Z a-z 0-9 . _ @ + = : , % - (no spaces, quotes, | & \\ \$ or #)" >&2; exit 1; }

DB_SAFE_SLUG="${SLUG//-/_}"
ENV_FILE=".env.${SLUG}"
PORT_OFFSET=$((INDEX * 10))

P_POSTGRES=$((5432 + PORT_OFFSET))
P_MINIO_API=$((9000 + PORT_OFFSET))
P_MINIO_CONSOLE=$((9001 + PORT_OFFSET))
P_ADMIN=$((3000 + PORT_OFFSET))
P_GATEWAY=$((3001 + PORT_OFFSET))
P_ASSET=$((3002 + PORT_OFFSET))
P_CORE=$((3003 + PORT_OFFSET))
P_WHOOBE_ONE=$((3006 + PORT_OFFSET))

if [ -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE already exists - refusing to overwrite an existing workspace's config." >&2
  echo "Delete it first if you really want to re-provision '${SLUG}'." >&2
  exit 1
fi

echo ">>> Generating $ENV_FILE ..."
# the file holds every credential of the workspace: readable by its owner only, from the first byte
( umask 077; cp .env.example "$ENV_FILE" )
chmod 600 "$ENV_FILE"

set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    # Guard against a missing trailing newline on the last existing line -
    # appending straight onto it would silently merge two keys into one
    # corrupted line instead of adding a new one.
    [ -s "$ENV_FILE" ] && [ -n "$(tail -c1 "$ENV_FILE")" ] && printf '\n' >> "$ENV_FILE"
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

DB_PASSWORD="$(openssl rand -hex 16)"
S3_SECRET="$(openssl rand -hex 16)"

set_env "ENV_FILE" "${ENV_FILE}"
set_env "WHOOBE_HOSTNAME" "${HOSTNAME_ARG}"
set_env "POSTGRES_USER" "whoobe_${DB_SAFE_SLUG}"
set_env "POSTGRES_PASSWORD" "${DB_PASSWORD}"
set_env "POSTGRES_DB" "whoobe_${DB_SAFE_SLUG}"
set_env "DB_USER" "whoobe_${DB_SAFE_SLUG}"
set_env "DB_PASSWORD" "${DB_PASSWORD}"
set_env "DB_NAME" "whoobe_${DB_SAFE_SLUG}"
set_env "MIGRATION_SOURCE_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
set_env "GATEWAY_AUTH_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
set_env "DAM_SERVICE_TOKEN" "$(openssl rand -hex 24)"
# the example file carries placeholders for these: never ship a workspace with the shared defaults
set_env "SITE_API_KEY_PEPPER" "$(openssl rand -hex 32)"
set_env "TOTP_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
set_env "S3_ACCESS_KEY_ID" "whoobe_${DB_SAFE_SLUG}"
set_env "S3_SECRET_ACCESS_KEY" "${S3_SECRET}"
set_env "S3_BUCKET" "whoobe-cms-${SLUG}"
# Production convention (docs/deployment.md): bare hostname, nginx
# path-routes to the right upstream - not the dev per-port form.
set_env "S3_PUBLIC_BASE_URL" "https://${HOSTNAME_ARG}/dam-asset"
set_env "VITE_ASSET_PROCESSOR_URL" "https://${HOSTNAME_ARG}"
set_env "VITE_CORE_API_URL" "https://${HOSTNAME_ARG}"
set_env "VITE_GATEWAY_URL" "https://${HOSTNAME_ARG}"
set_env "ASSET_PROCESSOR_URL" "https://${HOSTNAME_ARG}"
set_env "VITE_BASE_URL" "/whoobe-one/"
set_env "SEED_ADMIN_EMAIL" "${SEED_EMAIL}"
set_env "SEED_ADMIN_PASSWORD" "${SEED_PASSWORD}"
# the reverse proxy runs on this host (network_mode: host): the application ports need not be reachable from outside
set_env "WS_APP_BIND_ADDRESS" "127.0.0.1"
set_env "WS_DATA_BIND_ADDRESS" "127.0.0.1"
set_env "WS_POSTGRES_PORT" "${P_POSTGRES}"
set_env "WS_MINIO_API_PORT" "${P_MINIO_API}"
set_env "WS_MINIO_CONSOLE_PORT" "${P_MINIO_CONSOLE}"
set_env "WS_ADMIN_DASHBOARD_PORT" "${P_ADMIN}"
set_env "WS_GATEWAY_PORT" "${P_GATEWAY}"
set_env "WS_ASSET_PROCESSOR_PORT" "${P_ASSET}"
set_env "WS_CORE_API_PORT" "${P_CORE}"
set_env "WS_WHOOBE_ONE_SPIKE_PORT" "${P_WHOOBE_ONE}"

echo ">>> Bringing up ws-${SLUG} ..."
docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" up -d --build

echo ">>> Waiting for MinIO to be healthy ..."
until docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" exec -T minio curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; do
  sleep 2
done

echo ">>> Creating MinIO bucket whoobe-cms-${SLUG} ..."
docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" exec -T minio sh -c \
  "mc alias set whoobe http://localhost:9000 'whoobe_${DB_SAFE_SLUG}' '${S3_SECRET}' && mc mb whoobe/whoobe-cms-${SLUG} --ignore-existing"

# Detected once, up front, since it decides which literal filesystem
# paths get baked into the rendered vhost (host-nginx reads deploy/nginx
# directly off the host filesystem; the containerized proxy sees the same
# directory bind-mounted at /etc/nginx/conf.d - see docker-compose.proxy.yml).
HOST_NGINX=false
command -v nginx >/dev/null 2>&1 && HOST_NGINX=true

mkdir -p deploy/nginx deploy/certbot/webroot deploy/certbot/conf

if $HOST_NGINX; then
  CERTBOT_WEBROOT="$ROOT_DIR/deploy/certbot/webroot"
  LOCATIONS_INCLUDE="$ROOT_DIR/deploy/nginx/_locations-${SLUG}.inc"
else
  CERTBOT_WEBROOT="/var/www/certbot"
  LOCATIONS_INCLUDE="/etc/nginx/conf.d/_locations-${SLUG}.inc"
fi

echo ">>> Rendering deploy/nginx/_locations-${SLUG}.inc ..."
sed \
  -e "s/__ADMIN_PORT__/${P_ADMIN}/g" \
  -e "s/__CORE_API_PORT__/${P_CORE}/g" \
  -e "s/__ASSET_PROCESSOR_PORT__/${P_ASSET}/g" \
  -e "s/__GATEWAY_PORT__/${P_GATEWAY}/g" \
  -e "s/__WHOOBE_ONE_PORT__/${P_WHOOBE_ONE}/g" \
  deploy/nginx/_locations.conf.template > "deploy/nginx/_locations-${SLUG}.inc"

echo ">>> Rendering deploy/nginx/${SLUG}.conf ..."
sed \
  -e "s/__HOSTNAME__/${HOSTNAME_ARG}/g" \
  -e "s|__CERTBOT_WEBROOT__|${CERTBOT_WEBROOT}|g" \
  -e "s|__LOCATIONS_INCLUDE__|${LOCATIONS_INCLUDE}|g" \
  deploy/nginx/workspace.conf.template > "deploy/nginx/${SLUG}.conf"

echo ">>> Wiring up the reverse proxy for ${HOSTNAME_ARG} ..."
if $HOST_NGINX; then
  PROXY_NOTE="nginx trovato sull'host - collega il vhost a mano:
                       sudo ln -sf \"$ROOT_DIR/deploy/nginx/${SLUG}.conf\" /etc/nginx/sites-enabled/${SLUG}
                       sudo nginx -t && sudo systemctl reload nginx"
else
  echo "    nginx non trovato sull'host - uso il reverse-proxy condiviso containerizzato (whoobe-proxy) ..."
  docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" up -d
  # deploy/nginx is bind-mounted live into that container, so reload just
  # picks up this workspace's new vhost (plus any added since the proxy
  # last started) with no downtime for already-running workspaces.
  docker compose -p whoobe-proxy -f "$ROOT_DIR/docker-compose.proxy.yml" exec -T nginx nginx -s reload
  PROXY_NOTE="reverse-proxy condiviso 'whoobe-proxy' (container, porta host 80) - nessuna azione manuale richiesta."
fi

echo ">>> Per abilitare HTTPS (richiede un hostname pubblico reale, risolvibile via DNS e raggiungibile su porta 80): ./scripts/enable-tls.sh ${SLUG} --email <tua-email>"

cat <<SUMMARY

>>> Workspace '${SLUG}' provisioned.

  Hostname:          ${HOSTNAME_ARG}
  Ports (host):      admin ${P_ADMIN}  core-api ${P_CORE}  asset-processor ${P_ASSET}  gateway ${P_GATEWAY}  whoobe-one ${P_WHOOBE_ONE}  postgres ${P_POSTGRES}  minio ${P_MINIO_API}/${P_MINIO_CONSOLE}
  Seed admin login:  ${SEED_EMAIL} / ${SEED_PASSWORD}
  Env file:          ${ENV_FILE}  (back this up - it holds this workspace's only credentials)
  Nginx config:      deploy/nginx/${SLUG}.conf
  Reverse proxy:     ${PROXY_NOTE}
  Compose project:   ws-${SLUG}  (docker compose -p ws-${SLUG} --env-file ${ENV_FILE} ...)

SUMMARY
