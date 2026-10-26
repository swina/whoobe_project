#!/usr/bin/env bash
# Provision a new, fully isolated Whoobe workspace stack.
#
# Usage: ./scripts/provision-workspace.sh <slug> <hostname> <index> [--seed-email EMAIL] [--seed-password PASS] [--scheme http|https]
#                                         [--profile NAME] [--set KEY=VALUE ...]
#   --profile NAME  Append deploy/profiles/NAME.env to the workspace's env file (and install deploy/profiles/NAME.nginx-http.conf
#                   if there is one). Profile "sandbox" turns the workspace into the public sandbox
#                   (docs/release/operations/sandbox.md): limits, disabled features, hardened containers.
#   --image-version V  Run released images instead of building them: V is a version (0.3.0 or v0.3.0). The images are
#                   <prefix>-<service>:V (core-api, asset-processor, gateway, admin-dashboard, whoobe-one-spike) and are
#                   pulled when missing (or already loaded with docker load), nothing is built. Needs --image-prefix.
#   --image-prefix P   Where they are, e.g. ghcr.io/<owner>/whoobe or registry.internal/whoobe (the name before "-core-api").
#   --set KEY=VALUE Set or override one value in the env file after the profile (repeatable), e.g. --set ASSET_MAX_COUNT=100
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
#               9000), so two workspaces never collide - keep a note of
#               which index belongs to which workspace.
#
# What it does:
#   1. Generates .env.<slug> from .env.example, with workspace-specific
#      DB name, S3 bucket, ports, hostname, and freshly generated
#      secrets/credentials (nothing shared with any other workspace).
#   2. Brings up a dedicated Compose project (`ws-<slug>`) from the
#      shared docker-compose.yml - its own Postgres, Garage (S3), core-api,
#      asset-processor, gateway, admin-dashboard, whoobe-one-spike.
#      core-api creates/migrates its own database schema on first boot,
#      so there is no separate migration step (see docs/release/operations/deployment.md).
#   3. (Garage creates the workspace's S3 bucket and key by itself on first start.)
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
# URL scheme baked into the browser-facing URLs (the SPAs are built with them): `https` for a public host name
# (enable-tls.sh is expected to follow), `http` for local/LAN names (localhost, *.local, *.lan, single-label names,
# IP addresses, host:port) where no Let's Encrypt certificate can exist. Override with --scheme.
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
  echo "Usage: $0 <slug> <hostname> <index> [--seed-email EMAIL] [--seed-password PASS] [--scheme http|https] [--profile NAME] [--image-version V --image-prefix P] [--set KEY=VALUE ...]" >&2
  exit 1
}

[ $# -ge 3 ] || usage
SLUG="$1"
HOSTNAME_ARG="$2"
INDEX="$3"
shift 3

SEED_EMAIL="admin@example.com"
SCHEME=""
SEED_PASSWORD="$(openssl rand -hex 12)"
PROFILE=""
IMAGE_VERSION=""
IMAGE_PREFIX=""
SETS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --seed-email) SEED_EMAIL="$2"; shift 2 ;;
    --seed-password) SEED_PASSWORD="$2"; shift 2 ;;
    --scheme) SCHEME="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --image-version) IMAGE_VERSION="${2#v}"; shift 2 ;;
    --image-prefix) IMAGE_PREFIX="$2"; shift 2 ;;
    --set) SETS+=("$2"); shift 2 ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

