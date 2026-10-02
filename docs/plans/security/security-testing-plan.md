# Security testing plan

Status: proposal - 2026-10-02. Nothing in this plan has been executed yet.

## 1. Goal and scope

Find and fix vulnerabilities in the WhoobeCMS stack with **repeatable scripts**
that can run locally and in CI, not one-off manual checks. Testing is done
against a **local/dev instance with a throwaway database** (never `whoobe_db`
production data, never a deployed workspace we do not own).

In scope (apps/packages in this monorepo):

| Component | Port / entry | Notes |
|---|---|---|
| `apps/core-api` | Express, `:3003` | ~200 routes in `src/server.ts`: auth, RBAC, data model, pages, DAM, AI, public API, preview |
| `apps/gateway` | Express | API gateway: proxy engine, site auth, rate limiter, form submit, OpenAPI importer, plugins |
| `apps/asset-processor` | Express | image/asset processing (sharp) |
| `apps/admin-dashboard` | Vue SPA | XSS, client-side authz, token handling |
| `apps/whoobe-one-spike` | Vue (editor + public page renderer) | renders user-authored HTML/blocks |
| `packages/publish` + `scripts/*.sh` + `deploy*` | CLI / shell | command injection, secrets, workspace provisioning |
| Infra: `docker-compose*.yml`, `nginx/`, `Dockerfile`, `.env` | | headers, exposed ports, secrets, TLS |
| Dependencies | `pnpm-lock.yaml` | known CVEs, supply chain |

Out of scope: third-party SaaS we integrate with (AI providers, SMTP), DoS/load
beyond a bounded rate-limit check, social engineering.

## 2. Facts from the code that shape the plan

Observed in the repo today (to verify, not assume, during testing):

- **CORS** is `origin: true, credentials: true` (`core-api/src/server.ts`, ~l.300); the comment itself says to lock it down before exposure. Combined with cookie auth this is the top item to test.
- **Session cookie**: `httpOnly: true`, `sameSite: 'lax'`, **`secure: false`** (~l.377). No CSRF token seen; protection relies on SameSite=Lax.
- **No `helmet` / security headers** and no global rate limiter in core-api (only login lockout keyed on e-mail, and a form-submit limiter keyed on `req.ip`). `req.ip` is only meaningful if `trust proxy` is set correctly behind nginx.
- **Body limit 25 MB** on `express.json` - large-payload and memory abuse surface.
- **Authorization** is per-route `requirePermission(PERMISSIONS.X)`; a few routes are deliberately unauthenticated (`/whoobe-one/settings/strip-html-comments`, `/whoobe-one/settings/logging` GET, all `/public/*`, `/preview/objects/:token`). Any route missing the middleware is a bug.
- **Public API** exposes data objects (`/public/data-objects*`, `POST /public/data-objects/query` with caller-supplied filters/orderBy), `/public/search`, `/public/assets/:uuid`, `/public/forms/:classId/submit` (writes data), `/public/apps/:websiteId`.
- **Preview tokens** grant access to *unpublished* objects (`/preview/objects/:token`): token entropy, expiry, revoke, view counting.
- **Auth features**: password login + lockout, MFA (TOTP), forgot/reset password, roles/permissions CRUD, user CRUD, gateway API keys (`.../gateway-api-key/regenerate`).
- **Server-side outbound requests**: gateway `proxy-engine.ts` (`fetch(url)`), `openapi-importer.ts`, AI generate / generate-image, CDN mirror - SSRF candidates.
- **User-authored HTML/blocks** rendered by the editor/renderer (`v-html` in ~8 admin/spike components, `helpers.ts`, `BlockElement.vue`, `SearchElement.vue`), and snippet/page `render` endpoints - stored XSS and template-injection candidates.
- **Shell**: `packages/publish/src/cli.ts` uses `child_process`; `scripts/*.sh` take workspace names/hostnames as arguments.
- **Existing tests**: only `packages/core` has vitest (78 tests). There is no API-level or security test suite yet.

## 3. Contexts to test, and how a script covers each

Each row = one script (or module) under `scripts/security/`. "Auto" = fully
scriptable with assertions (pass/fail); "Semi" = script finds candidates, a human triages.

