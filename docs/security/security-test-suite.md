# Whoobe CMS - Automated Security Test Suite

**Audience:** enterprise security, risk and compliance teams evaluating Whoobe CMS.
**Scope of this document:** what the two automated security commands shipped in this repository actually do,
what they assert, how results are judged, and what they do *not* cover.

| Command | What it is | Needs a running stack |
|---|---|---|
| `pnpm security:api` | Black-box/grey-box API security test suite (vitest), about 980 test cases (the exact count is in each run's report) against core-api, gateway and asset-processor | Yes - a disposable, isolated stack |
| `pnpm security:static` | Static analysis: dependency CVEs, secret scanning (tree + full git history), SAST, shell lint, IaC/container config, HTML-sink inventory | No |
| `pnpm security:all` | Runs both, static first; fails if either fails | Yes (for the API part) |

Source of truth: `scripts/security/` (harness and suites), `package.json` (entry points),
`docs/plans/security/security-testing-plan.md` (test plan), `docs/plans/security/findings.md` (findings register,
IDs `F-0xx`). Every statement below is traceable to those files; file references are given throughout so a
reviewer can verify them.

---

## 1. Summary for reviewers

- **Repeatable and deterministic.** Both commands are scripted, need no manual steps during a run, and produce
  timestamped machine-readable (`.json`) and human-readable (`.txt`) reports.
- **Regression-oriented.** Every vulnerability found during the security review that is reachable through the HTTP
  APIs (findings register F-010 ... F-031) is encoded as a test asserting the *secure* behaviour, so a fix that
  regresses turns the run red. Findings that are not observable through the API (log content, container build
  context, hashing of stored tokens, browser rendering) are verified by other means - a unit test, a static
  scan or a documented manual check - and §6 states, finding by finding, which one applies.
- **Access control is checked exhaustively, not by sampling.** Every one of the 196 core-api routes is classified
  (public / authenticated / permission-gated) in a checked-in contract, and each guarded route is called as
  five different identities (837 parametric cases). Adding a route without classifying it fails the run.
- **Safe by construction.** The API suite refuses to run unless every target host is local (or explicitly
  allow-listed) and the database name contains `_sec_test`. It is never pointed at production data.
- **Explicit risk acceptance.** Static findings that are accepted are listed in a baseline file with a written
  reason and a mandatory review date. Expired acceptances fail the run.
- **Tooling is industry standard.** vitest, `pnpm audit` (GitHub Advisory Database), gitleaks, Semgrep, ShellCheck,
  Trivy, Hadolint - all run from their official Docker images; nothing is installed on the host.

---

## 2. `pnpm security:api` - API security test suite

### 2.1 Entry point and execution chain

```
pnpm security:api
  -> pnpm --filter @whoobe-cms/security test:api          (package.json, root)
     -> vitest run --config vitest.config.ts               (scripts/security/package.json)
        globalSetup: setup.ts                              safety checks, wait for stack, seed test identities
        include:     api/**/*.test.ts, unit/**/*.test.ts
        reporters:   default console + lib/summary-reporter.ts (timestamped report)
```

Runner settings (`scripts/security/vitest.config.ts`): 30 s per test, 120 s per hook, and
`fileParallelism: false` - suites run serially because lockout and rate-limit tests are order-sensitive and share
one stack.

### 2.2 System under test

The suite targets three services of a dedicated, throwaway deployment:

| Service | Role | Default test URL |
|---|---|---|
| core-api | Main REST API (auth, RBAC, content, public API) | `http://localhost:3103` |
| gateway | API gateway: public resolve/submit routes, upstream proxy, OpenAPI import | `http://localhost:3101` |
| asset-processor | Image processing, DAM uploads, asset delivery (`/dam-asset/*`) | `http://localhost:3102` |

The stack is created with `scripts/security/stack.sh up`, which starts the production `docker-compose.yml` under a
**separate compose project** (`whoobe-sectest`), with its **own volumes** (database and MinIO object storage), host
ports shifted by +100, and an env file `scripts/security/.env.sectest` (git-ignored, kept by the operator).
Services run with `NODE_ENV=production`, so production code paths (error sanitisation, outbound-request policy,
cookie handling) are what is tested. `stack.sh down` deletes the stack **and its volumes**.

The test stack is configured with `TRUST_PROXY=1` so tests can simulate distinct client addresses through
`X-Forwarded-For` (lockout and rate-limit tests), and with `DAM_ENFORCE_ASSET_VISIBILITY=true` so private-asset
enforcement is exercised.

### 2.3 Safety controls (enforced in code)

Implemented in `scripts/security/lib/config.ts` (`assertSafeTarget()`), called by `setup.ts` before anything else:

1. **Host allow-list.** All three target URLs must resolve to `localhost`, `127.0.0.1`, `[::1]`, a `*.local` host,
   or a host explicitly listed in `SECURITY_TEST_ALLOW_HOSTS`. Otherwise the run aborts.
2. **Database guard.** The `DB_NAME` of the target env file must contain `_sec_test`. Otherwise the run aborts
   ("never point this suite at a real database").
3. **No destructive sweeps as admin.** The authorization matrix is not run with the administrator identity
   (which holds every permission), and swept requests use a non-existent UUID and empty bodies, so a request that
   passes the access guard fails validation or returns 404 rather than modifying data.
4. **Self-cleaning fixtures.** Every suite that creates data (users, websites, pages, data classes, gateway
   endpoints, uploads) deletes it in `afterAll`.
5. **Bounded load.** Rate-limit tests send at most 130 requests to one endpoint; there is no DoS or load testing.

Target overrides: `SECURITY_TEST_TARGET`, `SECURITY_TEST_GATEWAY`, `SECURITY_TEST_ASSET_PROCESSOR`, `SEC_ENV_FILE`.
The safety checks apply to overrides too.

### 2.4 Test identities

`setup.ts` logs in as the seeded administrator and idempotently creates one role and one user per privilege
level (`scripts/security/lib/roles.ts`):

| Identity | Permissions | Purpose |
|---|---|---|
| `anon` | none, no session | unauthenticated attacker |
| `none` | authenticated, zero permissions | authenticated user with no rights |
| `read` | `objects:read` | read-only editor |
| `write` | `objects:read`, `objects:write` | content editor |
| `users` | `users:manage` | user administrator without content rights |
| `admin` | all | fixture creation and positive controls only |

Each identity has its own cookie jar (`lib/client.ts`), so sessions never mix. Tests that could lock an account
out (lockout, password reset, deactivation) use throw-away users created per test (`lib/tempuser.ts`), never the
seeded identities. Role-user passwords are derived from the admin password in the env file, so no extra secret
is stored.

### 2.5 Test catalogue

Section numbers (3.x) refer to the test plan; `F-0xx` to the findings register. Mappings to OWASP API Security
Top 10 (2023) and CWE are given as orientation for reviewers.

#### 2.5.1 Harness self-test - `api/harness.test.ts`

Proves the test environment is valid before results are trusted: `/health` is reachable anonymously; an
anonymous call to a protected route returns 401; every identity can log in; a user without `users:manage` gets
403 on `/auth/users` while the admin gets 200.

#### 2.5.2 Route contract and drift - `api/route-drift.test.ts` (plan 3.2)

`extract-routes.ts` statically parses every `app.<verb>(path, ...)` registration in
`apps/core-api/src/server.ts` and derives its access level from the middleware chain (`requirePermission(...)`
-> *permission*, `requireAuth` -> *auth*, none -> *public*). The result is compared with the checked-in contract
`scripts/security/routes.expected.json` (196 routes today: 160 permission-gated, 8 authenticated, 28 public,
each public route with a justification note).

| Test | Fails when |
|---|---|
| no route missing from the contract | a route is added to the code without a reviewed access decision |
| no stale contract entries | a route is removed without updating the contract |
| access level and permission unchanged | a route's guard is weakened, removed or changed |
| no duplicate registrations | the same method + path is registered twice (shadowing) |

OWASP API5 (Broken Function Level Authorization), API9 (Improper Inventory Management); CWE-862, CWE-285.
The test itself makes no HTTP call, but like every file of the suite it runs behind the shared `globalSetup`
(`setup.ts`), which waits for the stack's `/health`: the stack must be up.

#### 2.5.3 Authorization matrix - `api/authz-matrix.test.ts` (plan 3.2)

Driven by `routes.expected.json`; every route except `/health`, login/logout and MFA (covered in 2.5.4) is
called with path parameters replaced by a well-formed but non-existent UUID.

| Group | Assertion | Cases |
|---|---|---|
| Anonymous access | every non-public route returns **401** | 164 |
| Roles `none`, `read`, `write`, `users` | holder of the required permission gets past the guard (not 401/403); a holder lacking it gets **403** | 4 x 164 |
| Public routes | every public GET route without wildcards is reachable without credentials (not 401/403) | 17 |

Total: 837 cases per run. OWASP API1 (BOLA, guard level), API5 (BFLA); CWE-862, CWE-863, CWE-284.

#### 2.5.4 Authentication and session management - `api/auth.test.ts` (plan 3.1)

| Area | Assertions |
|---|---|
| Login responses | Same status and body for an existing and a non-existing e-mail (no user enumeration). Non-string credentials (NoSQL-style `{$ne:""}`, arrays, numbers, empty body) give 400, never 500, no stack trace. No session cookie on failed login. |
| Brute-force lockout | 5 failures from one address lock that address out (429), also for upper-case variants of the e-mail. A different address is **not** locked out (no account-lockout DoS by a third party, F-016). 26 failures from 26 addresses lock the account for everyone (per-account ceiling). Whitespace, full-width `＠` and NUL-byte variants of the e-mail never authenticate. |
| Session lifecycle | Logout invalidates the session server-side (replaying the old cookie gives 401). Deleting or deactivating a user ends their sessions. Completing a password reset ends all existing sessions and the old password stops working (F-013). Reset tokens are single-use. Removing a permission from a user takes effect on live sessions immediately (403 on next call). Garbage, empty, path-traversal and 5 000-character session cookies are rejected (401). |
| Cookie attributes | Session cookie is `HttpOnly`, `SameSite=Lax` or `Strict`, `Path=/`, has an expiry; carries `Secure` when the deployment is HTTPS (`X-Forwarded-Proto: https`, F-012). |
| Forgot / reset password | Identical response for known and unknown e-mails. Repeated requests for one e-mail are rate-limited (429 within 12 requests). Invalid, empty, all-zero and 10 000-character tokens are rejected with 4xx. The reset link is not built from attacker-controlled `Host` / `X-Forwarded-Host` / `Origin` headers (no host-header poisoning). |

OWASP API2 (Broken Authentication); CWE-204, CWE-307, CWE-384, CWE-613, CWE-614, CWE-1004, CWE-640.

#### 2.5.5 Public (unauthenticated) surface - `api/public-surface.test.ts` (plan 3.4)

Fixtures: a data class with one draft and one published object, a website and an unpublished page.

| Area | Assertions |
|---|---|
| Draft confidentiality | Public list, batch, query and search endpoints return only published objects; draft content never appears. A draft fetched by id returns 404 with a body identical to a non-existent id (no existence oracle). Unpublished pages are neither listed nor served. |
| Query endpoint robustness | 11 hostile `filters` / `orderBy` / paging payloads (SQL injection strings, `__proto__` and `constructor.prototype` field names, unknown operators, operator objects, non-array filters, negative / 10^12 limits and offsets, object/array class names) never produce a 5xx or database/stack text, and do not pollute `Object.prototype`. Malformed JSON gives a clean 400. Malformed ids never leak SQL text (F-018). |
| Public website info | No password, secret, hash or API-key fields in public website responses; the public website list exposes exactly `id` and `name`. |
| Preview tokens | Unknown tokens give 404, identical for any guess. A valid token shows only its own object and stops working once revoked. Tokens are at least 32 characters, 20 samples contain no repeats and no common prefix. |
| Public form submission | Submissions are stored unpublished; protected fields (`published`, `key`, `classId`) cannot be set; unknown fields are stripped; `__proto__` is ignored. Script payloads and 200 KB bodies are handled without a 5xx. |
| Other unauthenticated routes | `POST /pwa/subscribe` is rate-limited (F-019). The two public settings endpoints return only `{ enabled }`. |

OWASP API3 (Broken Object Property Level Authorization), API4 (Unrestricted Resource Consumption), API8
(Security Misconfiguration); CWE-200, CWE-89, CWE-1321, CWE-915, CWE-330.

#### 2.5.6 CORS, CSRF, security headers, error disclosure - `api/cors-csrf-headers.test.ts` (plans 3.5, 3.14)

| Area | Assertions |
|---|---|
| CORS (core-api) | An unknown origin never gets `Access-Control-Allow-Origin` reflected together with `Allow-Credentials: true`, on simple and preflight requests (F-011). `*` is never combined with credentials. The `null` origin is not trusted. Look-alike origins (`localhost.evil.example`, `evil.example/localhost`, `localhost@evil.example`) are not trusted. Positive controls: the admin origin keeps credentialed access; public routes are readable cross-origin but never with credentials. |
| CORS (gateway, asset-processor) | Same policy: unknown origin gets no credentials, admin origin does. |
| CSRF | State-changing requests sent with the three "simple" content types a cross-site form can produce (`text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`) do not succeed. No GET route has a state-changing name (`delete`, `logout`, `publish`, `reset`, `revoke`, ...). |
| Security headers | No `X-Powered-By`; `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY/SAMEORIGIN`, a `Referrer-Policy` on API responses (F-014); JSON responses declare a JSON content type. Gateway and asset-processor also send `nosniff` and no framework banner. |
| Error disclosure | Every authenticated GET route with a path parameter (32 routes) is called with a malformed id as admin: no 5xx and no database / stack / `node_modules` text (F-018). Unknown routes, wrong methods, encoded path traversal, `/.env` and `/.git/config` return a clean 400/401/404/405. |

OWASP API8 (Security Misconfiguration); CWE-942, CWE-352, CWE-693, CWE-209, CWE-497.

#### 2.5.7 File upload and asset delivery - `api/uploads.test.ts` (plan 3.7)

| Area | Assertions |
|---|---|
| Endpoint authentication | `/api/v1/process`, `/metadata`, `/watermark`, `/dam/upload` return 401 anonymously; a user without `assets:upload` gets 403 (F-023). An authorised session can process an image (positive control). |
| Parameter bounds | Out-of-range or malformed `width`, `height`, `quality`, `format` (including `exe` and `../x`) are rejected with 400 before any allocation. |
| Stored XSS via uploads | Uploaded HTML is served as `application/octet-stream`, `Content-Disposition: attachment`, with a `sandbox` CSP and `nosniff` (F-022). SVG containing script is served with a `sandbox` CSP without `allow-scripts`. A file whose uploader claims `text/html` but is an image is never served as HTML. Normal images keep their type and immutable caching (positive control). |
| Access to private assets | With visibility enforcement on, a private asset and its thumbnail return 404 anonymously and 200 to an authenticated session; public assets stay public. The system `private/` area is never served anonymously and is marked `private`/`no-store` for sessions. The internal service token can read private keys; a wrong bearer token cannot (F-024). |
| Input handling | Path traversal in the storage path cannot escape the key space. Empty files, NUL bytes, 600-character and encoded-traversal file names give 4xx without internals (F-025). |

OWASP API1 (object-level access to assets), API4, API8; CWE-434, CWE-79, CWE-22, CWE-306, CWE-400.

#### 2.5.8 Server-side request forgery - `api/ssrf.test.ts` (plan 3.8)

| Area | Assertions |
|---|---|
| Gateway admin API | Endpoint management, route test/execute and OpenAPI import return 401 anonymously and 403 to the `write` role. |
| Upstream URL policy | A gateway endpoint pointing at loopback or internal addresses in 8 encodings (`127.0.0.1`, `localhost`, `[::1]`, `127.1`, decimal `2130706433`, IPv4-mapped IPv6, `169.254.169.254` cloud metadata, `0.0.0.0`) is refused on *test* and *execute*, and no upstream content leaks (F-026). Positive control: a private-network upstream on the compose network still works (allowed by default, configurable). |
| OpenAPI import | `specUrl` pointing to loopback, metadata, the gateway itself or `file:///etc/passwd` is refused and no content is returned. A pasted spec cannot pull local files or internal URLs through external `$ref` (F-027). A harmless inline spec still imports (positive control). |

OWASP API7 (SSRF), API10 (Unsafe Consumption of APIs); CWE-918, CWE-73.

#### 2.5.9 API gateway public routes - `api/gateway.test.ts` (plan 3.9)

Fixtures: two websites with site keys, a gateway endpoint, and a page whose content creates one *resolve* and one
*submit* binding.

| Area | Assertions |
|---|---|
| Site authentication | Calls without a site key are rejected (401) once the site has one. The correct id + key works. A wrong key, another site's key, and a key presented for the wrong site id all give 403 with identical bodies. Unknown binding ids give 404; injection-shaped ids never give a 5xx or SQL text. Regenerating a key invalidates the old one immediately. Keys never appear in responses or errors. Malformed bodies are 4xx. |
| Submit route | A well-formed submission is forwarded to the pinned upstream. Prototype keys, invalid field names, more than 100 fields and oversized values are rejected (400). The honeypot field returns 204 without side effects. A *resolve* binding cannot be used as a *submit* target and vice versa. **Field allow-list (F-029):** the submit binding created when a page is saved carries the form's own input names; a field the form does not have is dropped before the upstream call, a declared one is forwarded (verified with a form whose only input is `locale`: a visitor-supplied `class` never reaches the upstream). |
| Rate limiting | One client address is throttled on submit (429) without blocking other visitors of the same site (F-028). Random binding ids from one address are throttled before costing database lookups. |
| Headers | `nosniff`, no framework banner. |

OWASP API2, API4, API6 (Unrestricted Access to Sensitive Business Flows); CWE-287, CWE-770, CWE-1321.

#### 2.5.10 Unit tests of security helpers - `unit/gateway-helpers.test.ts` (plan 3.9)

Pure-function tests, no stack needed: field-path resolution never walks the prototype chain (`__proto__`,
`constructor`, `toString`, ...), also through result filters (F-030); URL building encodes parameter values so they
cannot add path segments, query strings or change host, and rejects `.` / `..` values; submitted-attribute
validation accepts ordinary (also non-English) field names and rejects prototype keys, invalid names, 65-character
names, more than 100 fields and values over 20 000 characters; credential-looking keys (`apiKey`, `password`,
`Authorization`) are redacted at any depth.

#### 2.5.11 Second factor - `api/mfa.test.ts` (plan 3.1)

Enrolment endpoints need a session; a wrong code enrols nothing. A password login of an MFA user returns only a
challenge token (no cookie, `/auth/me` is 401). Unknown, malformed or missing challenge tokens are refused. The
right code opens a session; the **same code cannot be replayed** on a second login; a challenge token is single
use; guessing is limited **per account across fresh challenges** (15 wrong codes over three challenges lock the
account, a correct code is then refused with 429); recovery codes work once; a deactivated user cannot finish a
pending challenge. Disabling MFA needs the password and password guessing is limited (F-032). The suite computes
TOTP codes itself (RFC 6238, `lib/totp.ts`). OWASP API2; CWE-307, CWE-294, CWE-308.

#### 2.5.12 Publishing rights, draft leaks and throttling - `api/limits-and-publish.test.ts` (plans 3.2, 3.15)

An editor with `objects:write` cannot change `published` on a data object (PATCH or batch) or a page (403), can
still save content with the flag unchanged, and the admin can publish (F-035). The public search ignores
`includeUnpublished` while the admin search honours it (F-033). The raw `?editor=true` page view needs a session
(F-034). Anonymous `/public/search`, `/public/data-objects/query` and the AI generation endpoints are throttled
per address / per user, and one address being throttled does not affect another (F-036). AI settings never return
a stored provider key. OWASP API1, API3, API4, API5; CWE-285, CWE-200, CWE-770.

### 2.6 Known-finding convention

`lib/known.ts` provides `known('F-0xx', name, fn)`: a test that asserts the secure behaviour but is *expected* to
fail while a finding is open (`it.fails`). The run stays green while the finding is documented and open, and turns
red the day it is fixed - the signal to convert it into a plain regression test. **No finding is currently
encoded this way:** all findings covered by the API suite are fixed and are asserted as ordinary tests.

### 2.7 Results and evidence

- Console output (vitest default reporter) with per-test pass/fail.
- `scripts/security/reports/<YYYY-MM-DD>/api-<YYYY-MM-DD>_<HH-MM-SS>.txt` - result (PASS/FAIL), start time and
  duration, git commit and whether the working tree had uncommitted changes, the three target URLs, totals, per-file
  counts, and the first line of each failure.
- The same data as `.json`, including every test with state and duration - suitable for archiving as audit
  evidence or feeding a dashboard.
- **Result rule:** PASS only if zero tests failed and at least one passed. The process exit code is non-zero on
  any failure.
- Reports are git-ignored and excluded from Docker images (`.dockerignore`).

---

## 3. `pnpm security:static` - static security scans

### 3.1 Entry point and execution chain

```
pnpm security:static
  -> bash scripts/security/static/run-all.sh
     -> run-audit.sh, run-gitleaks.sh, run-semgrep.sh, run-shellcheck.sh, run-trivy.sh, run-vhtml-inventory.sh
     -> python3 summarize.py <reports dir>        applies baseline.json, writes summary, sets exit code
```

Each scanner writes its raw report to `scripts/security/reports/<YYYY-MM-DD>/`. A scanner exiting non-zero never
stops the run; the pass/fail decision is made only by `summarize.py` against the baseline. All tools except
`pnpm audit` and the inventory (`grep`) run from their official Docker images; nothing is installed on the host.
Requirements: Docker, Python 3, pnpm, git.

### 3.2 Scanners

| Scanner | What it covers | Exact invocation | Raw report | Fails the run when |
|---|---|---|---|---|
| **pnpm audit** | Known vulnerabilities (GitHub Advisory Database) in **production** dependencies of the whole workspace | `pnpm audit --prod --json` | `pnpm-audit.json` | a **high or critical** advisory not in the baseline. Moderate/low are listed as `info`. |
| **gitleaks** (`zricethezav/gitleaks:latest`) | Hard-coded secrets in the working tree **and the full git history** | `gitleaks detect --source /repo --redact` | `gitleaks.json` (values redacted) | any finding not in the baseline (matched by file, optionally by commit) |
| **Semgrep** (`semgrep/semgrep`) | SAST with rule packs `p/typescript`, `p/nodejs`, `p/expressjs`, `p/xss`, `p/secrets`; excludes `node_modules`, `.claude`, `dist`, `sites` | `semgrep scan --config ... --json /src` | `semgrep.json` | a new result of severity **ERROR** not in the baseline (new WARNING/INFO results are listed but do not fail) |
| **ShellCheck** (`koalaman/shellcheck:stable`) | All git-tracked `*.sh` (deployment, provisioning, publishing scripts): quoting, word splitting, command injection patterns | `shellcheck -f json <git ls-files '*.sh'>` | `shellcheck.json` | any finding of level **error or warning** (no baseline) |
| **Trivy config** (`aquasec/trivy:latest`) | IaC / container misconfiguration: Dockerfiles, docker-compose, Kubernetes-style manifests; skips `node_modules`, `.claude`, `sites` | `trivy config --skip-dirs node_modules --skip-dirs .claude --skip-dirs sites --format json /repo` | `trivy-config.json` | any **HIGH or CRITICAL** misconfiguration outside the skipped targets (no per-finding baseline) |
| **Hadolint** (`hadolint/hadolint`) | Dockerfile best practices for the root `Dockerfile` | `hadolint -f json - < Dockerfile` | `hadolint.json` | any finding of level **error or warning** |
| **HTML sink inventory** | Every `v-html`, `innerHTML`, `dangerouslySetInnerHTML`, `insertAdjacentHTML`, `document.write` in `apps/` and `packages/` (`.vue`, `.ts`, `.tsx`, `.js`), excluding build output | `grep -rnE ...` | `vhtml-inventory.txt` | never - informational count for manual XSS review (finding F-008) |

### 3.3 Baseline and risk acceptance

`scripts/security/static/baseline.json` is the register of accepted static findings. Each entry carries the
finding identity, a **written reason** and a **review date**:

| Section | Matching key | Current entries (summary) |
|---|---|---|
| `audit` | GitHub advisory id | 2 - `xlsx` advisories (F-003): the library is used only to *write* exports in the admin UI, never to parse untrusted files; no fixed version is published on npm. Review 2027-01-31. |
| `gitleaks` | file (+ commit prefix) | 3 - two false positives (prose in the plan, a code comment) and one historical local-service env file in commit `94f18fb` (F-001: values to be rotated; history deliberately not rewritten). Review 2026-12-31 / 2027-01-31. |
| `semgrep` | rule id + file | 6 - triaged false positives (no SQL / parameterised helpers, fixed-length GCM tag, allow-listed CORS origin reflection, server-built reset link). Review 2027-01-31. |
| `trivy_skip_targets` | path substring | `node_modules/`, `.claude/`, `sites/` (generated, untracked output to be regenerated, not baselined) |

Governance rules enforced by `summarize.py`:

- A run fails on any finding **not** in the baseline (subject to the severity thresholds in 3.2).
- A run fails when any `audit`, `gitleaks` or `semgrep` baseline entry is **past its review date** - accepted risk
  cannot silently become permanent.
- Accepted findings remain visible in every report (`accepted ...` lines), they are not hidden.
- Entries are to be removed when the underlying cause is fixed (stated in the file).

### 3.4 Results and evidence

`summarize.py` prints and writes `static-<YYYY-MM-DD>_<HH-MM-SS>.txt` and `.json` next to the raw reports. Each
scanner appears as one section with status `ok`, `FAIL`, `NOT RUN` (report missing, e.g. Docker unavailable) or
`info`, followed by its findings marked `NEW`, `accepted` or `info`; expired baseline entries are listed
separately. Overall result: `PASS` / `FAIL`; exit code `1` on FAIL, `0` otherwise.

Note: a scanner that could not run is reported as `NOT RUN` but does not by itself fail the run. Reviewers
should check that no section is `NOT RUN` before accepting a report as complete evidence.

---

## 4. Running the suites

```bash
# API suite (requires Docker and scripts/security/.env.sectest)
scripts/security/stack.sh up      # build and start the isolated stack, create the storage bucket
pnpm security:api                 # run the suite, writes reports/<date>/api-*.txt/.json
scripts/security/stack.sh down    # destroy the stack and its volumes

# Static scans (requires Docker, Python 3; no stack)
pnpm security:static              # writes reports/<date>/static-*.txt/.json and raw scanner output

# Both
pnpm security:all
```

To regenerate route-contract candidates after an intentional route change:
`pnpm --filter @whoobe-cms/security routes:extract` (writes `routes.generated.json` for review; the contract
file itself is edited by hand after the access decision).

`security:all` runs both commands even if the first fails, and exits non-zero if either of them failed, so it can be
used as a single gate.

---

## 5. Coverage and limitations

What these two commands do **not** cover today (from the test plan; listed so that reviewers can scope
compensating controls or additional testing):

| Area | Status |
|---|---|
| Browser-side XSS (rendering of user-authored HTML in admin and published sites, plan 3.6) | Not automated. The static inventory lists the sinks; the browser test suite (`security:browser`, Playwright) is planned. |
| Content-Security-Policy for the admin and editor SPAs (served by nginx) | Not tested (finding F-014, open part). |
| DAST (OWASP ZAP baseline / API scan), TLS configuration (`testssl.sh`) | Planned, not part of these commands. |
| Container image scanning (`trivy image`) | Not run; only configuration scanning (`trivy config`). |
| AI features (plan 3.10), publish / provisioning scripts at runtime (3.11) | Not covered by the API suite; shell scripts are covered statically by ShellCheck. |
| MFA (TOTP) flows | Excluded from the authorization sweep; not specifically tested. |
| Object-level authorization between tenants / owners | The matrix tests the permission guard per route; ownership of individual records is not exercised with multiple owners. |
| Load / denial of service | Out of scope by design; only bounded rate-limit checks. |
| Gateway submit field allow-list, legacy bindings (F-029) | The allow-list is enforced and tested for bindings created by saving a page. Bindings created by pages saved *before* F-029 carry no allow-list and still forward every field (a warning is logged) until the page is saved again and the site republished; `GATEWAY_REQUIRE_FIELD_ALLOWLIST=true` refuses them (HTTP 409). Not tested end to end through the editor UI. |
| Continuous integration | No CI workflow runs these commands yet; they are run on demand. Periodic scheduling is planned (plan section 7.1). |

Further technical notes:

- Scanner images for gitleaks, Semgrep, Trivy and Hadolint use floating tags (`latest` / unpinned), so results can
  change between runs as rule sets update. This favours detection of new issues over strict reproducibility; pin
  digests if a reproducible evidence trail is required.
- `pnpm audit` and Semgrep rule packs require network access to their advisory / registry services at run time.
- The route contract relies on static parsing of `apps/core-api/src/server.ts` (`app.<verb>(...)` at the start of
  a line). Routes registered in another way would not be seen by the drift test; the authorization matrix is
  driven by the same contract.
- The authorization matrix uses coarse role permissions (`objects:read`, `objects:write`, `users:manage`); the
  routes are currently guarded with six permission keys (`objects:read/write/publish`, `settings:manage`,
  `users:manage`, `workflows:manage`).

---

## 6. Traceability to the findings register

| Finding | Description (short) | Regression test |
|---|---|---|
| F-003 | Vulnerable dependencies | `pnpm audit` + baseline |
| F-001 | Secrets in git history | gitleaks + baseline |
| F-004, F-006 | Container hardening | Trivy config, Hadolint |
| F-005 | Shell script quoting | ShellCheck |
| F-008 | HTML sinks inventory | `vhtml-inventory.txt` |
| F-011 | Credentialed CORS reflection | `cors-csrf-headers.test.ts` |
| F-012 | Session cookie `Secure` | `auth.test.ts` |
| F-013 | Password reset keeps sessions | `auth.test.ts` |
| F-014 | Missing security headers | `cors-csrf-headers.test.ts`, `gateway.test.ts` |
| F-016 | Lockout DoS | `auth.test.ts` |
| F-018 | SQL text in errors | `cors-csrf-headers.test.ts`, `public-surface.test.ts` |
| F-019 | Unthrottled `POST /pwa/subscribe` | `public-surface.test.ts` |
| F-022 | Stored XSS via uploaded HTML/SVG | `uploads.test.ts` |
| F-023 | Unauthenticated image endpoints | `uploads.test.ts` |
| F-024 | Private assets readable anonymously | `uploads.test.ts` |
| F-025 | Upload input handling | `uploads.test.ts` |
| F-026 | SSRF via gateway upstreams | `ssrf.test.ts` |
| F-027 | SSRF / file read via OpenAPI `$ref` | `ssrf.test.ts` |
| F-028 | Gateway public-route DoS | `gateway.test.ts` |
| F-029 | Submit mass assignment | `gateway.test.ts` (allow-list and shape limits), `unit/gateway-helpers.test.ts`, core unit test `collectFormFieldNames`. Legacy bindings: see section 5. |
| F-030 | Prototype walk / path climbing in gateway | `unit/gateway-helpers.test.ts`, `gateway.test.ts` |
| F-032 | MFA guessing, TOTP replay, disable-password oracle | `mfa.test.ts` |
| F-033, F-034, F-035, F-036 | Draft leak in public search, raw editor view, publish permission, throttling | `limits-and-publish.test.ts` |
| F-037 | Image decompression bomb | `uploads.test.ts` |

Findings that are fixed but **not** observable through the API suite, and how each is verified instead:

| Finding | Description (short) | Verification |
|---|---|---|
| F-010 | Stored XSS in search result titles (admin, editor, site search) | Unit tests of `highlightSearchSnippet` (`packages/core/src/cms/search-highlight.test.ts`); browser check by the operator (manual checklist 1.1-1.2). Browser automation planned. |
| F-015 | Reset token/URL, e-mail and hash prefix in logs | Not automated. Code review plus a manual log check after the reset flows (manual checklist 4.5). |
| F-017 | Reset link built with a fixed `http://host:3000` | Not automated. Configuration (`ADMIN_PUBLIC_URL`); the suite only asserts the link is not taken from request headers (2.5.4). |
| F-020 | Secrets and host logs copied into Docker images | Not automated. `.dockerignore` fixed; verified once by listing the rebuilt image. Images built before the fix must be rebuilt. |
| F-021 | Reset tokens stored in clear | Unit test of `hashResetToken` (`packages/core`); single use and end of sessions are asserted in `auth.test.ts`. |
| F-031 | Gateway observations (optional site key, Redis stub, plugin loader) | Informational, no test. |
| F-038 | TOTP secrets encrypted at rest | Unit tests of `totp-crypto` (`packages/core`); the MFA suite runs on the encrypted path; storage format checked once on the test database (not automated). |

Full descriptions, severities and status: `docs/plans/security/findings.md`.
