# Oracle Free Tier Deployment Guide

Deploy Whoobe CMS on an **Oracle Cloud Infrastructure (OCI) Always Free Tier** VM. This guide covers a single-VM deployment running all services behind nginx with Let's Encrypt SSL.

## Oracle Free Tier Resources

| Resource | Allocation (Always Free) |
|---|---|
| **Ampere A1 ARM** | Up to 4 OCPUs / 24 GB memory (across up to 4 instances) |
| **Block volume** | 200 GB total (boot + attached) |
| **Object storage** | 10 GB (optionally replace MinIO) |
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

# MinIO (standalone binary)
wget https://dl.min.io/server/minio/release/linux-arm64/minio
chmod +x minio
sudo mv minio /usr/local/bin/

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

## 4. Configure MinIO

Create a systemd service `/etc/systemd/system/minio.service`:

```ini
[Unit]
Description=MinIO S3
After=network.target

[Service]
User=minio
Group=minio
ExecStart=/usr/local/bin/minio server /data --console-address ":9001"
Environment="MINIO_ROOT_USER=minioadmin"
Environment="MINIO_ROOT_PASSWORD=minioadminpassword"
Environment="MINIO_API_CORS_ALLOW_ORIGIN=https://your-domain.com"

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r minio
sudo mkdir -p /data && sudo chown minio:minio /data
sudo systemctl enable --now minio
```

Create the bucket:

```bash
# Install mc client
wget https://dl.min.io/client/mc/release/linux-arm64/mc
chmod +x mc && sudo mv mc /usr/local/bin/
mc alias set local http://127.0.0.1:9000 minioadmin minioadminpassword
mc mb local/whoobe-cms
mc anonymous set public local/whoobe-cms
```

> **Alternative — OCI Object Storage:** If you prefer using OCI native S3-compatible object storage instead of MinIO, set `S3_ENDPOINT` to `https://<namespace>.compat.objectstorage.<region>.oraclecloud.com` and configure an OCI Customer Secret Key as `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. CORS must be configured on the OCI bucket for your domain.

## 5. Clone & Build Whoobe CMS

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

# S3 / MinIO
S3_ENDPOINT=http://${S3_ENDPOINT_HOSTNAME}:9000
S3_BUCKET=whoobe-cms
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadminpassword
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
    location ~ ^/whoobe-one/(websites|themes|pages|snippets|templates|kits|website-paths|search)(/.*)?$ {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Whoobe One editor (embedded in admin dashboard, direct access)
    location /whoobe-one/ {
        proxy_pass http://127.0.0.1:3006/;
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

    # Whoobe Studio (legacy editor, optional)
    location /whoobe-studio/ {
        proxy_pass http://127.0.0.1:3004/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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

```bash
# Database
pg_dump -U whoobe whoobe_db | gzip > /backup/whoobe_db-$(date +%Y%m%d).sql.gz

# MinIO data (if not using OCI Object Storage)
mc mirror --watch local/whoobe-cms /backup/minio/

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
- If using MinIO on the same VM, consider limiting its memory with `--address ":9000" --console-address ":9001"` flags (no extra config needed).
- For high traffic, you can move Postgres or MinIO to separate free-tier VMs within the same VCN (private subnet).