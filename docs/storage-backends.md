# Object storage backends

The asset-processor and core-api talk to any S3-compatible store through the AWS SDK (path-style by default). The
operations used are `PutObject`, `GetObject` (with ranges), `HeadObject`, `CopyObject`, `DeleteObject`,
`HeadBucket`/`CreateBucket`, presigned GET URLs and, optionally, `PutBucketPolicy`. Browsers never talk to the store:
assets are served through the asset-processor (`/dam-asset/...`), which enforces folder visibility.

Choose with environment variables only (`.env`):

| Backend | How | Notes |
|---|---|---|
| **MinIO** (default) | `docker compose up -d --build` | Built from source (`docker/minio/Dockerfile`, F-048); loopback-only ports. Upstream dependencies carry known CVEs (F-050). |
| **Garage** | `docker compose -f docker-compose.yml -f docker-compose.garage.yml up -d --build`, then `scripts/garage-init.sh` | Rust, official image (`dxflrs/garage`, pinned by digest), 0 fixable HIGH/CRITICAL in `trivy image`. No bucket policies (the provider detects `NotImplemented` and skips them; no effect because delivery is proxied). No web console. |
| **AWS S3 / other cloud or an existing enterprise store** | Point `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` at it; `S3_FORCE_PATH_STYLE=false` for AWS (true for most self-hosted stores). Do not start a local store (remove `minio` from the stack, or use the Garage overlay's pattern) | Create the bucket and an IAM user/key limited to it (Get/Put/Delete/List on the bucket) beforehand. Keep the bucket **private**: the app does not need public objects. AWS (not Garage) will accept the optional bucket policy. |

## Garage details

- Credentials must have Garage's shape: `S3_ACCESS_KEY_ID` = `GK` + 24 hex, `S3_SECRET_ACCESS_KEY` = 64 hex, plus
  `GARAGE_RPC_SECRET` (64 hex) and `GARAGE_ADMIN_TOKEN`. `scripts/security/gen-env.sh` generates all of them (and they are
  valid MinIO credentials too). `.env.example` shows the variables.
- `scripts/garage-init.sh [env-file] [project]` is idempotent: single-node layout, imports the key, creates the bucket and
  grants the key read/write/owner on it.
- Data lives in the `garagedata` volume (`/var/lib/garage`, owned by uid 10001 through the one-shot `garage-perms`).
- Test stack: `S3_BACKEND=garage scripts/security/stack.sh up` (same suites: API 1034, browser 8 pass on both backends).
- Migrating existing assets from MinIO: copy the bucket (`rclone sync` or `mc mirror` between the two endpoints) before
  switching `S3_ENDPOINT`; the database stores keys, not endpoints.
