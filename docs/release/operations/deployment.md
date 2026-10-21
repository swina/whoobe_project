# Oracle Free Tier Deployment Guide

> **Status of this guide (2026-10-09).** It describes a **bare-metal installation** (PostgreSQL, the object store and the Node
> services installed on the VM, run by PM2). The path that is tested and used for releases is the **container
> workspace** in [`creating-workspaces.md`](creating-workspaces.md) (Docker Compose, Node 22 images, Garage, hardened
> defaults, generated secrets, encrypted backups). This page has **not been re-verified for 0.1.0**: in particular it
> installs Node 20 (the images use Node 22), does not set the new
> secrets (`MAIL_SETTINGS_ENCRYPTION_KEY`, `TOTP_ENCRYPTION_KEY`, `UPLOAD_TOKEN_SECRET`; see the
> [configuration reference](configuration-reference.md)) and starts services outside Compose, where a missing `DB_PASSWORD` now stops the service at start (F-057). Use it only if Docker is not an option, and set every
> variable of the configuration reference explicitly.

Deploy Whoobe on an **Oracle Cloud Infrastructure (OCI) Always Free Tier** VM. This guide covers a single-VM deployment running all services behind nginx with Let's Encrypt SSL.

## Oracle Free Tier Resources

| Resource | Allocation (Always Free) |
|---|---|
| **Ampere A1 ARM** | Up to 4 OCPUs / 24 GB memory (across up to 4 instances) |
| **Block volume** | 200 GB total (boot + attached) |
| **Object storage** | 10 GB (Garage on the VM or OCI Object Storage) |
| **Bandwidth** | 10 TB/month outbound |
| **Load balancer** | 1 instance (10 Mbps) |

**Recommendation:** A single **Ampere A1.4** VM (4 OCPU, 24 GB) for production, or split into A1.2 (12 GB) + a smaller AMD instance.

---

## 1. Provision the VM

1. Sign in to [OCI Console](https://cloud.oracle.com).
2. **Compute → Instances → Create Instance.**
   - Image: **Canonical Ubuntu 24.04 LTS** (ARM64)
   - Shape: **VM.Standard.A1.Flex** — set OCPUs to 2–4, memory to 12–24 GB
   - Add your SSH public key
3. Open inbound ports in the **VCN security list** (or `iptables`):
   - `22` SSH
   - `80`, `443` HTTP/HTTPS
4. (Optional) Reserve and attach a **public IP** to the instance so it persists across reboots.

## 2. Install Dependencies

```bash
# Node.js 18+ (ARM64)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# pnpm
sudo npm install -g pnpm@9

# PostgreSQL 16
sudo apt-get install -y postgresql-16

# nginx + certbot (Let's Encrypt)
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Sharp dependencies (libvips)
sudo apt-get install -y build-essential libvips-dev

# PM2 (process manager)
sudo npm install -g pm2

# Git
sudo apt-get install -y git
```

## 3. Configure PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE USER whoobe WITH PASSWORD 'your_strong_password';
CREATE DATABASE whoobe_db OWNER whoobe;
GRANT ALL PRIVILEGES ON DATABASE whoobe_db TO whoobe;
\q
```

Allow local password auth — edit `/etc/postgresql/16/main/pg_hba.conf`:

```
local   all   whoobe   md5
host    all   whoobe   127.0.0.1/32   md5
```

Restart:

```bash
sudo systemctl restart postgresql
sudo systemctl enable postgresql
```

## 4. Object storage (Garage on the VM, or OCI Object Storage)

Two supported choices (MinIO was removed from the project, F-048/F-050). Both end in the same five variables in `.env`
(`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, plus `S3_FORCE_PATH_STYLE=true`);
see also [storage-backends.md](storage-backends.md).

### Option A: Garage as a native service (single node)

Garage is one static binary. Same version and layout as the Docker stack (`docker/garage`), bound to loopback only.

