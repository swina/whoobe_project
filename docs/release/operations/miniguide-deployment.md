# Whoobe CMS — Deployment Miniguide

Three distinct deployment scenarios, each with different trade-offs:

| Concern | Evaluation / Demo | Local Development | Production |
|---|---|---|---|
| Goal | Try the software, no install | Write code with HMR | Serve real users |
| DB + S3 | Docker containers | Docker containers | Native services on VM |
| App services | Docker containers (nginx serving built SPA) | Local Node processes (Vite dev server with HMR) | Local Node processes (Vite preview or PM2) |
| Build | Inside Docker multi-stage | Local `pnpm build` (or `--build` flag) | Local `pnpm build` |
| nginx | Built into app containers (SPA fallback only) | Not needed (apps bind directly to ports) | Full reverse proxy with SSL termination |
| TLS/SSL | None (HTTP) | None (HTTP) | Let's Encrypt via nginx |
| Frontend served via | nginx inside container | Vite dev server (HMR) | Vite preview or nginx |
| Auto-migration | Yes, on core-api startup | Yes, on core-api startup | Yes, on core-api startup |
| Seed data | Yes (admin user, default website, kits) | Yes | Yes |
| Process manager | Docker restart policies | No (terminal foreground) | PM2 with auto-restart |
| File change detection | Requires rebuild | Instant (Vite HMR + tsx watch) | Requires rebuild + restart |
| URL config | Hardcoded in docker-compose env | `.env` + `--hostname` flag | `.env` + nginx |
| Whoobe One API routing | Direct port 3006 | Direct port 3006 | nginx reverse proxy |

---

## Scenario 1 — Evaluation / Testing (Full Docker)

Good for: **demo, QA, CI, or anyone who wants to try the CMS without installing Node.js locally.**

Single command gets you a running stack with Postgres, Garage (S3), all app servers, and SPAs served via nginx.

```bash
git clone https://github.com/swina/whoobe_cms
cd whoobe_cms
docker compose up -d --build
```

Set the credentials in `.env` first (copy `.env.example`; `S3_ACCESS_KEY_ID=GK$(openssl rand -hex 12)`, `S3_SECRET_ACCESS_KEY=$(openssl rand -hex 32)`). The S3 store (Garage) creates its own key and bucket on first start: no manual bucket setup. Object storage options (MinIO, AWS S3, enterprise S3): `docs/release/operations/storage-backends.md`.

**What happens internally:**
1. `Dockerfile` multi-stage build: installs all deps, compiles TypeScript, builds Vite SPAs
2. `postgres:16-alpine` starts, healthcheck waits for `pg_isready`
3. the `whoobe-garage` image (`docker/garage`) starts, creates its single-node layout, access key and bucket, and reports healthy
4. `core-api` starts, creates DB + applies all Drizzle migrations + seeds admin user + default data
5. `asset-processor` starts, connects to Postgres + Garage
6. `admin-dashboard` starts nginx serving the pre-built SPA on port `3000`
7. `whoobe-one-spike` starts nginx serving the pre-built SPA on port `3006`

| Service | URL | Credentials |
|---|---|---|
| Admin dashboard | http://localhost:3000 | admin@example.com / admin123 |
| S3 API (loopback only) | http://127.0.0.1:9000 | the `S3_*` values of `.env` |
| core-api | http://localhost:3003 | — |
| asset-processor | http://localhost:3002 | — |
| whoobe-one-spike | http://localhost:3006 | — |

**Key characteristics:**
- Vite frontends are **pre-built** at image build time. `VITE_CORE_API_URL` and `VITE_ASSET_PROCESSOR_URL` are baked in via `--build-arg`. To change them, rebuild the images.
- No HMR: edit code → rebuild image → restart container.
- DB_HOST and S3_ENDPOINT are overridden to Docker service names (`postgres`, `garage`; `S3_CONTAINER_ENDPOINT` for an external S3) via compose env.
- Postgres data persists in named volume `pgdata`, object data in `garagedata`.

---

## Scenario 2 — Local Development (Dockerized Data + Local Apps)

