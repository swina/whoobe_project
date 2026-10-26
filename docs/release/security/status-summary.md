# Security status - single summary

State at **2026-10-23**, release candidate 0.3.0 (see `git log` for the exact commit; the sections not touched on this date still describe 2026-10-19, release 0.2.0). **2026-10-26, release candidate 0.3.1**: only dependency and image updates (four high advisories in `zod`, `body-parser`, `multer`, `undici`, and `brotli-libs` and `curl` in the two nginx images, which now upgrade every Alpine package at build time; F-003, F-050); the suites passed on the release candidate `99365c4` (run 40297447238, DAST included; record in [`results/v0.3.1.md`](results/v0.3.1.md)); the counts below were not recounted. **2026-10-26, release candidate 0.3.2**: the `publisher` image rebuilt without build tools and added to the image scan (F-063); branch run 40397598269 passed, the publisher image at 0 fixable HIGH/CRITICAL. Source of detail:
`findings.md` (register F-001 ... F-059), `security-testing-plan.md` (plan), `manual-test-checklist.md`
(browser/terminal checks), `../../security/security-test-suite.md` (description of the automated suites, written
for reviewers), `scripts/security/README.md` (how to run).

## 1. Where we are

| | |
|---|---|
| Findings recorded | **63** (F-001 ... F-063; F-060 to F-062 were found while building 0.2 and are fixed; F-063, the publisher image outside the image scan, found 2026-10-26, is fixed for 0.3.2) |
| By current severity | 30 Medium, 18 Low, 11 High, 3 Info (F-055 to F-059 were found on 2026-10-09 by the documentation review: clear-text third-party credentials (fixed), the push key served by a public route (High, fixed), sessions never purged / stored unhashed (fixed), a default DB password in code (fixed), function permissions not enforced (fixed: 90 content routes accept them); F-049 TLS and F-050 images added 2026-10-03/04, F-051 public settings 2026-10-06 and F-052 website import vs. `objects:publish` and F-053 public form notification as a mail relay, both 2026-10-07, and F-054 SMTP password in clear text, 2026-10-08, all fixed the day they were found) |
| Fixed in code | all 9 High; all but a few Medium (see section 3) |
| Automated checks | `pnpm security:api` and the unit tests (one `vitest run`): **92 API test files, 2337 passed, 0 failed, 2 skipped** in the CI run 39934951757 of 2026-10-23 on commit `f515ea1` (1595 tests / 32 API files at 2026-10-19; 1171 / 22 at 2026-10-09), `pnpm security:isolation` **14 tests** (two stacks, 14 passed on 2026-10-23) and `pnpm security:browser` **over 50 Playwright tests** (33 at 0.1.1, 30 at 0.1.0) (Chromium) green on a disposable stack, plus **DAST with OWASP ZAP** (**PASS on the 0.1.1 release candidate, 2026-10-18**: GitHub run of the `security` workflow with the DAST job, commit `5af9e3f`; the release gate requires a run on the exact release commit) (`scripts/security/dast/run-zap.sh`: active API scan of 154 routes of core-api, gateway and asset-processor with an admin session: 0 findings above Info; passive baseline of the admin and editor SPAs); `pnpm security:static` **PASS** (audit, gitleaks, semgrep, shellcheck, trivy config, hadolint, against a baseline with review dates); `core` unit tests 179 (+4 database round-trip tests of the website bundle, run against a disposable database) |
| Runs leave evidence | `scripts/security/reports/<date>/api-*.txt/.json`, `static-*.txt/.json` (git-ignored) |

The High findings (all fixed; nine): F-002 token embedded in git remotes, F-011 credentialed CORS reflection, F-020
images carrying `.env.*` and host logs, F-022 stored XSS through uploaded HTML/SVG, F-023 unauthenticated image
endpoints, F-024 private assets readable anonymously, F-033 unpublished content leaking through the public search,
F-039 code injection into generated sites, F-045 stored XSS through rich text (found with the browser suite).

## 2. What the tests cover (plan sections)