[[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo "Error: slug must be lowercase letters/digits/hyphens only (got: $SLUG)" >&2; exit 1; }
[[ -z "$SCHEME" || "$SCHEME" =~ ^https?$ ]] || { echo "Error: --scheme must be http or https (got: $SCHEME)" >&2; exit 1; }
[[ -z "$PROFILE" || ( "$PROFILE" =~ ^[a-z0-9-]+$ && -f "deploy/profiles/${PROFILE}.env" ) ]] || { echo "Error: unknown profile '$PROFILE' (no deploy/profiles/${PROFILE}.env)" >&2; exit 1; }
[[ -z "$IMAGE_VERSION" || "$IMAGE_VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo "Error: --image-version must be a version or tag such as 0.3.0 (got: $IMAGE_VERSION)" >&2; exit 1; }
[[ -z "$IMAGE_PREFIX" || "$IMAGE_PREFIX" =~ ^[a-z0-9][a-z0-9._:/-]*$ ]] || { echo "Error: --image-prefix must be a lower case image path such as ghcr.io/owner/whoobe (got: $IMAGE_PREFIX)" >&2; exit 1; }
{ [ -z "$IMAGE_VERSION" ] && [ -z "$IMAGE_PREFIX" ]; } || { [ -n "$IMAGE_VERSION" ] && [ -n "$IMAGE_PREFIX" ]; } || { echo "Error: --image-version and --image-prefix go together" >&2; exit 1; }
SET_RE='^[A-Z][A-Z0-9_]*=[^|&\\$[:cntrl:]]*$'   # the value goes through sed and a compose env file: no | & \ $ or control characters
for kv in "${SETS[@]:-}"; do
  [ -z "$kv" ] || [[ "$kv" =~ $SET_RE ]] || { echo "Error: --set wants KEY=VALUE (upper case key; no | & \\ \$ or control characters in the value); got: $kv" >&2; exit 1; }
done
[[ "$INDEX" =~ ^[0-9]+$ ]] || { echo "Error: index must be a positive integer (got: $INDEX)" >&2; exit 1; }

# Every value below ends up in sed expressions, an env file and nginx configuration: refuse anything that could
# add a line, a directive or a shell/sed metacharacter instead of trying to escape it.
[[ "$HOSTNAME_ARG" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?$ ]] || { echo "Error: hostname must be a plain host name, optionally with a port (got: $HOSTNAME_ARG)" >&2; exit 1; }
if [ -z "$SCHEME" ]; then
  case "$HOSTNAME_ARG" in
    *:*|localhost|*.localhost|*.local|*.lan|*.internal|*.intranet|*.home.arpa|*.test|*.invalid|*.example) SCHEME=http ;;
    *[!0-9.]*) case "$HOSTNAME_ARG" in *.*) SCHEME=https ;; *) SCHEME=http ;; esac ;;   # dotted name: public; single label: local
    *) SCHEME=http ;;                                                                    # bare IP address
  esac