### 3.1 Authentication & session (core-api `/auth/*`) - Auto
- Login: wrong password timing/response parity for unknown vs known e-mail (user enumeration); lockout triggers after N attempts, **and cannot be bypassed** by varying e-mail case/whitespace/unicode or by `X-Forwarded-For`; lockout is not a DoS lever against a known admin.
- Cookie flags on `Set-Cookie` (`HttpOnly`, `SameSite`, `Secure` when `NODE_ENV=production`, `Path`, expiry); logout actually invalidates the server-side session (replay the old cookie -> 401).
- Session fixation / reuse after password change, role change, user delete.
- MFA: challenge brute force is rate-limited; setup/disable require re-auth; `/auth/mfa/challenge` cannot be called without a valid first-factor state; TOTP code reuse within the window.
- Forgot/reset password: token entropy and single use, expiry, response identical for unknown e-mail, reset link host not taken from the `Host` header (host-header poisoning).
- Password hashing parameters (argon2) sanity-check via a unit test on the core package.

### 3.2 Authorization / RBAC (BOLA, privilege escalation) - Auto
The highest-value script. Approach: **generate the route table** (parse `app.<verb>('...')` from `server.ts`, or add a debug route listing `app._router.stack`), then for every route call it with:
1. no credentials, 2. a user with *no* permissions, 3. a user with only `OBJECTS_READ`, 4. a user with `OBJECTS_WRITE` but not `USERS_MANAGE`/`SETTINGS_MANAGE`, 5. admin.
Assert the expected status matrix from a checked-in `routes.expected.json` (route -> required permission). Any route answering 2xx to a lower role, or any new route missing from the file, fails the run. This also detects accidentally public routes (see 2 above).
Targeted checks: a user cannot grant themselves a role / edit a role they hold (`PATCH /auth/roles/:id`, `/auth/users/:id`); cannot delete the last admin; IDOR on `/whoobe-one/pages/:id`, `/data-objects/:id`, snippets, versions across websites/workspaces; mass-assignment on `POST/PATCH` (send `role`, `permissions`, `isAdmin`, `created_by`, `published`).

### 3.3 Input validation & injection (core-api + gateway) - Auto + Semi
- **SQL injection** (Postgres): fuzz every string/array/JSON param, with emphasis on the dynamic parts: `POST /public/data-objects/query` (filters, `orderBy`, `limit/offset`), `/public/search`, `/data-objects` list filters, data-class field names/keys (used as JSON keys / identifiers), page binding filters with `{param}` substitution (`substituteBindingFilters`, SEO resolution reading URL params). Payload corpus + error-signature/timing detection; run `sqlmap` against a handful of high-risk endpoints as the Semi step.
- **JSON/prototype pollution**: `__proto__`, `constructor.prototype` in attributes, view configs, page JSON, SEO templates.
- **Type confusion / oversize**: arrays vs strings, deep nesting, 25 MB bodies, huge `limit`, negative offsets, NaN; confirm 400 not 500 and no stack traces (`NODE_ENV=production` error shape).
- **SEO / `{field}` token resolution** (new feature): tokens that reference other classes/fields must not read unpublished or unauthorised records; `{param}` values from the URL must not escape into the query.
- **Zod schemas** in `packages/core`: property-based tests (fast-check) for `compileFieldSchema` (array/json/slug types) - covered by vitest, no server needed.

### 3.4 Public/unauthenticated surface & data exposure - Auto
- Enumerate everything under `/public/*`, `/preview/*`, `/health` unauthenticated: does it leak **unpublished/draft** records, other websites' pages, soft-deleted rows, fields marked hidden/internal, user e-mails, API keys, stack traces, version/`X-Powered-By`?
- `/public/websites` and `/public/websites/:id`: ensure no gateway API key / settings secrets in the payload.
- `/public/data-objects/batch` and `query`: class-level visibility rules honoured (a class not meant to be public is not readable).
- Preview tokens: guessability (entropy statistically sampled), expired/revoked token -> 404/410, token bound to its object (not usable for another id), no listing, rate limiting on token guessing.
- Public form submit: honeypot, per-IP limiter works behind the proxy (spoofed `X-Forwarded-For`), field whitelist (cannot set non-form fields, `status`, `key`), payload size, file fields, stored-XSS payloads round-trip safely, e-mail header injection in notification mails (CRLF in subject/to).

### 3.5 CORS, CSRF and security headers - Auto
- Send requests with `Origin: https://evil.example` to authenticated and public routes; assert credentialed ACAO is **not** reflected for unknown origins (expected to **fail today** -> drives an allowlist fix).
- CSRF: with a valid cookie, issue state-changing requests cross-site style (no custom header, `text/plain` / form content-types, GET-with-side-effects). Confirm JSON-only content-type enforcement and that no state-changing GETs exist.
- Header audit (script like `securityheaders` locally): CSP, HSTS (behind TLS), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection, for core-api, gateway, nginx-served SPA, and published sites. Recommend `helmet` + a CSP for the admin SPA.
- Cookie `Secure` flag in production config.