```bash
# binary (arm64 build for the Ampere VM; use x86_64-unknown-linux-musl on x86). Compare the checksum with the one
# you trust: sha256 seen on 2026-10-10 for v2.4.1 arm64 = 004b6081c6e3cccbb80317c69e3c5749fbb3fc889e217cc9b89c215bf0dd7ded
wget https://garagehq.deuxfleurs.fr/_releases/v2.4.1/aarch64-unknown-linux-musl/garage
sha256sum garage && chmod +x garage && sudo mv garage /usr/local/bin/
sudo useradd -r -s /usr/sbin/nologin garage
sudo mkdir -p /var/lib/garage/meta /var/lib/garage/data && sudo chown -R garage:garage /var/lib/garage
```

`/etc/garage.toml` (readable by the `garage` user only, it contains the RPC secret: `openssl rand -hex 32`):

```toml
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "lmdb"
replication_factor = 1
rpc_bind_addr = "127.0.0.1:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "<64 hex characters>"

[s3_api]
s3_region = "us-east-1"
api_bind_addr = "127.0.0.1:3900"
```

```bash
sudo chown garage:garage /etc/garage.toml && sudo chmod 600 /etc/garage.toml
sudo tee /etc/systemd/system/garage.service >/dev/null <<'UNIT'
[Unit]
Description=Garage S3
After=network.target

[Service]
User=garage
Group=garage
ExecStart=/usr/local/bin/garage -c /etc/garage.toml server
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/garage

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now garage
```

First-time setup (the Docker image does the same on every start): layout, access key, bucket. Garage's key format is `GK` + 24 hex for the id and 64 hex for the secret.

```bash
G="sudo -u garage garage -c /etc/garage.toml"
$G layout assign -z dc1 -c 100G "$($G node id -q | cut -d@ -f1)" && $G layout apply --version 1
AK="GK$(openssl rand -hex 12)"; SK="$(openssl rand -hex 32)"
$G key import --yes -n whoobe "$AK" "$SK"
$G bucket create whoobe-cms
$G bucket allow --read --write --owner whoobe-cms --key "$AK"
echo "S3_ACCESS_KEY_ID=$AK"; echo "S3_SECRET_ACCESS_KEY=$SK"     # put them in .env, then clear the shell history/scrollback
```

In `.env`: `S3_ENDPOINT=http://127.0.0.1:3900`, `S3_REGION=us-east-1` (the `s3_region` above), `S3_BUCKET=whoobe-cms`,
`S3_FORCE_PATH_STYLE=true`. The S3 port stays on loopback: browsers get assets through the asset-processor
(`/dam-asset/...`), so no CORS rule and no public bucket are needed. Garage does not support bucket policies; Whoobe skips them.
Back up `/var/lib/garage` (stop the service or use `garage meta snapshot`) together with the database dump.

### Option B: OCI Object Storage (or another cloud S3)

Nothing to run on the VM; durability and backups are the provider's.

1. Create a bucket `whoobe-cms` (private) in your compartment.
2. Create an OCI Customer Secret Key and use it as `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.
3. Set `S3_ENDPOINT` to `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com`, `S3_REGION` to your region and `S3_FORCE_PATH_STYLE=true`.

## 5. Clone & Build Whoobe

```bash
mkdir -p /opt/whoobe
cd /opt/whoobe
git clone <your-repo-url> cms
cd cms
pnpm install
pnpm build
```

## 6. Environment Configuration

Create `/opt/whoobe/cms/.env`:

```bash
WHOOBE_HOSTNAME=your-domain.com
DB_HOSTNAME=127.0.0.1
S3_ENDPOINT_HOSTNAME=127.0.0.1

# Postgres
POSTGRES_USER=whoobe
POSTGRES_PASSWORD=your_strong_password
POSTGRES_DB=whoobe_db

# Shared DB connection
DB_HOST=${DB_HOSTNAME}
DB_PORT=5432
DB_USER=whoobe
DB_PASSWORD=your_strong_password
DB_NAME=whoobe_db

# core-api
MIGRATION_SOURCE_ENCRYPTION_KEY=$(openssl rand -hex 32)

# S3 (Garage http://127.0.0.1:3900 or the OCI endpoint, see section 4)
S3_ENDPOINT=http://${S3_ENDPOINT_HOSTNAME}:9000
S3_BUCKET=whoobe-cms
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=<generated-access-key>
S3_SECRET_ACCESS_KEY=<generated-secret>
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=https://${WHOOBE_HOSTNAME}/dam-asset

