# Configuration reference

Every environment variable the services, scripts and compose files read, by area. The file that holds them is one
env file per stack: `.env` in development, `.env.<slug>` for a workspace (written by `scripts/provision-workspace.sh`,
mode 600). Docker Compose passes it to the containers (`env_file`); shell-exported variables win over the file. The
commented template with explanations is [`.env.example`](../../../.env.example).

Conventions: **Secret** = never log, never commit, back up with the database ([secrets and keys](secrets-and-keys.md));
**Restart** = needs the service restarted (all of them are read at start unless a row says "read per request");
`unset` = the feature is off or the built-in default applies. The release gate `scripts/release/check-docs.py` fails
when a variable read by the services or listed in `.env.example` is missing from this page.

## 1. Identity of the installation

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `WHOOBE_HOSTNAME` | core-api, asset-processor, gateway (CORS), Vite builds | `localhost` | host name all derived URLs are built from; credentialed CORS is allowed for it (any port or scheme) |
| `DB_HOSTNAME`, `S3_ENDPOINT_HOSTNAME` | `.env.example` interpolation | `localhost` | convenience names for `DB_HOST` and `S3_ENDPOINT` |
| `NODE_ENV` | all backends | `production` in the images | `production` hides SQL and stack text in 5xx bodies, disables loopback outbound by default, stops allowing `localhost` origins for credentialed CORS |
| `PORT` | asset-processor, core-api | 3002 / 3003 | listening port inside the container (do not change in Compose) |
| `GATEWAY_PORT` | gateway | 3001 | same, for the gateway |
| `CORS_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` | all backends | unset | extra hosts / exact origins allowed to send credentialed requests |
| `ADMIN_PUBLIC_URL` | core-api | `http://$WHOOBE_HOSTNAME:3000` | link in password-reset e-mails |
| `TRUST_PROXY` | all backends | unset | reverse-proxy hops (`1`), `loopback` or CIDR list, so that `req.ip` is the client; **required behind nginx**, otherwise limiters and the login lockout see the proxy |
| `COOKIE_SECURE` | core-api | automatic (HTTPS or `X-Forwarded-Proto: https`) | `true` forces the `Secure` flag on the session cookie |

## 2. Database (PostgreSQL)

| Variable | Used by | Default | Secret | Meaning |
|---|---|---|---|---|
| `POSTGRES_USER`, `POSTGRES_DB` | the postgres container, Compose | `postgres`, `whoobe_db` | | database server bootstrap |
| `POSTGRES_PASSWORD` | the postgres container | none (Compose refuses to start) | **yes** | |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_NAME` | core-api, asset-processor, gateway, migration-tool | `localhost`, 5432, `postgres`, `whoobe_db` | | connection |
| `DB_PASSWORD` | same | none: the service stops at start if it is unset, unless `NODE_ENV` is `development` or `test` (F-057); Compose requires it | **yes** | |
| `DB_SSL`, `DB_SSL_CA` | same | `disable` | | TLS to PostgreSQL: `disable` \| `require` \| `verify-full`; CA as path or PEM ([encryption](encryption.md)) |
| `WS_POSTGRES_PORT`, `WS_DATA_BIND_ADDRESS` | Compose | 5432, `127.0.0.1` | | host side of the database port; set `0.0.0.0` only with a firewall |

## 3. Object storage (S3 API)

| Variable | Used by | Default | Secret | Meaning |
|---|---|---|---|---|
| `COMPOSE_PROFILES` | Compose | `local-s3` | | `local-s3` starts Garage; remove it to use an external S3 |
| `S3_ENDPOINT` | host processes | `http://$S3_ENDPOINT_HOSTNAME:9000` | | endpoint for processes outside Docker |
| `S3_CONTAINER_ENDPOINT` | Compose services | `http://garage:3900` | | endpoint the containers call (external S3: its URL) |
| `S3_BUCKET`, `S3_REGION` | asset-processor, core-api | `whoobe-cms`, `us-east-1` | | |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | asset-processor, core-api, Garage | none | **yes** | Garage needs `GK` + 24 hex and 64 hex |
| `S3_FORCE_PATH_STYLE` | asset-processor | `true` | | `false` for AWS S3 |
| `S3_KEY_PREFIX` | asset-processor | empty | | prefix inside the bucket |
| `S3_PUBLIC_BASE_URL` | asset-processor | `http://$WHOOBE_HOSTNAME:3002/dam-asset` | | base of the public asset URLs the API returns |
| `WS_S3_API_PORT` | Compose | 9000 | | host side of the S3 port |
| `MINIO_ENDPOINT`, `MINIO_BUCKET`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | legacy aliases of `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` still read by core-api and asset-processor | | user and password are **secret** | use the `S3_*` names; MinIO itself is no longer part of the stack ([storage backends](storage-backends.md)) |
| `ASSET_PROCESSOR_URL` | core-api, logger | `http://$WHOOBE_HOSTNAME:3002` | | where core-api reaches asset-processor (inside Compose: the service name) |
| `DAM_SERVICE_TOKEN` | core-api, asset-processor, logger | none | **yes** | the service-to-service bearer ([auth](../architecture/authentication-and-authorization.md)) |
| `DAM_ENFORCE_ASSET_VISIBILITY` | asset-processor | `true` | | `false`: anyone with a URL can read any asset |
| `ASSET_MAX_FILE_BYTES`, `ASSET_MAX_COUNT` | asset-processor | 50 MB, no count limit | | upload caps |
| `ASSET_MAX_INPUT_PIXELS` | asset-processor, core | 100000000 | | largest image decoded; `0` = sharp's own limit |

