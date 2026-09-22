# Creating a Workspace

A **workspace** is a fully independent Whoobe CMS install for one client: its own Postgres database, its own MinIO bucket, its own core-api/asset-processor/gateway/admin-dashboard/whoobe-one-spike containers, its own users/roles/logins, and its own hostname. Nothing is shared between workspaces — see `docs/plans/system/workspaces-plan.md` for why this isolation model was chosen over a shared-database, `workspaceId`-scoped alternative.

This guide covers the day-to-day operation: provisioning a new workspace, verifying it, and managing/removing one later. It assumes a host with Docker, Docker Compose, and (for production) nginx already installed — see `docs/deployment.md` for base host setup.

## Prerequisites

- Docker + the Compose plugin (`docker compose version`).
- `openssl` on `PATH` (the provisioning script uses it to generate per-workspace secrets).
- For a publicly reachable workspace: the workspace's DNS hostname already pointed at this host, and nginx installed.

## 1. Pick a slug, hostname, and index

| Value | Rules | Example |
|---|---|---|
| `slug` | lowercase letters/digits/hyphens only | `client-a` |
| `hostname` | the public domain this workspace will answer on | `client-a.example.com` |
| `index` | a small positive integer, **unique per workspace on this host** | `1`, `2`, `3`, ... |

The `index` isn't cosmetic — it's how port collisions between workspaces are avoided. Ports for a workspace are `index * 10` added to the usual dev ports (admin `3000`, gateway `3001`, asset-processor `3002`, core-api `3003`, whoobe-one `3006`, postgres `5432`, MinIO `9000`/`9001`). Workspace index `1` gets admin on `3010`, core-api on `3013`, etc.; index `2` gets `3020`/`3023`, and so on. **Keep a running list of which index belongs to which workspace** — the script has no registry of its own, it just refuses to overwrite an existing `.env.<slug>`.

## 2. Provision it

```bash
./scripts/provision-workspace.sh <slug> <hostname> <index> [--seed-email you@example.com] [--seed-password ...]
```

Example:

```bash
./scripts/provision-workspace.sh client-a client-a.example.com 1
```

This single command:

1. Generates `.env.client-a` from `.env.example`, with a unique DB name/credentials, S3 bucket/credentials, port block, and freshly generated `MIGRATION_SOURCE_ENCRYPTION_KEY` / `GATEWAY_AUTH_ENCRYPTION_KEY` / `DAM_SERVICE_TOKEN` — none of it shared with any other workspace or with dev's own `.env`.
2. Builds and starts a dedicated Compose project, `ws-client-a`, from the repo's own `docker-compose.yml` — Postgres, MinIO, core-api, asset-processor, gateway, admin-dashboard, whoobe-one-spike, all isolated in their own network and volumes.
3. Waits for MinIO to come up and creates the workspace's bucket.
4. Renders `deploy/nginx/client-a.conf` from `deploy/nginx/workspace.conf.template`.

It prints a summary at the end — **save it**, especially the seed admin login and the note about backing up `.env.client-a` (it's the only copy of that workspace's credentials; losing it means losing access to its database and asset bucket, not just its admin login).

If you re-run the command for a slug that's already provisioned, it refuses and exits rather than overwriting `.env.<slug>` — delete that file first if you genuinely want to start over (see [Removing a workspace](#removing-a-workspace)).

## 3. Wire up nginx

```bash
sudo ln -s "$(pwd)/deploy/nginx/client-a.conf" /etc/nginx/sites-enabled/client-a
sudo nginx -t && sudo systemctl reload nginx
```

Then add HTTPS the same way as the base install (`docs/deployment.md` §9–10):

```bash
sudo certbot --nginx -d client-a.example.com
```

## 4. Verify

- `docker compose -p ws-client-a ps` — all services should be `Up`/`healthy`.
- `curl -I https://client-a.example.com/` — admin dashboard responds.
- Log in with the seed admin credentials from the provisioning summary, and change that password immediately.
- Confirm isolation: create a page/asset in this workspace, then check it does **not** appear in any other workspace's admin dashboard (or in the default dev stack).

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

## Removing a workspace

This is destructive — it deletes the workspace's database and asset storage. Confirm you actually want this (and have a backup, see below) before running it.

```bash
docker compose -p ws-client-a --env-file .env.client-a down -v   # -v also drops pgdata/miniodata volumes
sudo rm /etc/nginx/sites-enabled/client-a
sudo systemctl reload nginx
rm .env.client-a deploy/nginx/client-a.conf
```

## Backups

Each workspace's Postgres and MinIO are containers local to that workspace's Compose project — back them up the same way as the single-tenant guide (`docs/deployment.md` §14), just scoped to that project:

```bash
docker compose -p ws-client-a --env-file .env.client-a exec -T postgres \
  pg_dump -U "$(grep ^DB_USER= .env.client-a | cut -d= -f2)" "$(grep ^DB_NAME= .env.client-a | cut -d= -f2)" \
  | gzip > backup-client-a-$(date +%Y%m%d).sql.gz
```

Also back up `.env.client-a` itself — it's not derivable from anything else and holds the workspace's only copy of its DB/S3 credentials and encryption keys.

## Troubleshooting

- **Port already in use on `up`**: two workspaces were given the same `index`. Check `deploy/nginx/*.conf` and the `.env.*` files for the port already claimed, then re-provision with a free index.
- **Admin dashboard loads but Gateway/DAM calls fail**: check that `deploy/nginx/<slug>.conf` was actually reloaded (`nginx -t` first) and that its ports match the ones in `.env.<slug>` — a stale nginx config left over from before a re-provision is the usual cause.
- **`.env.<slug>` looks like a key got merged onto the previous line**: this was a real bug in early versions of the template/script (see `CHANGES.md`, 2026-09-22) caused by `.env.example` missing a trailing newline — make sure you're on a version of the script after that fix.