Good for: **writing code, hot-reload, debugging.**

Postgres and Garage (S3) run in Docker. App servers run directly on your host with Vite dev servers (HMR) and `tsx` watch mode.

```bash
# 1. Clone and install
git clone https://github.com/swina/whoobe_cms
cd whoobe_cms
pnpm install

# 2. Start infrastructure only
docker compose -f docker-compose.data.yml up -d

# 3. (nothing to do: Garage creates its key and bucket on first start)

# 4. Start all dev servers
./dev-cms.sh --build
```

| Service | URL | Notes |
|---|---|---|
| admin-dashboard | http://localhost:3000 | Vite dev server + HMR |
| core-api | http://localhost:3003 | tsx watch, restarts on file change |
| asset-processor | http://localhost:3002 | tsx watch, restarts on file change |
| whoobe-one-spike | http://localhost:3006 | Vite dev server + HMR |

**Key differences from full Docker:**
- **Infra only**: `docker-compose.data.yml` has Postgres + Garage (it can run on its own, e.g. on another machine of the LAN; no SPA, no apps); all app services are commented out.
- **Local Node processes**: Apps run directly on host. HMR works for Vue frontends; `tsx` auto-restarts for Express backends.
- **`.env` is read from repo root** — `DB_HOST=localhost`, `S3_ENDPOINT=http://localhost:9000` (same host, not Docker service names).
- **No nginx**: Each app binds directly to its port. No reverse proxy needed.
- **`./dev-cms.sh --build`** pre-builds `@whoobe-cms/core` and `@whoobe-cms/migration-tool` before starting apps (required because they import from `dist/`).
- **`--hostname` flag**: Override `VITE_CORE_API_URL` / `VITE_ASSET_PROCESSOR_URL` for multi-device access (e.g. `--hostname 192.168.1.50`). Session cookies are host-only + SameSite=Lax, so the hostname must match what the browser sees.

Run individual apps instead of all at once:

```bash
pnpm --filter @whoobe-cms/core-api dev
pnpm --filter @whoobe-cms/admin-dashboard dev
```

Stop everything:

```bash
./dev-cms.sh --stop
docker compose -f docker-compose.data.yml down
```

---

## Scenario 3 — Production Deployment

Good for: **real users, public internet, custom domain.**

All services run natively on a single VM (or separate VMs). Postgres and MinIO are installed as system services. App servers run under PM2. nginx terminates SSL and reverse-proxies to the apps.

Full production guide: [`docs/release/operations/deployment.md`](deployment.md) (Oracle Free Tier, 469 lines).

### Architecture

```
Internet → nginx:443 (Let's Encrypt SSL) → / → admin-dashboard:3000 (Vite preview)
                                         → /whoobe-one/* → whoobe-one-spike:3006 (Vite preview)
                                         → /auth|/pages|... → core-api:3003 (Express)
                                         → /api/v1/* → asset-processor:3002 (Express)
                                         → /dam-asset/* → asset-processor:3002
```

All backend services listen on `127.0.0.1` only — the public surface is solely nginx on ports 80/443.

### Key differences from dev/eval

| Aspect | Dev / Eval | Production |
|---|---|---|
| Postgres | Docker container | Native `postgresql-16` systemd service |
| MinIO | Docker container | Native binary, systemd service |
| App runtime | Docker / terminal | PM2 with auto-restart + `pm2 startup` |
| nginx | SPA fallback inside container | Full reverse proxy with SSL |
| TLS/SSL | None | Let's Encrypt certbot |
| Security | None | UFW, security headers, HTTPS redirect |
| Port exposure | All ports on 0.0.0.0 | Only 80/443 open; apps on 127.0.0.1 |
| DB credentials | `postgres / postgrespassword` | Strong unique password |
| S3 endpoint | `http://minio:9000` (Docker) or `http://localhost:9000` | `http://127.0.0.1:9000` or OCI Object Storage |
| S3_PUBLIC_BASE_URL | `http://localhost:3002/dam-asset` | `https://your-domain.com/dam-asset` |
| VITE_* URLs | `http://localhost:3003` etc. | `https://your-domain.com` (same domain, nginx routes) |
| CORS | Docker env `*` | `MINIO_API_CORS_ALLOW_ORIGIN=https://your-domain.com` |
| Backups | None | pg_dump cron + MinIO mirror |