## 4. Application secrets and keys

All generated per workspace by `provision-workspace.sh` (`openssl rand -hex 32`). **Rotation is manual and some keys
cannot be lost** - see [secrets and keys](secrets-and-keys.md).

| Variable | Used by | Secret | Protects |
|---|---|---|---|
| `MIGRATION_SOURCE_ENCRYPTION_KEY` | core-api | **yes** | credentials of saved Pimcore migration sources |
| `GATEWAY_AUTH_ENCRYPTION_KEY` | gateway, core-api | **yes** | upstream credentials of gateway endpoints |
| `SITE_API_KEY_PEPPER` | core-api **and** gateway (same value) | **yes** | hashing of per-website site keys; changing it invalidates every site key |
| `TOTP_ENCRYPTION_KEY` | core-api | **yes** | users' TOTP secrets; unset = clear text with a warning; lost = everyone re-enrols |
| `MAIL_SETTINGS_ENCRYPTION_KEY` | core-api | **yes** | SMTP password and mail-provider API keys; unset = they cannot be saved |
| `INTEGRATION_SECRETS_ENCRYPTION_KEY` | core-api (and the tools that read the settings) | **yes** | AI provider keys (text, image, translation), the Figma token and the push provider (OneSignal) key saved in the dashboard (F-055); unset = they stay in clear text with a warning; lost = enter them again |
| `UPLOAD_TOKEN_SECRET` | core-api, asset-processor | **yes** | signs the one-file upload tickets (32+ characters; placeholder or short = uploads answer 503) |
| `SEED_ADMIN_EMAIL` | core-api | | first administrator, created once |
| `SEED_ADMIN_PASSWORD` | core-api | **yes** | unset/empty = a random password is generated and printed once in the log |

## 5. HTTP hardening, limits and outbound policy

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `PUBLIC_RATE_LIMIT_PER_MINUTE` | core-api | 3000 | all `/public/*` routes, per client address; `0` = off |
| `PUBLIC_SEARCH_RATE_LIMIT_PER_MINUTE` | core-api | 120 | `/public/search` |
| `PUBLIC_QUERY_RATE_LIMIT_PER_MINUTE` | core-api | 600 | `/public/data-objects/query` |
| `FORM_SUBMIT_RATE_LIMIT_PER_WINDOW` | core-api | 10 | form submissions per address per 15 minutes |
| `UPLOAD_INTENT_RATE_LIMIT_PER_MINUTE` | core-api | 20 | upload approvals per address per minute |
| `UPLOAD_PUT_RATE_LIMIT_PER_MINUTE` | asset-processor | 30 | upload bodies per address per minute |
| `UPLOAD_PUBLIC_BASE_URL` | core-api | derived from the request (`localhost` → `:3002`) | the address a visitor's browser sends file bytes to; set it when that is not the same host as the page's API |
| `AI_RATE_LIMIT_PER_MINUTE` | core-api | 20 | AI generation per user; `0` = off |
| `ENFORCE_PUBLISH_PERMISSION` | core-api | `true` | `false`: `objects:write` is enough to publish |
| `GATEWAY_REQUIRE_FIELD_ALLOWLIST` | gateway | `false` | `true` refuses old submit bindings that forward every field |
| `OUTBOUND_ALLOW_LOOPBACK` | `safeFetch` | `false` in production | |
| `OUTBOUND_ALLOW_PRIVATE` | `safeFetch` | `true` | RFC1918/ULA/CGNAT targets; **set `false` on internet-facing installs or where authors are not fully trusted** |
| `OUTBOUND_ALLOW_HOSTS` | `safeFetch` | unset | host names exempt from every outbound check |
| `WS_APP_BIND_ADDRESS` | Compose | `0.0.0.0` (the workspace scripts set `127.0.0.1`) | interface of the application ports |
| `WS_ADMIN_DASHBOARD_PORT`, `WS_GATEWAY_PORT`, `WS_ASSET_PROCESSOR_PORT`, `WS_CORE_API_PORT`, `WS_WHOOBE_ONE_SPIKE_PORT` | Compose, nginx rendering | 3000, 3001, 3002, 3003, 3006 | host side of each port |
| `WS_MAX_BODY` | nginx rendering | `100M` | request body cap for the whole server |
| `WS_EDGE_LIMITS` | nginx rendering | empty | extra server-level nginx directives (the public sandbox sets rate limits here) |

## 6. Gateway