# admin-dashboard (Vite)
VITE_ASSET_PROCESSOR_URL=https://${WHOOBE_HOSTNAME}
VITE_CORE_API_URL=https://${WHOOBE_HOSTNAME}
VITE_GATEWAY_URL=https://${WHOOBE_HOSTNAME}

# whoobe-one-spike
# Must match the nginx location it's proxied under (see the nginx config
# below) or its built JS/CSS chunks 404 - they resolve against the
# embedding page's origin (admin-dashboard's root) instead of their own.
VITE_BASE_URL=/whoobe-one/
VITE_FONT_FAMILIES=Alfa+Slab+One|Asap+Condensed|Abel|Alice|Alegreya|...
```

The database auto-creates and migrates on `core-api` startup — no manual migration needed.

## 7. Production Build & PM2

Create a startup script `/opt/whoobe/cms/start-production.sh`:

```bash
#!/usr/bin/env bash
cd /opt/whoobe/cms

export NODE_ENV=production

# Start asset-processor on port 3002
pnpm --filter @whoobe-cms/asset-processor start &

# Start core-api on port 3003
pnpm --filter @whoobe-cms/core-api start &

# Build and serve admin-dashboard on port 3000
pnpm --filter @whoobe-cms/admin-dashboard build
pnpm --filter @whoobe-cms/admin-dashboard preview --host 0.0.0.0 --port 3000 &

# Build and serve whoobe-one-spike on port 3006
pnpm --filter @whoobe-cms/whoobe-one-spike build
pnpm --filter @whoobe-cms/whoobe-one-spike preview --host 0.0.0.0 --port 3006 &

wait
```

> **Note:** The `admin-dashboard` Vite proxy config routes `/auth`, `/documents`, `/data-objects`, `/api/v1/dam`, `/whoobe-one`, etc. to the backend services. In production, nginx handles this (see below), so the Vite dev proxy is bypassed. If you serve the Vite preview apps directly without nginx, update `vite.config.ts` to remove the proxy (or set `server.proxy` to the nginx URL).

The preferred approach is using PM2 with an ecosystem file. Create `/opt/whoobe/cms/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: 'core-api',
      cwd: '/opt/whoobe/cms',
      script: 'pnpm',
      args: '--filter @whoobe-cms/core-api start',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'asset-processor',
      cwd: '/opt/whoobe/cms',
      script: 'pnpm',
      args: '--filter @whoobe-cms/asset-processor start',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'gateway',
      cwd: '/opt/whoobe/cms',
      script: 'pnpm',
      args: '--filter @whoobe-cms/gateway start',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'admin-dashboard',
      cwd: '/opt/whoobe/cms',
      script: 'pnpm',
      args: '--filter @whoobe-cms/admin-dashboard preview --host 0.0.0.0 --port 3000',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'whoobe-one-spike',
      cwd: '/opt/whoobe/cms',
      script: 'pnpm',
      args: '--filter @whoobe-cms/whoobe-one-spike preview --host 0.0.0.0 --port 3006',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

Start with PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow the on-screen instructions to enable on-boot
```

## 8. nginx Reverse Proxy (HTTP only — bootstrap)

Create the initial config without SSL (certificates don't exist yet).

Create `/etc/nginx/sites-available/whoobe`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Admin dashboard (Vue SPA)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # /whoobe-one API routes -> core-api (must be before the SPA catch-all)
    location ~ ^/whoobe-one/(websites|themes|pages|snippets|templates|kits|website-paths|search|settings|site-wizard|site-spec)(/.*)?$ {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Whoobe One editor (embedded in admin dashboard, direct access)
    # No trailing slash on proxy_pass - do NOT strip the /whoobe-one/
    # prefix here. vite preview is built with base: '/whoobe-one/' (see
    # VITE_BASE_URL above) and only serves correctly when it receives
    # requests with that full prefix intact.
    location /whoobe-one/ {
        proxy_pass http://127.0.0.1:3006;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # core-api routes
    location ~ ^/(auth|documents|snippets|data-classes|data-components|data-objects|mail-settings|mail-log|mail-templates|migration-sources|health|search|themes|public|ai|figma|preview|sites|pages|settings|workflows|users|roles)(/.*)?$ {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # gateway API routes (must come before the /api/v1/ block below -
    # nginx picks the longest matching prefix, but keeping the more
    # specific location first avoids any ambiguity)
    location /api/v1/gateway/ {
        proxy_pass http://127.0.0.1:3001/api/v1/gateway/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/remote/ {
        proxy_pass http://127.0.0.1:3001/api/remote/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # asset-processor API routes
    location /api/v1/ {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase body size for asset uploads
        client_max_body_size 100M;
    }

    # DAM public asset proxy
    location /dam-asset/ {
        proxy_pass http://127.0.0.1:3002/dam-asset/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Cache static assets
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/whoobe /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

> **Note:** This is a temporary HTTP-only config. The `server_name` must match your domain for certbot to work.

## 9. SSL with Let's Encrypt

```bash
sudo certbot --nginx -d your-domain.com
sudo systemctl enable certbot.timer   # auto-renewal
```

Certbot auto-adds the HTTPS server block and SSL certificate paths. After it completes, verify:

```bash
sudo nginx -t
```

## 10. Post-SSL: Add HTTPS server block manually (if certbot didn't)

If certbot didn't add the redirect + SSL block (depends on plugin version), add it now by editing `/etc/nginx/sites-available/whoobe` to insert before the HTTP server block:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # ---- copy all location blocks from the HTTP server above here ----
}
```