### Quick-start steps

```bash
# 1. Provision VM (Ubuntu 24.04 ARM64 recommended), open ports 22, 80, 443
# 2. Install dependencies
sudo apt install -y nodejs postgresql-16 nginx certbot python3-certbot-nginx
sudo npm install -g pnpm@9 pm2

# 3. Install MinIO (or use OCI Object Storage)
wget https://dl.min.io/server/minio/release/linux-arm64/minio
sudo mv minio /usr/local/bin/
# Create systemd service (see docs/release/operations/deployment.md)

# 4. Configure PostgreSQL
sudo -u postgres psql -c "CREATE USER whoobe WITH PASSWORD 'strong_password';"
sudo -u postgres psql -c "CREATE DATABASE whoobe_db OWNER whoobe;"

# 5. Clone & build
git clone <repo> /opt/whoobe/cms
cd /opt/whoobe/cms
pnpm install
pnpm build

# 6. Create .env (see docs/release/operations/deployment.md for full template)
#    Key changes from dev .env:
#    - DB_HOST=127.0.0.1
#    - S3_ENDPOINT_HOSTNAME=127.0.0.1
#    - WHOOBE_HOSTNAME=your-domain.com
#    - VITE_CORE_API_URL=https://your-domain.com
#    - VITE_ASSET_PROCESSOR_URL=https://your-domain.com
#    - S3_PUBLIC_BASE_URL=https://your-domain.com/dam-asset
#    - Strong DB password, generate MIGRATION_SOURCE_ENCRYPTION_KEY

# 7. Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# 8. Configure nginx (see docs/release/operations/deployment.md for full config)
#    - Proxy / → admin-dashboard:3000
#    - Proxy /whoobe-one/* → whoobe-one-spike:3006
#    - Proxy /auth|/pages|... → core-api:3003
#    - Proxy /api/v1/* → asset-processor:3002
#    - Proxy /dam-asset/* → asset-processor:3002
#    - Set client_max_body_size 100M for asset uploads

# 9. SSL
sudo certbot --nginx -d your-domain.com

# 10. Firewall
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

### Updating

```bash
cd /opt/whoobe/cms
git pull
pnpm install
pnpm build
pm2 restart ecosystem.config.cjs
```

### Backups (cron)

```bash
0 3 * * * pg_dump -U whoobe whoobe_db | gzip > /backup/whoobe_db-$(date +\%Y\%m\%d).sql.gz
```

### Alternative: apps-only Docker in production

If you prefer containerized apps but native DB/S3, use `docker-compose.apps.yml`:

```bash
docker compose -f docker-compose.apps.yml up -d --build
```

This runs only the 4 app containers. Postgres and MinIO are expected to be running externally, configured via `.env` (DB_HOST, S3_ENDPOINT point to external services). Place these containers behind a host nginx for SSL.

---

## Comparison Matrix

| Feature | Eval (Docker) | Dev (Local) | Production (Native) |
|---|---|---|---|
| Setup time | 2 commands | 4 commands | ~30 min |
| HMR | No | Yes | No |
| Code→refresh cycle | `docker compose build` (slow) | Instant (save file) | `pnpm build` + `pm2 restart` (moderate) |
| Resource isolation | High (containers) | Medium (host processes) | Medium (systemd services) |
| Internet-ready | No (all ports exposed) | No (all ports exposed) | Yes (nginx + SSL) |
| Persistence | Named volumes | Named volumes | System directories + cron backups |
| Database management | Docker CLI | Docker CLI + local psql | `systemctl`, local psql, pg_dump |
| Scalability | Single host | Single host | Multi-VM possible (separate DB/S3) |
| Debuggability | Low (logs only) | High (devtools, HMR, breakpoints) | Medium (PM2 logs) |