fi
[[ "$SEED_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || { echo "Error: invalid seed e-mail (got: $SEED_EMAIL)" >&2; exit 1; }
[[ "$SEED_PASSWORD" =~ ^[A-Za-z0-9._@+=:,%-]{8,128}$ ]] || { echo "Error: seed password must be 8-128 characters from A-Z a-z 0-9 . _ @ + = : , % - (no spaces, quotes, | & \\ \$ or #)" >&2; exit 1; }

DB_SAFE_SLUG="${SLUG//-/_}"
ENV_FILE=".env.${SLUG}"
PORT_OFFSET=$((INDEX * 10))

P_POSTGRES=$((5432 + PORT_OFFSET))
P_S3_API=$((9000 + PORT_OFFSET))
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
S3_KEY_ID="GK$(openssl rand -hex 12)"   # Garage key format (GK + 24 hex / 64 hex)
S3_SECRET="$(openssl rand -hex 32)"

set_env "ENV_FILE" "${ENV_FILE}"
set_env "WHOOBE_HOSTNAME" "${HOSTNAME_ARG}"
set_env "WHOOBE_WORKSPACE" "${SLUG}"
set_env "POSTGRES_USER" "whoobe_${DB_SAFE_SLUG}"
set_env "POSTGRES_PASSWORD" "${DB_PASSWORD}"
set_env "POSTGRES_DB" "whoobe_${DB_SAFE_SLUG}"
set_env "DB_USER" "whoobe_${DB_SAFE_SLUG}"
set_env "DB_PASSWORD" "${DB_PASSWORD}"
set_env "DB_NAME" "whoobe_${DB_SAFE_SLUG}"
set_env "MIGRATION_SOURCE_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
set_env "GATEWAY_AUTH_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
set_env "DAM_SERVICE_TOKEN" "$(openssl rand -hex 24)"
# password of the optional rate-limit store (compose profile `ratelimit`); the gateway uses it only when GATEWAY_RATE_LIMIT_BACKEND=redis
VALKEY_PW="$(openssl rand -hex 24)"
set_env "VALKEY_PASSWORD" "${VALKEY_PW}"
set_env "GATEWAY_REDIS_URL" "redis://:${VALKEY_PW}@valkey:6379"
# the example file carries placeholders for these: never ship a workspace with the shared defaults
set_env "SITE_API_KEY_PEPPER" "$(openssl rand -hex 32)"
set_env "TOTP_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
set_env "MAIL_SETTINGS_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
set_env "UPLOAD_TOKEN_SECRET" "$(openssl rand -hex 32)"
set_env "INTEGRATION_SECRETS_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
set_env "S3_ACCESS_KEY_ID" "${S3_KEY_ID}"
set_env "COMPOSE_PROFILES" "local-s3"
set_env "S3_SECRET_ACCESS_KEY" "${S3_SECRET}"
set_env "S3_BUCKET" "whoobe-cms-${SLUG}"
# Production convention (docs/release/operations/deployment.md): bare hostname, nginx
# path-routes to the right upstream - not the dev per-port form.
set_env "S3_PUBLIC_BASE_URL" "${SCHEME}://${HOSTNAME_ARG}/dam-asset"
set_env "VITE_ASSET_PROCESSOR_URL" "${SCHEME}://${HOSTNAME_ARG}"
set_env "VITE_CORE_API_URL" "${SCHEME}://${HOSTNAME_ARG}"
set_env "VITE_GATEWAY_URL" "${SCHEME}://${HOSTNAME_ARG}"
set_env "ASSET_PROCESSOR_URL" "${SCHEME}://${HOSTNAME_ARG}"
set_env "VITE_BASE_URL" "/whoobe-one/"
set_env "SEED_ADMIN_EMAIL" "${SEED_EMAIL}"
set_env "SEED_ADMIN_PASSWORD" "${SEED_PASSWORD}"
# the reverse proxy runs on this host (network_mode: host): the application ports need not be reachable from outside
# one reverse-proxy hop (nginx on this host) in front of the API and the gateway: without it every client looks like
# 127.0.0.1 to the login lockout and the rate limiters
set_env "TRUST_PROXY" "1"
# (DAM_ENFORCE_ASSET_VISIBILITY is on by default: private assets need a session, /public/** is public - F-024)
# link in password-reset e-mails (the admin is reached on the bare hostname, not on its per-port address)
set_env "ADMIN_PUBLIC_URL" "${SCHEME}://${HOSTNAME_ARG}"
set_env "WS_APP_BIND_ADDRESS" "127.0.0.1"
set_env "WS_DATA_BIND_ADDRESS" "127.0.0.1"
set_env "WS_POSTGRES_PORT" "${P_POSTGRES}"
set_env "WS_S3_API_PORT" "${P_S3_API}"
set_env "WS_ADMIN_DASHBOARD_PORT" "${P_ADMIN}"
set_env "WS_GATEWAY_PORT" "${P_GATEWAY}"
set_env "WS_ASSET_PROCESSOR_PORT" "${P_ASSET}"
set_env "WS_CORE_API_PORT" "${P_CORE}"
set_env "WS_WHOOBE_ONE_SPIKE_PORT" "${P_WHOOBE_ONE}"

if [ -n "$IMAGE_VERSION" ]; then
  set_env "WHOOBE_IMAGE_PREFIX" "${IMAGE_PREFIX}"
  set_env "WHOOBE_VERSION" "${IMAGE_VERSION}"
fi

# Profile and --set values go last, so they win over everything above.
if [ -n "$PROFILE" ]; then
  echo ">>> Applying profile '${PROFILE}' (deploy/profiles/${PROFILE}.env) ..."
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    set_env "${line%%=*}" "${line#*=}"
  done < "deploy/profiles/${PROFILE}.env"
fi
for kv in "${SETS[@]:-}"; do
  [ -z "$kv" ] || set_env "${kv%%=*}" "${kv#*=}"
done
get_env() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2-; }

echo ">>> Bringing up ws-${SLUG} ..."
if [ -n "$IMAGE_VERSION" ]; then
  echo ">>> Using released images ${IMAGE_PREFIX}-*:${IMAGE_VERSION} (pulled when missing, nothing built here; the garage image is built or loaded once, see docs/release/operations/private-network.md) ..."
  # the Garage image is not a release image: build it here when the host does not have it (it needs only the two base images; on a host with no access, docker load it)
  if [[ "$(get_env COMPOSE_PROFILES)" == *local-s3* ]] && ! docker image inspect whoobe-garage:v2.4.1 >/dev/null 2>&1; then
    docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" build garage
  fi
  docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" up -d --no-build
else
  docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" up -d --build
fi

# Garage (the S3 store of the stack) creates its own key and bucket on first start; wait until it reports healthy.
echo ">>> Waiting for the S3 store (bucket whoobe-cms-${SLUG}) ..."
for _ in $(seq 1 90); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose -p "ws-${SLUG}" --env-file "$ENV_FILE" ps -q garage)" 2>/dev/null)" = healthy ] && break
  sleep 2
