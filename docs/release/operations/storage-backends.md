# Object storage

The asset-processor and core-api talk to any S3-compatible store through the AWS SDK (path-style by default). They use
`PutObject`, `GetObject` (with ranges), `HeadObject`, `CopyObject`, `DeleteObject`, `HeadBucket`/`CreateBucket` and presigned
GET URLs; `PutBucketPolicy` is optional (skipped on stores without it). Browsers never talk to the store: assets are served
through the asset-processor (`/dam-asset/...`), which enforces the folder visibility rules.

## Recommended setup

| Environment | Store | Why |
|---|---|---|
| localhost / LAN / CI | **Garage** (in the stack, default) | Same S3 behaviour as production for what Whoobe needs, nothing to install, creates its own bucket and key, small, official source and image, no known fixable CVEs in its image. Lets a developer or an enterprise team run an instance that is structurally the same as production. |
| production | **a cloud S3** (AWS S3, OCI Object Storage, or any S3-compatible service; only AWS S3 and Garage have been exercised in this repo's tests so far: run `pnpm security:api` against your provider's endpoint before relying on it) or the **enterprise's existing S3 service** | Only configuration changes (below). Managed durability, backups, IAM. |
| production, self-hosted | Garage (multi-node if you need replication) | Possible, but you operate it. |
| **not supported**: MinIO | | Removed in 0.1.0 (F-048/F-050): upstream stopped publishing container images and its pinned dependencies carry known vulnerabilities that cannot be fixed without forking. An existing MinIO still works as an *external* S3 endpoint (set `S3_ENDPOINT`, drop `local-s3` from `COMPOSE_PROFILES`), but the repository no longer builds or tests it. Plan to move the data to Garage or a cloud S3 (below). |

## Local / LAN: Garage (default)

Nothing to do besides the credentials in `.env`. Garage needs its own key format:

```bash
S3_ACCESS_KEY_ID=GK$(openssl rand -hex 12)        # "GK" + 24 hex
S3_SECRET_ACCESS_KEY=$(openssl rand -hex 32)      # 64 hex
COMPOSE_PROFILES=local-s3                          # (default in .env.example) starts the store
```

`docker compose up -d --build` starts `garage` (`docker/garage`: the official static binary plus an entrypoint). On every
start it makes sure the single-node layout, the access key and the bucket (`S3_BUCKET`) exist. Data lives in the
`garagedata` volume, owned by uid 10001 (handed over by the one-shot `garage-perms`). The S3 port is published on loopback
only (`WS_S3_API_PORT`, default 9000). `scripts/provision-workspace.sh` generates the credentials for each workspace.

**Data stack, separate from the SPAs and the apps** (databases and storage on one machine, apps elsewhere or on the host):

```bash
docker compose -f docker-compose.data.yml up -d --build        # Postgres + Garage only
# the apps then use DB_HOST / S3_ENDPOINT=http://<data-host>:9000 (WS_DATA_BIND_ADDRESS=0.0.0.0 to open the data ports to the LAN,
# with strong secrets and a firewall)
```

`docker-compose.apps.yml` runs only the application services against such an external data stack.

## Production: any S3 by configuration

1. Create a **private** bucket and a key limited to it (Get/Put/Delete/List on that bucket).
2. In the env file remove `local-s3` from `COMPOSE_PROFILES` (no local store is started) and set:

```bash
COMPOSE_PROFILES=
S3_CONTAINER_ENDPOINT=https://s3.eu-west-1.amazonaws.com   # what the containers call (S3_ENDPOINT is for processes on the host)
S3_REGION=eu-west-1
S3_BUCKET=whoobe-prod
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false        # AWS: false; most self-hosted/compatible stores: true
```

3. If the provider supports bucket policies Whoobe may set a selective public-read policy for the paths its visibility rules
   mark as public; it is not needed (delivery is proxied) and failures are only warnings.
4. Check with `GET /health` of the asset-processor and an upload from the admin.

## Switching stores

Copy the bucket (`rclone sync`, `mc mirror`, `aws s3 sync` between the two endpoints), then change the endpoint/credentials.
The database stores object keys, not endpoints. Test with `scripts/security/stack.sh up` (the API and browser suites run on Garage) before touching production.
