# Security status - single summary

State at **2026-10-03**, commit `e760ea6` and later documentation commits. Source of detail:
`findings.md` (register F-001 ... F-044), `security-testing-plan.md` (plan), `manual-test-checklist.md`
(browser/terminal checks), `../../security/security-test-suite.md` (description of the automated suites, written
for reviewers), `scripts/security/README.md` (how to run).

## 1. Where we are

| | |
|---|---|
| Findings recorded | **44** (F-001 ... F-044) |
| By current severity | **8 High**, 21 Medium, 11 Low, 4 Info |
| Fixed in code | all 8 High; 19 of 21 Medium fully (the others: see section 3) |
| Automated checks | `pnpm security:api` **1027 tests / 16 files** green on a disposable stack; `pnpm security:static` **PASS** (audit, gitleaks, semgrep, shellcheck, trivy config, hadolint, against a baseline with review dates); `core` unit tests 122 |
| Runs leave evidence | `scripts/security/reports/<date>/api-*.txt/.json`, `static-*.txt/.json` (git-ignored) |

The High findings (all fixed): F-002 token embedded in git remotes, F-011 credentialed CORS reflection, F-020
images carrying `.env.*` and host logs, F-022 stored XSS through uploaded HTML/SVG, F-023 unauthenticated image
endpoints, F-024 private assets readable anonymously, F-033 unpublished content leaking through the public search,
F-039 code injection into generated sites.

## 2. What the tests cover (plan sections)

| Plan | Area | State |
|---|---|---|
| 3.1 | Authentication, sessions, lockout, password reset, MFA | done (`auth`, `mfa` suites) |
| 3.2 | Authorization: 196 routes x 5 identities, route contract/drift, publish permission | done (`authz-matrix`, `route-drift`, `limits-and-publish`) |
| 3.3 | Input validation / injection | public query, malformed ids/JSON, prototype keys covered; public filters run in JS, not SQL; **no SQL fuzzing of the remaining endpoints** |
| 3.4 | Public surface, drafts, preview tokens, forms | done (`public-surface`) |
| 3.5 | CORS, CSRF, security headers | done for the three services; **no CSP on the SPAs** |
| 3.6 | Stored/reflected XSS in browser sinks | **not automated** (needs Chromium); search XSS fixed and checked by hand; 46 `v-html` sites inventoried |
| 3.7 | Uploads, DAM, asset-processor | done (`uploads`) |
| 3.8 | SSRF / outbound requests | done (`ssrf`, `safeFetch` guard) |
| 3.9 | Gateway (site keys, limits, submit, helpers) | done (`gateway`, unit) |
| 3.10 | AI | provider keys never returned, per-user throttling; **prompt-injection impact not tested** |
| 3.11 | Publishing, generator, operator scripts | done (`publish`, unit) - generation and parsing only, **no `next build`/`nuxt build` of the output** |
| 3.12 | Secrets, config, infrastructure | secrets (gitleaks), Docker, compose exposure done; **nginx/TLS (`testssl`) and `trivy image` not run** |
| 3.13 | Dependencies | `pnpm audit` in the static scan, two accepted advisories (`xlsx`, `braces`) with review dates |
| 3.14 | Errors / logging | done (generic 5xx, SQL text hidden, log hygiene reviewed by hand) |
| 3.15 | Rate limits | login, MFA, forgot-password, forms, public search/query, AI, pwa subscribe done; **no load testing by design** |
| 7.1 | Periodic runs / CI | scripts, baseline and timestamped reports exist; **no CI workflow wired yet** |

## 3. Open items

| Item | Why it is open | Needs |
|---|---|---|
| **F-001** secrets of the old `.env.aura` in git history (private repo; the public mirror was deleted) | rotation depends on rebuilding the Oracle test instance | owner: rebuild Oracle with newly generated secrets (section 4) |
| **F-009** old env files already copied to Oracle by earlier deploys | `deploy.sh` is fixed, existing copies remain on the host | owner: remove `.env.*` copies on the host (done by the rebuild) |
| **F-003** `xlsx` (2 high advisories, write-only use, no npm fix) and `@tiptap/core` (major upgrade) | accepted / deferred, baselined until 2027-01-31 | decision: move to the SheetJS tarball or replace; plan the tiptap 3 upgrade |
| **F-008** remaining `v-html` sinks (rich text rendered as HTML by design) | needs browser automation | `npx playwright install chromium`, then the XSS sink suite (plan 3.6) |
| **F-014** CSP for the admin/editor SPAs (nginx) | postponed on purpose: becomes essential in SaaS mode; a too strict policy breaks the editor | design with a report-only phase when SaaS mode starts |
| **F-024** `DAM_ENFORCE_ASSET_VISIBILITY` is off by default | published sites load images through `/dam-asset`; most uploads are private by default | mark site assets/folders public, then switch it on (or decide the proxy is public by design) |
| **F-044** deleting a website can answer 500 | functional, not a security issue | fix when convenient |
| CI wiring, `trivy image`, DAST (ZAP baseline/API scan with `docs/api/openapi.yaml`), `testssl`, multi-tenant isolation tests | not part of the commands yet | plan 7.1 and phases 5-6 |