done

# Detected once, up front, since it decides which literal filesystem
# paths get baked into the rendered vhost (host-nginx reads deploy/nginx
# directly off the host filesystem; the containerized proxy sees the same
# directory bind-mounted at /etc/nginx/conf.d - see docker-compose.proxy.yml).
HOST_NGINX=false
command -v nginx >/dev/null 2>&1 && HOST_NGINX=true

mkdir -p deploy/nginx deploy/certbot/webroot deploy/certbot/conf
# the host's nginx (www-data) serves the ACME challenge from the webroot: explicit modes, whatever the umask
chmod 755 deploy/certbot deploy/certbot/webroot
chmod 700 deploy/certbot/conf

if $HOST_NGINX; then
  CERTBOT_WEBROOT="$ROOT_DIR/deploy/certbot/webroot"
  LOCATIONS_INCLUDE="$ROOT_DIR/deploy/nginx/_locations-${SLUG}.inc"
else
  CERTBOT_WEBROOT="/var/www/certbot"
  LOCATIONS_INCLUDE="/etc/nginx/conf.d/_locations-${SLUG}.inc"
fi

if [ -n "$PROFILE" ] && [ -f "deploy/profiles/${PROFILE}.nginx-http.conf" ]; then
  # SANDBOX_UNTRACKED_IPS (space or comma separated addresses or CIDR ranges) fills the geo list of the sandbox's visit log
  UNTRACKED=""
  for a in ${SANDBOX_UNTRACKED_IPS//,/ }; do
    [[ "$a" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$|^[0-9a-fA-F:]*:[0-9a-fA-F:]*(/[0-9]{1,3})?$ ]] \
      || { echo "WARN: SANDBOX_UNTRACKED_IPS: not an address or CIDR range, left out: $a" >&2; continue; }
    UNTRACKED+="    $a 1;\\n"
  done
  sed "s|^    # @SANDBOX_UNTRACKED_IPS@$|${UNTRACKED:-    # (no SANDBOX_UNTRACKED_IPS)}|" \
    "deploy/profiles/${PROFILE}.nginx-http.conf" > "deploy/nginx/00-${PROFILE}-zones.conf"
fi

echo ">>> Rendering deploy/nginx/_locations-${SLUG}.inc ..."
sed \
  -e "s/__ADMIN_PORT__/${P_ADMIN}/g" \
  -e "s/__CORE_API_PORT__/${P_CORE}/g" \
  -e "s/__ASSET_PROCESSOR_PORT__/${P_ASSET}/g" \
  -e "s/__GATEWAY_PORT__/${P_GATEWAY}/g" \
  -e "s/__WHOOBE_ONE_PORT__/${P_WHOOBE_ONE}/g" \
  -e "s/__MAX_BODY__/$(get_env WS_MAX_BODY | grep . || echo 100M)/g" \
  -e "s|__EDGE_LIMITS__|$(get_env WS_EDGE_LIMITS)|g" \
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

  Hostname:          ${HOSTNAME_ARG}  (${SCHEME})
  Ports (host):      admin ${P_ADMIN}  core-api ${P_CORE}  asset-processor ${P_ASSET}  gateway ${P_GATEWAY}  whoobe-one ${P_WHOOBE_ONE}  postgres ${P_POSTGRES}  s3 ${P_S3_API}
  Seed admin login:  ${SEED_EMAIL} / ${SEED_PASSWORD}
  Env file:          ${ENV_FILE}  (back this up - it holds this workspace's only credentials)
  Nginx config:      deploy/nginx/${SLUG}.conf
  Reverse proxy:     ${PROXY_NOTE}
  Compose project:   ws-${SLUG}  (docker compose -p ws-${SLUG} --env-file ${ENV_FILE} ...)

SUMMARY