| Variable | Default | Meaning |
|---|---|---|
| `GATEWAY_CORE_API_URL`, `GATEWAY_ASSET_PROCESSOR_URL` | `http://$WHOOBE_HOSTNAME:3003` / `:3002` | where the gateway reaches the other services |
| `GATEWAY_DEFAULT_RATE_LIMIT_RPS` | 10 | per-key limit when a route sets none |
| `GATEWAY_RATE_LIMIT_BACKEND` | `memory` | `redis` is accepted but **the Redis backend is not implemented**: it falls back to memory |
| `GATEWAY_REDIS_URL` | unset | read, but unused (see above) |
| `GATEWAY_PROXY_TIMEOUT_MS` | 30000 | upstream timeout |
| `GATEWAY_PRESETS_PATH` | unset | extra vendor presets (`*.json`), read per request |
| `GATEWAY_PLUGINS_PATH` | unset | gateway plugins (code), loaded at start |
| `VITE_GATEWAY_*` | | build-time defaults of the gateway screens in the dashboard |

## 7. Mail, AI and integrations

| Variable | Default | Meaning |
|---|---|---|
| `MAIL_PROVIDERS_PATH` | unset | extra mail-provider definitions (`*.json`), read again when a file changes |
| AI provider keys, Figma token, SMTP settings, push provider key | | not environment variables: entered in the dashboard and stored encrypted in the database (`INTEGRATION_SECRETS_ENCRYPTION_KEY` for AI, Figma and push; `MAIL_SETTINGS_ENCRYPTION_KEY` for SMTP and mail providers) |

## 8. Logging

| Variable | Default | Meaning |
|---|---|---|
| `LOG_LEVEL` | `info` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace`; can also be switched at run time (log toggle) |
| `LOG_DIR` | `./logs` | where rotated files are written before upload to the DAM log folder |

## 9. Browser builds (Vite, baked at image build time)

Changing these needs the **images rebuilt**, not just a restart.

| Variable | Meaning |
|---|---|
| `VITE_ASSET_PROCESSOR_URL`, `VITE_CORE_API_URL`, `VITE_GATEWAY_URL` | base URLs the browser uses (per-port in development; the bare host behind the proxy) |
| `VITE_BASE_URL` | URL prefix of the editor (`/whoobe-one/` behind the proxy) |
| `VITE_WHOOBE_ONE_URL` | where the dashboard finds the editor when it is not the default |
| `VITE_FONT_FAMILIES` | fonts offered in the editor |
| `EDITOR_FRAME_ANCESTORS` (runtime, editor image) | who may embed the editor in a frame (`frame-ancestors`) |

## 10. Public sandbox

| Variable | Meaning |
|---|---|
| `SANDBOX_MODE` | `1` turns AI, mail, imports, CDN mirror, PWA generation and outbound HTTP off |
| `SANDBOX_RESET_AT` | time shown in the reset banner |
| `SANDBOX_ALLOW_HOSTS` | host names outbound HTTP may still reach |

Set by `provision-workspace.sh --profile sandbox` ([sandbox](sandbox.md)).

## 11. Operator and tool variables

| Variable | Used by | Meaning |
|---|---|---|
| `BACKUP_AGE_RECIPIENT`, `BACKUP_GPG_RECIPIENT`, `AGE_IDENTITY` | backup and restore scripts | encryption recipient / decryption identity ([encryption](encryption.md)) |
| `RESET_USER_EMAIL`, `RESET_USER_PASSWORD`, `RESET_USER_CLEAR_MFA` | `packages/core/src/db/scripts/reset-user-password.ts` | break-glass password and MFA reset |
| `PIMCORE_DB_HOST`, `PIMCORE_DB_PORT`, `PIMCORE_DB_NAME`, `PIMCORE_DB_USER`, `PIMCORE_DB_PASSWORD`, `PIMCORE_ASSETS_TABLE`, `PIMCORE_DOCUMENTS_TABLE`, `PIMCORE_DOCUMENTS_ELEMENTS_TABLE`, `PIMCORE_VAR_ASSETS_PATH`, `PIMCORE_VAR_CLASSES_PATH` | `packages/migration-tool` | source of a Pimcore import (password is **secret**) |
| `DATABASE_URL`, `PORTABILITY_TEST_DATABASE_URL` | tests and tools | connection string for integration tests |
| `BASE_URL`, `CMS_API_URL`, `CMS_WEBSITE_ID`, `CMS_SITE_API_KEY`, `CMS_REVALIDATE`, `NEXT_PUBLIC_*`, `PUBLIC_SITE_URL`, `CORE_API_URL`, `GATEWAY_URL`, `VITE_X`, `VUE_APP_X` | generated sites and templates (`packages/publish`, SDK adapters) | configuration of a **published site**, not of the CMS; `CMS_SITE_API_KEY` is **secret** and must stay on the site's server |

## 12. What is not configurable by variable

Session lifetime (7 days), login lockout thresholds (5 / 25 failures, 15 minutes), MFA throttles, the form-upload ticket
lifetime (10 minutes) and staging lifetime (2 hours), password length (8) and the pool size of the database
connection are constants in the code.