Then remove the `listen 80` (without redirect) from your existing HTTP server block. Reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 11. Firewall (Optional)

OCI security lists are the primary firewall. For an additional host-level firewall:

```bash
sudo apt-get install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Only nginx ports (80, 443) and SSH are exposed — all services listen on `127.0.0.1`.

## 12. Verify the Deployment

| Service | Internal URL | External URL |
|---|---|---|
| Admin dashboard | `http://127.0.0.1:3000` | `https://your-domain.com/` |
| Whoobe One editor | `http://127.0.0.1:3006` | `https://your-domain.com/whoobe-one/` |
| core-api | `http://127.0.0.1:3003` | `https://your-domain.com/{route}` |
| asset-processor | `http://127.0.0.1:3002` | `https://your-domain.com/api/v1/{route}` |
| DAM public assets | `http://127.0.0.1:3002/dam-asset/` | `https://your-domain.com/dam-asset/{path}` |

Check service logs:

```bash
pm2 logs core-api      # API logs
pm2 logs asset-processor  # Asset logs
pm2 monit              # Dashboard
```

## 13. Updating

```bash
cd /opt/whoobe/cms
git pull
pnpm install
pnpm build
pm2 restart ecosystem.config.cjs
```

## 14. Backup

For encrypted backups (and disk/volume encryption, TLS to Postgres, keys) see [encryption.md](encryption.md); `scripts/backup-workspace.sh` covers workspaces. The plain commands below leave the dump in clear text.

```bash
# Database
pg_dump -U whoobe whoobe_db | gzip > /backup/whoobe_db-$(date +%Y%m%d).sql.gz

# Object storage: Garage on the VM -> copy the bucket (rclone sync garage:whoobe-cms /backup/objects/) or snapshot /var/lib/garage;
# OCI / cloud S3 keeps its own durability

# Environment (keep a safe copy of .env)
cp /opt/whoobe/cms/.env /backup/
```

Set a cron job for automated daily DB backups:

```bash
0 3 * * * pg_dump -U whoobe whoobe_db | gzip > /backup/whoobe_db-$(date +\%Y\%m\%d).sql.gz && mc cp /backup/whoobe_db-*.sql.gz local/whoobe-cms/backups/
```

## 15. Performance Tips for Oracle ARM

- The **Ampere A1** chips are ARM64 — ensure all packages (Sharp, Postgres) have native ARM builds (they do as of 2024).
- Increase Node.js memory limit if needed: add `NODE_OPTIONS="--max-old-space-size=2048"` to the PM2 app env.
- PostgreSQL tuning for 4–12 GB RAM — edit `/etc/postgresql/16/main/postgresql.conf`:
  ```
  shared_buffers = 1GB          # 25% of available RAM
  work_mem = 64MB
  maintenance_work_mem = 256MB
  effective_cache_size = 3GB    # 75% of available RAM
  ```
- For high traffic, you can move Postgres to a separate free-tier VMs within the same VCN (private subnet).