### 3.6 Stored/reflected XSS and content rendering - Semi
- Corpus (`<script>`, event handlers, `javascript:` URLs, SVG, `<iframe srcdoc>`, template/handlebars-like `{{ }}`, mXSS) pushed through every user-authored field: page/snippet blocks, data-object text/richtext/markdown/json/array fields, SEO fields, titles, class/field labels, user display names, form submissions, asset names/alt text.
- Then render in **each sink** with Playwright (already available as an MCP plugin; add `@playwright/test` as a dev dependency): admin dashboard lists/forms, `MarkdownEditor`, `BlockNodePreview`, `SnippetNodeRenderer`, `DashboardLayout`, whoobe-one-spike `BlockElement`/`BlockTable`/`SearchElement`, the public page renderer and generated published HTML. A script flags any payload that executes (`window.__xss` canary / dialog event).
- Static pass: grep-based inventory of all `v-html` / `innerHTML` / `dangerouslySetInnerHTML` and check each is sanitised (DOMPurify or equivalent) - list lives in the report, and a lint rule (`vue/no-v-html` with explicit disable comments) keeps new ones visible.
- Render endpoints (`/whoobe-one/pages/:id/render`, `/snippets/:id/render`): template/expression injection and SSRF via embedded URLs/images (base64-image render option).

### 3.7 File upload, DAM and asset-processor - Auto + Semi
- Upload matrix: wrong MIME vs extension, polyglot files (GIF+JS, SVG with script, HTML as `.jpg`), double extensions, null byte, path traversal in filename (`../../`), very large/decompression-bomb images (sharp pixel limits), zero-byte, EXIF with script, SVG XXE / external references.
- Served-back behaviour: `Content-Type`, `Content-Disposition`, `nosniff`, and SVG served as attachment or sanitised from `/public/assets/:uuid` and the asset-processor.
- Access control: private assets not reachable through `/public/assets/:uuid` by guessing; UUID enumeration/IDOR; mirror-status endpoint info leak.
- Path traversal on any file-reading endpoint (CDN mirror, thumbnails, `sites/` output, templates).
- asset-processor: direct access bypassing core-api auth? (bound to localhost only?), resize parameter abuse (huge `w`/`h`, SSRF if it accepts URLs).

### 3.8 SSRF and outbound calls - Semi
- Gateway `proxy-engine` / `resolve-gateway-url`, OpenAPI importer, AI image/generate endpoints, CDN-mirror config, webhooks/integrations: point each at `http://127.0.0.1:<port>`, `http://169.254.169.254`, `http://[::1]`, `file://`, DNS rebinding hostname, redirects to internal IPs, decimal/octal IP encodings. Use a local canary HTTP listener to prove or disprove reachability.
- Check allowlist/blocklist logic, redirect-following policy, response size/time limits.

### 3.9 API gateway specifics (`apps/gateway`) - Auto
- API-key auth: missing/invalid/revoked key; regenerated key invalidates the old one; key not logged (`redact.ts`) and not echoed in errors; timing-safe comparison.
- `site-auth.ts`: bypass of site-level auth via path normalisation (`//`, `/..;/`, encoded slashes, trailing dot, case), HTTP method override, HEAD/OPTIONS.
- `rate-limiter.ts`: limits enforced per key/IP, window reset, header spoofing, memory growth with many distinct keys.
- Header injection into upstream (`gateway-auth-headers.ts`): client cannot override injected auth headers; hop-by-hop headers stripped; request smuggling basics (CL/TE) against the Node version in use.
- Plugin / preset loader (`plugin-loader.ts`, `preset-loader.ts`): path traversal when loading by name; only trusted directories.
- `gateway-result-filters.ts` / `resolve-field-path.ts`: path-expression injection / prototype access (`__proto__`, `constructor`).

### 3.10 AI features - Semi
- `/ai/*` require the right permission; settings endpoints never return stored provider keys in clear text (check responses and logs).
- Prompt-injection impact: content from data objects/pages fed into prompts cannot trigger actions beyond text generation (generated website structure is validated before persisting); output is sanitised before rendering.
- Cost abuse: per-user rate limit/quota on `/ai/generate*` and image generation.

### 3.11 Publishing, build and shell scripts - Semi
- `packages/publish/src/cli.ts`, `publish-site.sh`, `publish-mobile.sh`, `deploy.sh`, `scripts/*workspace*.sh`: feed names/hostnames/paths containing `;`, `$()`, backticks, spaces, newlines, `../`; verify quoting (run `shellcheck` on all `*.sh` as the automated part) and that `execFile`/`spawn` with an args array is used rather than a shell string.
- Workspace provisioning: one workspace cannot read/write another's files, DB or env; generated `.env` permissions (0600); no secrets in generated sites (`sites/`), in published JS bundles, or in `CHANGES.md`/logs.
- Generated sites: no admin tokens or API keys embedded; CDN sync (`whoobe-sync-cdn`) does not upload `.env`/source maps unintentionally.

