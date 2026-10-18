# Capacity, scaling and availability

What one workspace can be expected to do, which parts of the services keep state in process memory (and therefore
limit you to one instance), where the bottlenecks are, and what has to change to run more than one replica. One load test has been
run (section 2.1, a development machine, four endpoints, small data); the other figures are derived from the code and
the reference installation, not measured throughput.

## 1. Reference installation

The release was installed and exercised on a single arm64 VM (Oracle Always Free Ampere A1, up to 4 OCPU / 24 GB), one
workspace, nginx on the host, Garage as the object store. The public sandbox runs the whole stack inside these container
limits (`docker-compose.sandbox.yml`), which is the smallest configuration that has been operated:

| Container | Memory | CPU |
|---|---|---|
| core-api | 768 MB | 1.0 |
| asset-processor | 1 GB (image decoding with sharp) | 1.0 |
| gateway | 384 MB | 0.5 |
| admin-dashboard, editor (nginx) | 256 MB each | 0.5 each |
| postgres | 512 MB | 1.0 |
| garage | 512 MB | 1.0 |

That is about 3.7 GB of memory for a small, low-traffic workspace with capped assets. A production workspace with real
traffic, large images or the page generators needs more; plan from the table below and **measure**.

## 2. Where the load goes

| Work | Cost driver | Notes |
|---|---|---|
| Every authenticated request | 3 database queries (session + user, `last_seen` update, effective permissions) | no session cache; the `sessions` table is written on every request |
| Public read API | published content filtered in application code, per-address limits (3000 / min) | pages are small JSON trees; search runs on `search_documents`; published **static** sites do not call the API at all, SSR/ISR sites call it from one address |
| Image upload and transforms | sharp decoding, up to 100 MP per image, 50 MB per file | memory spikes in asset-processor; the main reason for its 1 GB |
| **Form upload bodies** | held in memory up to the website's limit (never above 25 MB) per concurrent upload | worst case about `25 MB × concurrent uploads`; limited by 30 bodies per address per minute |
| Website export / import | the whole bundle is built or parsed in core-api memory (the proxy allows 100 MB bodies) | run large imports off-peak |
| Site generation (`publish-site.sh`) | CPU and disk of the machine that runs it (Next/Nuxt build) | not part of the services |
| AI calls | upstream latency; 20 / minute per user | the provider is the limit |
| Gateway proxy | upstream latency, 30 s timeout, per-key rps limits | |
| Database connections | each backend opens a `pg` pool with the library default (10 connections) | 3 backends ≈ 30 connections against PostgreSQL's default `max_connections` of 100; replicas multiply this |

Starting point for a production workspace (to be confirmed by your own test): 2 vCPU / 4 GB for the three backends and
PostgreSQL together, plus disk for the assets; scale memory first (asset-processor), then CPU.

### 2.1 Measured, 2026-10-18 (`scripts/load/run.sh`)

A throwaway stack (postgres, garage, core-api, asset-processor, gateway) with the container limits of the sandbox profile
(core-api 768 MB / 1 CPU, gateway 384 MB / 0.5, postgres 512 MB / 1, garage 512 MB / 1), 500 published objects, one page of
40 blocks, one API client. k6 drives one endpoint at a time for 30 s with 20 virtual users (5 for the login):

| Scenario | Requests/s | Median | p95 | p99 | Failed |
|---|---|---|---|---|---|
| Public page (`GET /public/page/<slug>`) | 694 | 26 ms | 51 ms | 79 ms | 0 % |
| Public data query (`POST /public/data-objects/query`, 20 of 500 objects) | 335 | 56 ms | 92 ms | 117 ms | 0 % |
| API client read (`GET /client/v1/data/<class>?limit=20` through the gateway) | 121 | 174 ms | 273 ms | 329 ms | 0 % |
| Login (`POST /auth/login`, 5 users at once) | 2.6 | 1.95 s | 2.3 s | 2.6 s | 0 % |

Peak CPU while each ran (100 % = one CPU): core-api 100 % (its limit) with about 250 MB of memory, gateway 50 % (its limit of half a CPU) with
about 150 MB, postgres 61 %, garage 2 %.

What it says: **the services, not the database, are the first limit**: core-api uses its whole CPU on public pages and queries, and the
gateway uses its whole half-CPU on client reads, so those are the two to give more CPU first. A login takes about two seconds of CPU
(password hashing), so a few people logging in at the same moment queue; it is not a throughput concern for editors.