| Plan | Area | State |
|---|---|---|
| 3.1 | Authentication, sessions, lockout, password reset, MFA | done (`auth`, `mfa`, `mfa-required`, `oidc-login` suites and a Keycloak run; mandatory MFA per role, the password policy and OpenID Connect sign-in since 0.2) |
| 3.2 | Authorization: the route contract (262 routes) x 5 identities, route contract/drift, publish permission | done (`authz-matrix`, `route-drift`, `limits-and-publish`) |
| 3.3 | Input validation / injection | public query, malformed ids/JSON, prototype keys covered; public filters run in JS, not SQL; **no SQL fuzzing of the remaining endpoints** |
| 3.4 | Public surface, drafts, preview tokens, forms | done (`public-surface`) |
| 3.5 | CORS, CSRF, security headers | done for the three services and the two nginx SPAs (clickjacking, baseline headers; ZAP baseline); **no full CSP on the SPAs** (postponed: see F-014) |
| 3.6 | Stored/reflected XSS in browser sinks | done for the editor, published pages, admin lists/previews, data object fields, editor tables and form-result messages (`browser/xss-sinks.spec.ts`, 8 tests) and the SDK React/Vue adapters (SSR unit tests); **not browser-tested**: Studio, generated Next/Nuxt sites, mobile/PWA templates |
| 3.7 | Uploads, DAM, asset-processor | done (`uploads`) |
| 3.8 | SSRF / outbound requests | done (`ssrf`, `safeFetch` guard) |
| 3.9 | Gateway (site keys, limits, submit, helpers) | done (`gateway`, unit) |
| 3.10 | AI | provider keys never returned, per-user throttling; **prompt-injection impact not tested** |
| 3.11 | Publishing, generator, operator scripts | done (`publish`, unit) - generation and parsing only, **no `next build`/`nuxt build` of the output** |
| 3.12 | Secrets, config, infrastructure | secrets (gitleaks), Docker, compose exposure, SPA nginx headers done; TLS template (`pnpm security:tls`, F-049) and container images (`pnpm security:images`, F-050) scanned; **a live certificate/hostname has not been tested** |
| 3.13 | Dependencies | `pnpm audit` in the static scan, one accepted advisory (`braces`) with a review date (`xlsx` removed 2026-10-23) |
| 3.14 | Errors / logging | done (generic 5xx, SQL text hidden, log hygiene reviewed by hand) |
| 3.15 | Rate limits | login, MFA, forgot-password, forms, public search/query, AI, pwa subscribe done; **no load testing by design** |
| 7.1 | Periodic runs / CI | `.github/workflows/security.yml` (static on every PR/push/nightly; stack + API + browser suites on push to master/nightly/manual; ZAP monthly/manual) and `.github/dependabot.yml`; written and linted (`actionlint`) first GitHub run 2026-10-05 needed four small fixes (Dockerfile build order, testssl work dir, compose test `.env`, libpcre2 CVE) and is **green** (run 37286029925, DAST skipped by design) |

## 3. Open items