### 3.12 Secrets, configuration and infrastructure - Auto
- **Secret scanning** of the working tree and **full git history**: `gitleaks detect` (and/or `trufflehog`) - also covers `logs/`, `deploy/`, `docker-compose*.yml`, `sites/`.
- `.env` handling: default/weak `JWT`/session/DB secrets, `.env` committed or world-readable, secrets printed by `logger` (grep log files in `logs/` for tokens, passwords, API keys, cookies; extend `redact.ts` tests).
- Docker: `docker-compose*.yml` - published ports (Postgres/Redis/asset-processor exposed on `0.0.0.0`?), default DB credentials, containers as root, `trivy config` + `trivy image` on the `Dockerfile`.
- nginx: `nginx/spa-fallback.conf` has no security headers, no `server_tokens off`, port 80 only; `enable-tls.sh`/`renew-certs.sh` produce TLS config without weak protocols (`testssl.sh` / `sslscan` against a TLS-enabled dev host); directory listing and dotfile access (`/.env`, `/.git/`, source maps) return 404.
- Trust-proxy / real client IP: confirm `req.ip` used by limiters is not spoofable.

### 3.13 Dependencies and supply chain - Auto
- `pnpm audit --prod` (fail on high/critical), `osv-scanner --lockfile pnpm-lock.yaml`; license check optional.
- Review `postinstall`/lifecycle scripts of direct deps; confirm lockfile is committed and CI installs with `--frozen-lockfile`.
- Dependabot/Renovate config, and pin base images in `Dockerfile`.

### 3.14 Logging, errors and information disclosure - Auto
- Force errors (malformed JSON, invalid UUID, DB error, 25 MB+ body) and assert no stack traces, SQL text, file paths or env values in responses when `NODE_ENV=production`.
- Audit trail: security-relevant events (login failure, role change, user delete, key regeneration, preview-link create/revoke) are logged with actor and without secrets; log injection (CRLF in logged fields).

### 3.15 Rate limiting, resource exhaustion (bounded) - Auto
- Confirm limits on: login, MFA challenge, forgot-password (e-mail flood), form submit, public search, `/public/data-objects/query`, AI endpoints, uploads. Bounded burst (e.g. 200 requests) only against the local instance; assert 429 appears and server stays healthy.
- ReDoS: run `safe-regex2`/`recheck` over regexes in the repo (slug, token, search parsing) and fuzz the search endpoint with pathological strings.
- Expensive queries: deep nested filters, very large `limit`, wide `IN` lists.

## 4. Tooling

| Purpose | Tool | Where it runs |
|---|---|---|
| API test harness (authz matrix, injection, headers, CORS) | **vitest** + `fetch`/`undici` (matches existing `packages/core` stack); `fast-check` for fuzz/property tests | `scripts/security/api/*.test.ts` |
| Browser XSS / CSP / token storage checks | **Playwright** (`@playwright/test`) | `scripts/security/browser/*.spec.ts` |
| DAST baseline | **OWASP ZAP** baseline/API scan (`zap-api-scan.py` with an OpenAPI spec generated from `docs/api` or the route table) | Docker, dev stack |
| SQLi deep dive | `sqlmap` against 5-10 chosen endpoints (cookie/key supplied) | manual-triggered script |
| Static analysis | `semgrep` (`p/typescript`, `p/nodejs`, `p/expressjs`, `p/xss`) + `eslint-plugin-security` + `vue/no-v-html` | CI |
| Secrets | `gitleaks` | pre-commit + CI |
| Dependencies | `pnpm audit`, `osv-scanner` | CI |
| IaC / containers | `trivy config`, `trivy image`, `hadolint`, `shellcheck` | CI |
| TLS / headers | `testssl.sh`, custom header script | against TLS dev host |
| Fuzzing HTTP | `ffuf` for hidden routes/dotfiles; `schemathesis` if an OpenAPI spec exists | manual |

Fixture requirements: a `scripts/security/setup.ts` that creates a **disposable DB** (e.g. `whoobe_sec_test`), seeds users per role (none/read/write/admin/users-manager), two websites/workspaces, published + draft records, public + private assets, a gateway API key and a preview token - so tests are deterministic and never touch real data.

## 5. Proposed layout