## 4. Actions that are yours (cannot be done from here)

1. **Rebuild the Oracle instance with fresh secrets** and rebuild its images (images built before F-020
   contain `.env.*` and host logs). Generate with `openssl rand -hex 32`: DB and S3 passwords,
   `MIGRATION_SOURCE_ENCRYPTION_KEY` (rotate even if you think it was never used: the example file held
   `my_secret_key_…`), `GATEWAY_AUTH_ENCRYPTION_KEY`, `DAM_SERVICE_TOKEN`, `SITE_API_KEY_PEPPER` (changing it
   invalidates all site keys: regenerate them), **new** `TOTP_ENCRYPTION_KEY` (keep it: losing it forces MFA
   re-enrolment), `SEED_ADMIN_PASSWORD`.
2. **Environment of every deployment** (all documented in `.env.example`): `WHOOBE_HOSTNAME` and, if admin, editor or
   sites live on other hosts, `CORS_ALLOWED_HOSTS` / `CORS_ALLOWED_ORIGINS`; `TRUST_PROXY=1` behind nginx (the
   login lockout and every limiter use the client address); `ADMIN_PUBLIC_URL` if the admin is not on
   `http://<host>:3000`; `OUTBOUND_ALLOW_PRIVATE=false` on internet-facing or multi-tenant installs.
3. **Pages with gateway forms**: save them again and republish the sites, then set
   `GATEWAY_REQUIRE_FIELD_ALLOWLIST=true` (F-029).
4. **Roles that publish**: grant `objects:publish` where it is intended; the permission is now enforced (F-035,
   `ENFORCE_PUBLISH_PERMISSION=false` restores the old behaviour).
5. **Development setup**: recreating `whoobe_postgres` / `whoobe_minio` publishes them on loopback only; add
   `WS_DATA_BIND_ADDRESS=0.0.0.0` to `.env` if a client on another machine needs them (F-043).
6. **Run the manual checklist** (`manual-test-checklist.md`) on the throwaway stack once, and report any KO.
7. Decide: F-024 flag, the `xlsx` replacement, and when to start the CSP work.

## 5. Behaviour changes introduced by the fixes (check these when something "stops working")

| Change | Symptom | Switch |
|---|---|---|
| Credentialed CORS only for an allowlist | browser "Failed to fetch" from an origin not on `WHOOBE_HOSTNAME` | `CORS_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` |
| `objects:publish` enforced | 403 when an editor changes `published` | grant the permission / `ENFORCE_PUBLISH_PERMISSION=false` |
| Image endpoints need a session or the service token | 401 from scripts that called `/api/v1/process` anonymously | `DAM_SERVICE_TOKEN` |
| Images over 100 MP refused | 413 on huge uploads | `ASSET_MAX_INPUT_PIXELS` |
| Reset password revokes sessions; reset tokens stored hashed | tokens issued before the upgrade stop working (1 h lifetime) | - |
| Generator refuses unsafe options, locales and fonts | error or silent fallback (`en`) instead of broken output | fix the data |
| Compose refuses to start without credentials; data ports on loopback | `docker compose` error naming the variable | set the three variables |
| 5xx bodies are generic in production | no SQL/stack text in error toasts | logs keep the detail |
| Public limits (search 120/min, query 600/min, all `/public` 3000/min per address) | 429 for a server-side rendering host | `PUBLIC_*_RATE_LIMIT_PER_MINUTE`, `TRUST_PROXY` |
| Outbound requests refuse loopback/metadata (and optionally private ranges) | gateway or AI endpoint on a local address refused | `OUTBOUND_ALLOW_HOSTS`, `OUTBOUND_ALLOW_LOOPBACK` |

## 6. How to re-run everything

```
scripts/security/stack.sh up        # disposable stack (ports +100, own DB and volumes)
pnpm security:all                   # static scans, then the API suites; non-zero if either fails
scripts/security/stack.sh down      # remove the stack and its volumes
```

New findings go into `findings.md` with the next id; a fix adds its failing test first. Accepted static findings
live in `scripts/security/static/baseline.json` with a reason and a review date (expired entries fail the run).
