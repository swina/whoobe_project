# Observability and logging

What the services record, where it goes, what can be monitored from outside, and what is **not** available. Written for
operators building monitoring and for security officers asking about audit trails.

## 1. Logs

| Aspect | Behaviour |
|---|---|
| Library | `pino` (`packages/logger`), JSON lines with ISO timestamps and a `level` label; one logger per service (`core-api`, `asset-processor`, `gateway`) |
| Level | `LOG_LEVEL` (default `info`), switchable at run time without a restart through the logging toggle (Settings, and `attachLoggingToggle` in each service) |
| Destinations | standard output (pretty-printed in development, JSON in production, so Docker's log driver collects it), and a rotating file under `LOG_DIR` (daily or at 10 MB, `pino-roll`) |
| Central copy | on rotation the file is uploaded to the asset store under `private/logs/<app>/<yyyy-mm>/` (needs `DAM_SERVICE_TOKEN`); the dashboard's **System logs** viewer reads the fresh local files and the uploaded ones |
| Retention | none enforced: rotated files stay in the bucket; local files stay in the container's log directory (lost with the container unless `LOG_DIR` is mounted) |
| Redaction | `req.headers.authorization`, `req.headers.cookie`, `headers.*` equivalents, `config.apiKey`, `config.apiSecret`, `config.password`, `config.token` |
| Reverse proxy | nginx access and error logs on the host are separate and not managed by Whoobe |
| Dashboard | **System logs** (read, filter, download) with dates on every line; **Settings > Mail > Log** (every outgoing mail with status and body) |

Recommended: ship container stdout to your central log platform (the Docker `json-file`/`journald` driver, a log agent),
set a size limit on the driver, and mount `LOG_DIR` if you rely on the local files.

## 2. What is recorded (security-relevant events)

| Event | Where | Level |
|---|---|---|
| Failed login: unknown user, inactive user, wrong password (user id, not the password) | core-api log | warn |
| Login lockout and MFA failures | the HTTP answer (429 / 401) in the proxy access log; **not** logged by the application | - |
| Permission denied, missing or invalid session | `console.warn` from the auth guard (reaches Docker's stdout, **not** the rotated file or its DAM copy) and 401/403 in the access log | warn |
| Form upload refused (upload id, website, reason) | asset-processor log | warn |
| Form notification skipped (not an authored block, recipient limit) | core-api log | warn |
| Outbound request refused by the SSRF guard | the calling service | warn |
| Workflow transitions of data objects | table `workflow_transition_log` | - |
| Page and snippet changes | table `content_versions` (who saved when) | - |
| Every outgoing mail | table `mail_log` | - |
| Sessions: created, last seen, IP, user agent | table `sessions` (never purged, F-056) | - |

**There is no audit log of administrative actions**: creating or deleting users, changing roles or permissions,
changing settings, deleting content, exporting or importing a website, regenerating a site key, enabling uploads. Whoever
needs that evidence must derive it from the nginx access log (method, path, status, address, but not the session user)
and the application log. This is a known gap for regulated environments.

## 3. Health and readiness

| Endpoint | Meaning |
|---|---|
| `GET /health` on core-api (3003), asset-processor (3002), gateway (3001) | **liveness only**: `200 {status:'ok', uptimeSeconds}`; it does **not** test the database or the object store, so a service with a dead database still reports healthy |
| Docker `HEALTHCHECK` (30 s interval, 5 s timeout, 20 s start period, 3 retries) | calls `/health` on the three backends; Compose `depends_on: service_healthy` makes asset-processor and gateway wait for core-api (which runs the migrations) |
| the two SPAs | nginx on 8080; no health route (probe `/`) |
| PostgreSQL | `pg_isready` health check in the compose file |
| Garage | its own health check |

For real readiness, probe a public read route end to end (for example `GET /public/pages/…` for a known page, or
`GET /auth/me` expecting 401), which exercises the database.

## 4. Metrics, tracing, alerting

Not provided: no `/metrics` endpoint, no Prometheus or OpenTelemetry instrumentation, no request tracing, no built-in
alert rules, no uptime page. Use what the platform gives you:

| Signal | How |
|---|---|
| Availability | external HTTP probes of the public site, the dashboard (`/`), `/health` through the proxy, and a database-backed route |
| Errors | rate of 5xx in the nginx access log; core-api/asset-processor/gateway `error` lines |
| Abuse | rate of 429 (per-address limits) and of 401/403; lines "Login failed", "Form upload refused" |
| Capacity | container CPU, memory and restarts (`docker stats`, cAdvisor); `pgdata` and `garagedata` disk use; PostgreSQL connections (`pg_stat_activity`), table size of `sessions`, `mail_log`, `form_uploads` |
| Certificates | days to expiry of the TLS certificate; the age of the last `renew-certs.sh` run |
| Backups | age of the newest encrypted dump and of the bucket sync ([backup](backup-restore-and-dr.md) section 7) |
| Mail | the mail log's `failed` rate; the provider's own dashboard |

## 5. Debugging a request

The access log of the proxy shows the route and status; the service log at `debug` shows more (switch it on, reproduce,
switch it off: debug logs may contain form values and addresses). Error responses in production carry a generic message;
the real cause is in the log line written by the handler (`logger.error({ err }, '<operation> error')`). 

## 6. Gaps

No audit trail of admin actions, no metrics or tracing, a health route that does not check dependencies, no log retention
policy, no tamper protection of logs, no per-request correlation id. Each is an item for the roadmap of a regulated
deployment; the workarounds above cover the common questions.
