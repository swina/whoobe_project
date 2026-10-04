# Creating a Workspace

A **workspace** is a fully independent Whoobe CMS install for one client: its own Postgres database, its own S3 store and bucket, its own core-api/asset-processor/gateway/admin-dashboard/whoobe-one-spike containers, its own users/roles/logins, and its own hostname. Nothing is shared between workspaces — see `docs/plans/system/workspaces-plan.md` for why this isolation model was chosen over a shared-database, `workspaceId`-scoped alternative.

This guide covers the day-to-day operation: provisioning a new workspace, verifying it, enabling HTTPS, and managing/removing one later. It assumes a host with Docker and Docker Compose. **nginx on the host is optional**: without it the scripts run one shared containerized reverse proxy (`whoobe-proxy`) for every workspace. Base host setup: `docs/deployment.md`.

## What a workspace gets (current deploy settings)

- **Object storage: Garage** (S3-compatible, `docker/garage`) inside the workspace's own Compose project. It creates its own access key and bucket on first start; nothing to set up by hand. Production-grade alternatives (AWS S3, OCI, an enterprise S3) are a configuration change: see [Using an external S3](#using-an-external-s3-instead-of-garage) and `docs/storage-backends.md`. Self-hosting MinIO is discouraged.
- **Reverse-proxy awareness**: the provisioning sets `TRUST_PROXY=1` (login lockout and rate limits see the real client address instead of `127.0.0.1`) and `ADMIN_PUBLIC_URL=https://<hostname>` (links in password-reset e-mails).
- **Loopback-only data and app ports**: Postgres and the S3 port are published on `127.0.0.1`, and so are the application ports (`WS_APP_BIND_ADDRESS=127.0.0.1`): only the reverse proxy reaches them.
- **Fresh secrets per workspace**: DB and S3 credentials, `MIGRATION_SOURCE_ENCRYPTION_KEY`, `GATEWAY_AUTH_ENCRYPTION_KEY`, `DAM_SERVICE_TOKEN`, `SITE_API_KEY_PEPPER`, `TOTP_ENCRYPTION_KEY` — none shared with another workspace or with dev's `.env`.
- **TLS policy** (when you enable HTTPS): TLS 1.2/1.3 only, forward-secret AEAD ciphers, HSTS for one year (F-049).

## Prerequisites

- Docker + the Compose plugin (`docker compose version`, v2.24.4 or newer — the compose files use `!override`/`!reset`).
- `openssl` on `PATH` (the provisioning script generates the secrets with it).
- For a publicly reachable workspace: the workspace's DNS hostname already pointed at this host, port 80 (and 443 for HTTPS) reachable.

## 1. The easy way: interactive script

```bash
./scripts/create-workspace.sh
```

It asks for the slug, the hostname and the seed admin e-mail/password (empty password = random), **picks the next free port index by itself** (scanning the existing `.env.*` files), runs the provisioning below, and finally offers to enable HTTPS (answer yes only for a real public domain already pointing at this host).

The rest of this section explains what it does, and how to run the steps by hand.

### Slug, hostname, index

| Value | Rules | Example |
|---|---|---|
| `slug` | lowercase letters/digits/hyphens only | `client-a` |
| `hostname` | the domain this workspace answers on (a plain host name, optionally `:port`) | `client-a.example.com` |
| `index` | a small positive integer, **unique per workspace on this host** (automatic with `create-workspace.sh`) | `1`, `2`, `3`, ... |

The `index` avoids port collisions: host ports are the usual dev ports plus `index * 10` (admin `3000`, gateway `3001`, asset-processor `3002`, core-api `3003`, whoobe-one `3006`, postgres `5432`, S3 `9000`). Index `1` gets admin on `3010`, core-api on `3013`, S3 on `9010`; index `2` gets `3020`/`3023`/`9020`, and so on. The scripts keep no registry: a workspace's index is whatever its `.env.<slug>` says (`WS_POSTGRES_PORT`), and provisioning refuses to overwrite an existing `.env.<slug>`.

### Provisioning by hand

```bash
./scripts/provision-workspace.sh <slug> <hostname> <index> [--seed-email you@example.com] [--seed-password ...]
```

Example:

```bash
./scripts/provision-workspace.sh client-a client-a.example.com 1
```

The seed password must be 8–128 characters from `A-Z a-z 0-9 . _ @ + = : , % -`; if omitted a random one is generated. The command:

1. Generates `.env.client-a` (mode 600) from `.env.example`: DB name/credentials, **S3 credentials in Garage's format** (`GK` + 24 hex, 64 hex secret), bucket `whoobe-cms-client-a`, `COMPOSE_PROFILES=local-s3`, `TRUST_PROXY`, `ADMIN_PUBLIC_URL`, the port block, the browser-facing URLs (`https://<hostname>`, path-routed by nginx) and the secrets listed above.
2. Builds and starts the Compose project `ws-client-a` from the repo's `docker-compose.yml`: Postgres, Garage, core-api, asset-processor, gateway, admin-dashboard, whoobe-one-spike, each isolated in its own network and volumes. core-api creates and migrates the schema on first boot.
3. Waits until Garage is healthy (it has created the key and the bucket by then).
4. Renders `deploy/nginx/_locations-client-a.inc` (the routing) and `deploy/nginx/client-a.conf` (HTTP vhost, with the ACME challenge path).
5. Wires the reverse proxy: with **no nginx on the host** it starts/reloads the shared `whoobe-proxy` container (host port 80, no manual step); **with nginx on the host** it prints the two commands to link the vhost (next section).

It ends with a summary — **save it**: the seed admin login (shown only here) and the note about backing up `.env.client-a` (the only copy of that workspace's credentials; losing it means losing access to its database and bucket, not just its admin login).

## 2. Wire up nginx (only if nginx is installed on the host)

```bash
sudo ln -sf "$(pwd)/deploy/nginx/client-a.conf" /etc/nginx/sites-enabled/client-a
sudo nginx -t && sudo systemctl reload nginx
```

With the containerized proxy nothing is needed.

## 3. Enable HTTPS

Needs a real public hostname resolving to this host with port 80 reachable (Let's Encrypt HTTP-01). `.local`, `localhost` and private addresses are refused.

```bash
./scripts/enable-tls.sh client-a --email you@example.com --staging   # trial run with Let's Encrypt's staging CA
./scripts/enable-tls.sh client-a --email you@example.com             # the real certificate
```

It issues the certificate, switches the HTTP vhost to a redirect (except the challenge path), renders `deploy/nginx/client-a-ssl.conf` from the hardened `workspace-ssl.conf.template` (TLS 1.2/1.3, AEAD ciphers, HSTS `max-age=31536000`) and reloads the proxy. **HSTS is a commitment**: browsers refuse plain HTTP for the host for a year after the first HTTPS visit, so try `--staging` first and make sure the hostname is final. Certificates last 90 days: run `./scripts/renew-certs.sh` periodically (cron).

## 4. Verify

- `docker compose -p ws-client-a --env-file .env.client-a ps` — every service `Up`/`healthy` (the `garage` service reports healthy once its bucket exists).
- `curl -I http(s)://client-a.example.com/` — the admin dashboard answers. After HTTPS: `Strict-Transport-Security` is in the response.
- Log in with the seed admin credentials from the summary and **change the password immediately**.
- Upload an asset in the admin and open it: it is served by the asset-processor at `/dam-asset/...` (the browser never talks to the S3 store).
- Isolation: create a page/asset in this workspace and check it does **not** appear in any other workspace or in the dev stack.
- Optional: from this repo, `pnpm security:tls` checks the TLS template and `pnpm security:images` scans the built images (they use the throwaway test stack, not your workspace).

## Managing an existing workspace

All commands target the workspace's own Compose project and env file:

```bash
docker compose -p ws-client-a --env-file .env.client-a ps
docker compose -p ws-client-a --env-file .env.client-a logs -f core-api
docker compose -p ws-client-a --env-file .env.client-a restart
docker compose -p ws-client-a --env-file .env.client-a down      # stop, keep data
```

To pick up a code change, rebuild and restart just that workspace:

```bash
docker compose -p ws-client-a --env-file .env.client-a up -d --build
```

## Using an external S3 instead of Garage

For production, an enterprise that already runs an S3 service, or any cloud S3, no local store is needed. Provisioning always starts Garage first; switch afterwards (or before first use) by editing `.env.client-a`:

```bash
COMPOSE_PROFILES=                                  # no local store
S3_CONTAINER_ENDPOINT=https://s3.eu-west-1.amazonaws.com
S3_REGION=eu-west-1
S3_BUCKET=whoobe-client-a                          # create it beforehand, private
S3_ACCESS_KEY_ID=...                               # a key limited to that bucket
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false                          # AWS; true for most self-hosted compatible stores
```

then stop the Garage containers (removing the profile does not stop them) and recreate the apps:

```bash
docker compose -p ws-client-a --env-file .env.client-a --profile local-s3 rm -sf garage garage-perms
docker compose -p ws-client-a --env-file .env.client-a up -d
```

The `garagedata` volume stays until `down -v`; copy any existing assets to the new bucket first (`rclone sync` / `aws s3 sync` between the two endpoints — keys, not endpoints, are stored in the database). Details and the MinIO overlay: `docs/storage-backends.md`.

## Workspaces created before the Garage default

Workspaces provisioned earlier (MinIO) keep working only if you tell Compose so: their `.env.<slug>` has old-format S3 credentials and `WS_MINIO_API_PORT`, and the current `docker-compose.yml` would start Garage, which refuses credentials that are not in its key format.

- **Stay on MinIO** (it is discouraged for production, see `docs/storage-backends.md`): rename `WS_MINIO_API_PORT` to `WS_S3_API_PORT`, add `COMPOSE_PROFILES=local-s3`, `TRUST_PROXY=1` and `ADMIN_PUBLIC_URL=https://<hostname>`, and use the overlay in every command: `docker compose -p ws-<slug> --env-file .env.<slug> -f docker-compose.yml -f docker-compose.minio.yml up -d --build`. The `miniodata` volume is reused.
- **Move to Garage**: copy the bucket out of MinIO first (`mc mirror` / `rclone sync`), generate Garage-format credentials (`GK$(openssl rand -hex 12)`, `$(openssl rand -hex 32)`), put them and the variables above in the env file, `up -d --build` without the overlay, then copy the data into the new bucket (the endpoint of the new store is `http://127.0.0.1:<WS_S3_API_PORT>`), and only then remove the old `miniodata` volume.
- A workspace that must be recreated from scratch (for example because secrets are rotated) is simplest: remove it (below) and run `create-workspace.sh` again.

## Removing a workspace

Destructive: it deletes the workspace's database and object storage. Have a backup (below) first.

```bash
./scripts/remove-workspace.sh client-a                 # asks you to type the slug; drops containers, volumes, vhosts (HTTP and HTTPS) and the env file
./scripts/remove-workspace.sh client-a --keep-volumes  # keeps the data volumes AND .env.client-a (their only credentials)
```

It also updates the reverse proxy: with the containerized proxy it reloads it; with host nginx it tells you to remove the symlink (`sudo rm /etc/nginx/sites-enabled/client-a`) and reload. Without `--keep-volumes` the env file is deleted too: back it up first if you may need it. The Let's Encrypt certificate files stay in `deploy/certbot/conf` (harmless; delete `live/<hostname>` and the matching `archive`/`renewal` entries if you want them gone).

## Backups

Per workspace, scoped to its Compose project. **Postgres**:

```bash
docker compose -p ws-client-a --env-file .env.client-a exec -T postgres \
  pg_dump -U "$(grep ^DB_USER= .env.client-a | cut -d= -f2)" "$(grep ^DB_NAME= .env.client-a | cut -d= -f2)" \
  | gzip > backup-client-a-$(date +%Y%m%d).sql.gz
```

**Assets** (Garage): the S3 port is published on loopback at `127.0.0.1:<WS_S3_API_PORT>`; use any S3 client with the workspace's key (`rclone sync`, `mc mirror`, `aws s3 sync s3://whoobe-cms-client-a ./assets-backup --endpoint-url http://127.0.0.1:9010`). Do not copy the `garagedata` volume while the container runs: its metadata database is not safe to copy live. With an external S3, use that provider's own backup/versioning.

Also back up `.env.client-a` itself — it is not derivable from anything else and holds the workspace's only copy of its DB/S3 credentials and encryption keys. Treat it as a secret (mode 600).

## Troubleshooting

- **Port already in use on `up`**: two workspaces were given the same `index`. Check the `.env.*` files for the claimed ports (`create-workspace.sh` avoids this automatically), then re-provision with a free index.
- **`garage` exits with "S3_ACCESS_KEY_ID must be 'GK' followed by 24 hex characters"**: the env file has credentials in another format (typically a workspace from before the Garage default, or a hand-edited one). See [Workspaces created before the Garage default](#workspaces-created-before-the-garage-default).
- **Admin dashboard loads but Gateway/DAM calls fail**: check that `deploy/nginx/<slug>.conf` was reloaded (`nginx -t` first) and that its ports match the ones in `.env.<slug>` — a stale config left over from a re-provision is the usual cause.
- **Everybody is locked out of login after a few failures / one user's mistakes block others**: the API sees all clients as the proxy's address; check `TRUST_PROXY=1` in `.env.<slug>` and that the vhost passes `X-Forwarded-For` (the shipped templates do).
- **Password-reset e-mails link to the wrong address**: set `ADMIN_PUBLIC_URL` in `.env.<slug>` and restart core-api.
- **Browser insists on HTTPS after a trial run**: HSTS was served for the host; clear it in the browser (`chrome://net-internals/#hsts`) or use another hostname for trials, and use `--staging` for certificate experiments.
- **`.env.<slug>` looks like a key got merged onto the previous line**: a bug of early versions (see `CHANGES.md`, 2026-09-22) caused by `.env.example` missing a trailing newline — make sure the script is newer than that fix.