```
scripts/security/
  README.md                 how to run, env vars, safety notes
  setup.ts / teardown.ts    disposable DB + seeded users/fixtures
  lib/client.ts             authenticated client per role, raw request helper
  routes.expected.json      route -> required permission (source of truth for 3.2)
  api/
    auth.test.ts            3.1
    authz-matrix.test.ts    3.2
    injection.test.ts       3.3
    public-surface.test.ts  3.4
    cors-csrf-headers.test.ts 3.5
    uploads.test.ts         3.7
    ssrf.test.ts            3.8
    gateway.test.ts         3.9
    errors-logging.test.ts  3.14
    ratelimit.test.ts       3.15
  browser/
    xss-sinks.spec.ts       3.6
    token-storage.spec.ts   cookies/localStorage secrets in SPA
  static/
    run-semgrep.sh  run-gitleaks.sh  run-audit.sh  run-trivy.sh  run-shellcheck.sh
  payloads/                 xss.txt, sqli.txt, traversal.txt, ssrf-targets.txt, upload fixtures
  reports/                  generated (gitignored)
```
Entry points: `pnpm security:static` (no running stack needed), `pnpm security:api`, `pnpm security:browser`, `pnpm security:all`.

## 6. Safety rules

- Scripts refuse to run unless `SECURITY_TEST_TARGET` is `localhost`/`*.local`/an explicit allowlist, and unless the DB name contains `_sec_test`.
- No destructive tests on shared/production workspaces; DoS-style checks are bounded and local only.
- Real credentials/keys are never put in payload files or reports; reports are redacted.
- Findings are triaged privately before any public issue is opened.

## 7. Phases

| Phase | Content | Effort | Exit criterion |
|---|---|---|---|
| 0 - Baseline (0.5 d) | Static tools only: gitleaks (tree + history), `pnpm audit`, semgrep, shellcheck, trivy config, `v-html` inventory | small | First findings report; secrets/CVE blockers fixed or ticketed |
| 1 - Harness (1 d) | `setup.ts`, disposable DB, role clients, route-table extraction, `routes.expected.json` | small | `pnpm security:api` runs an empty suite green |
| 2 - Access control (1-2 d) | 3.1, 3.2, 3.4, 3.5 | medium | Authz matrix green; CORS/cookie/headers findings filed (several expected) |
| 3 - Injection & content (2 d) | 3.3, 3.6, 3.7, 3.14 | medium | No payload executes in any sink; no SQLi signal; uploads safe |
| 4 - Gateway, SSRF, AI, publish (2 d) | 3.8, 3.9, 3.10, 3.11 | medium | SSRF policy documented and tested; shell scripts quoted |
| 5 - Infra & DAST (1 d) | 3.12, ZAP baseline + API scan, testssl, rate-limit tests 3.15 | small | ZAP baseline has no High; headers set |
| 6 - CI & regression (1 d) | GitHub Actions: static on every PR, API/browser suites nightly or on `core-api`/`gateway` changes; fail on High | small | Suite wired, documented in `docs/` |

## 8. Prioritised hypotheses to confirm first

1. Credentialed CORS reflection (`origin: true`) lets any website call the API with a logged-in admin's cookie - **High**.
2. `secure: false` cookie and no security headers in production deployment - Medium.
3. Unauthenticated `/whoobe-one/settings/*` GETs and any other route lacking `requirePermission` - Low/Medium (check what they reveal).
4. Stored XSS through the ~8 `v-html` sinks and published page HTML - High if reachable by a lower-privileged editor or public form.
5. SSRF via gateway proxy / OpenAPI importer / AI image URLs - High if reachable by non-admins.
6. `POST /public/data-objects/query` and SEO `{param}` substitution as injection / unpublished-data exposure paths - Medium/High.
7. Rate limiting absent beyond login/forms (MFA, forgot-password, search, AI) - Medium.
8. Shell-script argument injection in workspace provisioning/publish - Medium (depends on who can trigger it).

## 9. Deliverables

- `scripts/security/**` as above, with a README.
- A findings register (`docs/plans/security/findings.md`): ID, component, severity (CVSS-like), reproduction script, fix status.
- Fix tasks per finding; each fix adds the failing test as a regression test.
- CI workflow running the static and API suites.

## 10. Open questions

- Which deployment is the real target (single-tenant dev LAN, or multi-tenant workspaces on the public internet)? It changes the severity of CORS/cookie/CSP findings.
- Is there an OpenAPI spec for core-api (needed for ZAP/schemathesis), or do we generate one from the route table?
- Is a disposable Postgres (docker) acceptable for the test DB, and can CI start the full stack (`docker-compose*.yml`)?
- Who may trigger publish/provisioning scripts (only operators, or also UI users)?