| Item | Why it is open | Needs |
|---|---|---|
| **F-001** secrets of an old env file of a test site: purged from the new repository's history (2026-10-06); the old values still exist in the old repository and its backups, but no running instance uses them (the test instance was reinstalled with newly generated secrets on 2026-10-07) | nothing to rotate on a running system | none |
| **F-003** `@tiptap/core` (major upgrade, moderate). `xlsx` (2 high advisories, no npm fix) was **removed 2026-10-23**: the library read the files chosen in the *Class from file* wizard (the entry said write-only), so Excel/ODS import and XLSX export are gone; CSV, TSV and JSON remain | deferred (tiptap) / fixed (xlsx) | plan the tiptap 3 upgrade |
| **F-008** residual `v-html` sinks (editor tables, form-result messages, Studio, generated sites) | sanitised in code but not covered by a browser test | extend `browser/xss-sinks.spec.ts`; run the generated sites through a build and the same payloads |
| **F-014** full CSP for the admin/editor SPAs (nginx) | postponed on purpose (clickjacking and baseline headers are done, F-047): more valuable the more people of different trust levels use the editor (not the supported model: one organisation per instance); a too strict policy breaks the editor | design with a report-only phase if the editor is opened to less trusted users |
| **F-055** AI provider keys, Figma token and push-provider key were clear text | **fixed 2026-10-09**: `INTEGRATION_SECRETS_ENCRYPTION_KEY`, startup backfill; operators of existing installations must set the key | set the key and restart |
| **F-059 (High)** the OneSignal REST API key was served by the public `GET /public/apps/:id` and to every reader | **fixed 2026-10-09** (records never carry it; encrypted; blank keeps it) | rotate any push key that was saved on an internet-reachable installation |
| **F-056** sessions never purged, session ids stored unhashed | **fixed 2026-10-09** (hashed ids, purge every six hours; everyone logs in once more) | - |
| **F-057** default database password in code when `DB_PASSWORD` is unset | **fixed 2026-10-09** (default only for `NODE_ENV` development/test) | - |
| **F-058** function permissions never enforced; seeded roles without `objects:*` | **fixed 2026-10-09**: 90 content routes accept the function key or the broad key; seeded roles corrected; 182 tests | - |
| The repository became public on 2026-10-14 | gitleaks over the whole history (613 commits) found no secret (four false positives, baselined); customer names, local paths and a private host name were removed from every commit and all branches were force-pushed first | GitHub keeps old commits reachable by hash and through pull-request refs until Support purges them: ask GitHub Support to run the purge |
| **F-044** deleting a website can answer 500 | functional, not a security issue | fix when convenient |
| **F-050** residual: postgres' `gosu` (22 at the 0.2 scan, 26 on 2026-10-23: Go 1.24.6 `stdlib` of the helper that drops root once at start; the newest `postgres:16-alpine` is the same) | upstream, reported not gating; a derived image with `su-exec` instead is planned for 0.4. MinIO (62 fixable HIGH/CRITICAL on its last release) was removed from the repository on 2026-10-10, Garage is the only local store | none for MinIO; an existing MinIO used as an external S3 stays the operator's responsibility |
| **F-063** the `publisher` image was never in the CI image scan (compose profile); 171 fixable HIGH/CRITICAL in the published 0.3.1 image, mostly build tools (esbuild's Go runtime, pnpm 9.0.0 in the corepack cache, npm, dev packages) | found 2026-10-26, after the 0.3.1 tag; **fixed for 0.3.2** (the image is built without pnpm, npm and the build tree: 0 fixable HIGH/CRITICAL; the image scan covers it) | release 0.3.2 |
| TLS on a real hostname | testssl ran on the rendered template, not on a public host with a Let's Encrypt certificate | run `testssl.sh` against the production hostname once HTTPS is enabled |
| Not covered by design or yet | SQL fuzzing of the remaining endpoints (3.3), AI prompt-injection impact (3.10), `next build`/`nuxt build` of generated sites (3.11), no load testing (3.15) | decide if/when |

### New surface since 2026-10-07 (reviewed 2026-10-09)

| Feature | Security-relevant behaviour | Evidence |
|---|---|---|
| **Form uploads** (visitors send files through a form) | off by default per website; allow-list of verifiable types only; first bytes checked against the type; pictures decoded and rewritten; size cut while streaming; signed single-use 10-minute ticket; private storage; staging deleted after 2 hours; rate limits and a daily quota; names generated. Residual: no antivirus, text/CSV/zip/Office accepted by structure only. Design: `docs/plans/forms/form-upload-plan.md`; guide `guides/form-uploads.md` | `api/form-uploads` (26), `api/upload-settings`, `unit/form-uploads` + `unit/form-values`, `browser/form-upload`, `browser/upload-settings` |
| **Download element** | a link with `download` to an asset or URL; no new server route | renderer, Vue and React tests, `browser/download-element` |
| **Draft preview** | `?draft=true` on `GET /public/page/*` and `GET /public/pages/:locale/*` finds unpublished pages only with a valid session (like `editor=true`); anonymous requests still get 404, the answer is not cached | `api/public-surface` (run on the test stack, 2026-10-21) |
| **Snippet lock** | `PUT /whoobe-one/snippets/:id/lock` (needs `objects:write`); an autosave of a locked snippet answers 423 | `api/snippet-lock`, in the route contract |
| **Documentation sites** | Markdown rendered by a safe-by-construction renderer; documents read from a DAM folder through the service token; only public assets served | `api/docs-site`, `unit/docs-*` |
| **UI consistency, editor sidebar, collapsed-nav menu** | front-end only | `unit/ui-contrast`, browser specs |

The DAST scan and the manual checklist have **not** been repeated for these features.

### New surface since 2026-10-09 (0.1.1, reviewed 2026-10-18)

| Feature | Security-relevant behaviour | Evidence |
|---|---|---|
| **Object events** (a service is told when a Data Object changes) | managed with the permission `object_events:manage` (given to `admin` only); a delivery is signed with an HMAC when the subscription names a key, and the key lives in an environment variable named `OBJECT_EVENTS_SECRET_<NAME>` (the dashboard stores only the name); the target is an Integration route, so the outbound guard (loopback and metadata addresses refused) applies; the event carries the changed field **names**, not values; refused in the public sandbox. Caveat: a secret written in a route path is stored in plain text (the guide says so) | `api/object-events` (14 tests, real key client through the Gateway), `unit/object-events-*`, the route contract (eight routes, drift test) |
| **End of flow and loop guard** | `X-Whoobe-Flow: stop` on a client write records the event as `stopped`, nothing is sent; a circuit breaker stops deliveries when an API client rewrites the same record repeatedly (people and system writes are never cut); a stopped delivery cannot be retried | `object-events-loop-guard` unit (8) and integration (7) tests, API tests, browser spec |
| **Renderer: markdown and rich-text fields** | converted with `marked` and sanitised with the same filter as the editor (scripts, handlers, `javascript:` removed) | 7 new renderer tests |
| **Images of the SPAs** | `libexpat` upgraded (CVE-2026-77214); all five product images 0 fixable HIGH/CRITICAL | `pnpm security:images` in the `security` workflow |
| **Release and upgrade workflows** | `release.yml`: `packages: write` and `id-token: write` only on the image jobs, `contents: write` only on the release job; cosign keyless; the tag must equal `package.json`. `upgrade.yml`: read-only | `.github/workflows/`; `release.yml` ran for v0.1.1 on 2026-10-18 |

The manual checklist has **not** been repeated for these features.

| **New in 0.3, not covered by the manual checklist or the browser suite** | the Generate Website Wizard and the site specification, the Kits section, uploaded fonts, the `private` profile and `workspaces.sh` have API/unit tests where they have routes (the API suites above); fonts, the profile and the fleet commands were also tried on throwaway workspaces (see `CHANGES.md`). The browser suite was not extended and the manual checklist was not repeated for them. The AI provider path of the wizard was never exercised | extend `browser/` for the wizard and the font upload; repeat the checklist on the release commit |
| **Disclosure policy** (new, 2026-10-22/23) | High and Critical findings found by the project are public with the release that fixes them; the private place is a draft advisory with a temporary private fork; 7 / 30 / 90 days. The register holds no entry kept private at this date | [`disclosure-policy.md`](disclosure-policy.md) |

## 4. Actions that are yours (cannot be done from here)

1. **Fresh secrets for every deployment** (the workspace scripts generate them; images built before F-020
   contain `.env.*` and host logs and should be rebuilt). Generate with `openssl rand -hex 32`: DB and S3 passwords,
   `MIGRATION_SOURCE_ENCRYPTION_KEY` (rotate even if you think it was never used: the example file held
   `my_secret_key_…`), `GATEWAY_AUTH_ENCRYPTION_KEY`, `DAM_SERVICE_TOKEN`, `SITE_API_KEY_PEPPER` (changing it
   invalidates all site keys: regenerate them), **new** `TOTP_ENCRYPTION_KEY` (keep it: losing it forces MFA
   re-enrolment), `SEED_ADMIN_PASSWORD`.
2. **Environment of every deployment** (all documented in `.env.example`): `WHOOBE_HOSTNAME` and, if admin, editor or
   sites live on other hosts, `CORS_ALLOWED_HOSTS` / `CORS_ALLOWED_ORIGINS`; `TRUST_PROXY=1` behind nginx (the
   login lockout and every limiter use the client address); `ADMIN_PUBLIC_URL` if the admin is not on
   `http://<host>:3000`; `OUTBOUND_ALLOW_PRIVATE=false` on internet-facing installs or where authors are not fully trusted.
3. **Pages with gateway forms**: save them again and republish the sites, then set
   `GATEWAY_REQUIRE_FIELD_ALLOWLIST=true` (F-029).
4. **Roles that publish**: grant `objects:publish` where it is intended; the permission is now enforced (F-035,
   `ENFORCE_PUBLISH_PERMISSION=false` restores the old behaviour).
5. **Development setup**: recreating `whoobe_postgres` / the S3 store publishes them on loopback only; add
   `WS_DATA_BIND_ADDRESS=0.0.0.0` to `.env` if a client on another machine needs them (F-043).
6. **Run the manual checklist** (`manual-test-checklist.md`) on the throwaway stack once, and report any KO.
7. Decide: when to start the CSP work (the F-024 flag is decided: on by default).
8. **Object storage**: decided - Garage is the default for local/LAN (automatic bucket and key), production uses a cloud or enterprise S3 through configuration, MinIO was removed from the stack (F-048/F-050, `docs/release/operations/storage-backends.md`). Remaining for you: copy existing MinIO data to the new store when switching a server (see the doc) and rebuild with `docker compose up -d --build`.

## 5. Behaviour changes introduced by the fixes (check these when something "stops working")

| Change | Symptom | Switch |
|---|---|---|
| Credentialed CORS only for an allowlist | browser "Failed to fetch" from an origin not on `WHOOBE_HOSTNAME` | `CORS_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` |
| `objects:publish` enforced | 403 when an editor changes `published` | grant the permission / `ENFORCE_PUBLISH_PERMISSION=false` |
| Image endpoints need a session or the service token | 401 from scripts that called `/api/v1/process` anonymously | `DAM_SERVICE_TOKEN` |
| Images over 100 MP refused | 413 on huge uploads | `ASSET_MAX_INPUT_PIXELS` |
| Reset password revokes sessions; reset tokens stored hashed | tokens issued before the upgrade stop working (1 h lifetime) | - |
| Rich text is filtered when rendered (no iframes/embeds, `<style>`, inline `style`, `id`, `data-*`) | embedded HTML disappears from pages | extend the allow-list in `packages/sdk/schema/src/sanitize.ts` |
| Generator refuses unsafe options, locales and fonts | error or silent fallback (`en`) instead of broken output | fix the data |
| Compose refuses to start without credentials; data ports on loopback | `docker compose` error naming the variable | set the three variables |
| 5xx bodies are generic in production | no SQL/stack text in error toasts | logs keep the detail |
| Public limits (search 120/min, query 600/min, all `/public` 3000/min per address) | 429 for a server-side rendering host | `PUBLIC_*_RATE_LIMIT_PER_MINUTE`, `TRUST_PROXY` |
| Outbound requests refuse loopback/metadata (and optionally private ranges) | gateway or AI endpoint on a local address refused | `OUTBOUND_ALLOW_HOSTS`, `OUTBOUND_ALLOW_LOOPBACK` |
| Asset visibility is enforced by default; `/public/**` is public | 404 without a session for assets outside a public folder | move them under `/public`, or `DAM_ENFORCE_ASSET_VISIBILITY=false` |
| Garage is the only S3 store in the stack for local/LAN; MinIO is removed | a fresh stack has no MinIO and the overlay is gone | `docs/release/operations/storage-backends.md` |
| Website export is a `.zip` (bundle version 2); import also accepts the old `.json` | the downloaded file has another extension and holds the asset files | - |
| Importing a website restores `published` only with `objects:publish` | pages and objects arrive as drafts (the report says how many were live) | grant the permission (F-052) |
| A gateway preset in `GATEWAY_PRESETS_PATH` replaces a built-in one with the same id; presets are read per request | a custom folder now overrides a vendor preset instead of listing it twice | rename the file's `id` to keep both |
| A public form's notification mail is sent only for the notify block an author saved in a form of a page | an e-mail that depended on a recipient or subject typed in the browser request no longer goes out; a confirmation to the visitor is limited to one plain address and 3 mails an hour per address | save the page (the block is read from the pages); see F-053 |
| Outgoing-mail passwords and API keys are encrypted at rest and need `MAIL_SETTINGS_ENCRYPTION_KEY` | saving an SMTP password or a provider API key answers 400 "MAIL_SETTINGS_ENCRYPTION_KEY is not set" | set the variable (`openssl rand -hex 32`) and restart; an old password keeps working and is encrypted at the next start (F-054) |
| The public sandbox (`SANDBOX_MODE`, `deploy/profiles/sandbox.env`) turns AI, mail, CDN mirror, imports and outbound HTTP off | 403 "disabled in the public sandbox" | only in a sandbox workspace; `SANDBOX_ALLOW_HOSTS` allows named hosts |

## 6. How to re-run everything

```
scripts/security/stack.sh up        # disposable stack (ports +100, own DB and volumes)
pnpm security:all                   # static scans, then the API suites; non-zero if either fails
pnpm security:browser               # Playwright XSS suite (needs Chromium: see scripts/security/README.md)
scripts/security/dast/run-zap.sh    # OWASP ZAP against the same stack (docker; --quick = passive only)
scripts/security/stack.sh down      # remove the stack and its volumes
```

New findings go into `findings.md` with the next id; a fix adds its failing test first. Accepted static findings
live in `scripts/security/static/baseline.json` with a reason and a review date (expired entries fail the run).