What it does **not** say: it ran on an x86-64 development machine (20 CPUs, WSL2) with the load generator on the same machine; the
reference arm64 VM has slower cores, so expect fewer requests per second there. The per-address request limits of core-api were switched
off for the run (a single address would hit them at once), and the API client had the highest limit allowed (1000 requests/s). Not
measured: image upload and transforms, form uploads, AI, publishing, a mix of endpoints, runs longer than a minute, more than one replica,
a larger database. Run `scripts/load/run.sh --vus 50 --duration 60s` (or `--limits none`) on your own machine, and the same k6 script
(`scripts/load/load.js`) against your real configuration.

## 3. State that lives in process memory

These make a service **per-process**: with two replicas each keeps its own copy, which changes behaviour (not data):

| In memory | Service | Effect with more than one replica or after a restart |
|---|---|---|
| Login failure counters (5 per address+e-mail, 25 per e-mail, 15-minute lock) | core-api | the lockout threshold multiplies by the number of replicas; a restart clears locks |
| **Pending MFA challenges** (`mfaToken`) | core-api | a login that reaches replica A for the password step and replica B for the code step **fails**; a restart cancels logins in progress |
| MFA code failure locks, used TOTP codes (replay guard), forgot-password counters | core-api | replay protection and limits are per replica |
| Rate limiters: public, search, query, form submit, upload approval, PWA subscribe, AI | core-api | per-replica counts |
| Upload body limiter | asset-processor | per replica |
| Gateway per-key rate limit (sliding window) | gateway | per replica; `GATEWAY_RATE_LIMIT_BACKEND=redis` is accepted but **not implemented** (falls back to memory) |
| Authored-notify and authored-upload-field caches (30 s), site-root cache | core-api | a page published on A is seen by B within 30 s |
| Form-notify recipient throttle (3 mails / hour) | core-api | per replica |
| Mail-provider and preset files watched in memory | core-api, gateway | consistent if the files are the same |

What is **not** in memory: sessions (database), users and permissions (database), all content, upload tickets (signed,
stateless), upload rows (database). So a second replica does not need sticky sessions for normal use; only the MFA
challenge needs the same replica for both steps.

Other single-instance behaviours:

- **Migrations run at start in core-api with no lock.** Start one core-api first; the compose file makes the others wait.
- **Timers**: the clean-up of unused form uploads runs in every asset-processor replica (idempotent).
- **Startup tasks** (admin seed, role seed, backfills) run in every core-api start and are idempotent.

## 4. What it takes to run more than one replica

Not supported today; the work, in order of importance:

1. Move the pending MFA challenges, login/MFA/forgot-password counters and the public/upload/form limiters to a shared
   store (the sessions table or Redis), or put them behind a sticky proxy rule.
2. Implement the Redis backend of the gateway limiter that the configuration already names.
3. Take a PostgreSQL advisory lock around the migration step (or run migrations as a separate job).
4. Size PostgreSQL connections (`pool max`) for the replicas, or add a pooler (PgBouncer).
5. Shared `LOG_DIR` is not needed (logs go to stdout and the DAM); the object store is already shared.
6. Test the whole thing: there is no multi-replica test.

## 5. Availability

- **No high availability.** One container per service per workspace; Compose `restart: unless-stopped` brings a crashed
  process back in seconds; the proxy returns 502 meanwhile. Planned downtime: an update recreates the containers.
- A database outage makes every API route fail (health stays green, see [observability](observability-and-logging.md)).
- Published static sites keep serving from their own hosting while the CMS is down; sites rendered on a server or
  incrementally regenerated show stale content or errors depending on their cache settings.
- For a managed-database setup point `DB_HOST` at it with `DB_SSL=verify-full`; the application tolerates the database
  restarting (the pool reconnects) but in-flight requests fail.

## 6. Limits that are enforced

| Limit | Value | Where |
|---|---|---|
| Request body | 100 MB (`WS_MAX_BODY`) | nginx |
| JSON body | 50 MB (1 MB in the sandbox) | core-api, asset-processor |
| Asset file | 50 MB (`ASSET_MAX_FILE_BYTES`) | asset-processor |
| Image pixels | 100 MP (`ASSET_MAX_INPUT_PIXELS`) | asset-processor |
| Assets in the library | unlimited unless `ASSET_MAX_COUNT` | asset-processor |
| Form upload | per website, at most 25 MB, 10 files, 1 GB a day | core-api, asset-processor |
| Per-address request limits | see [configuration reference](configuration-reference.md) section 5 | core-api, asset-processor, gateway |

## 7. Questions to ask before sizing a customer

Expected visitors per day and whether the sites are static, server-rendered or API-driven; number of editors working at
the same time; total asset volume and the largest images; whether form uploads and AI are on; the required RPO/RTO
([backup](backup-restore-and-dr.md)); whether a managed PostgreSQL is available. A load test against the real
configuration (public API, login, image upload, form upload) is the recommended gate before a launch: the script covers the first two, not the uploads.
