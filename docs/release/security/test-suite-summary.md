# Automated security test suite - summary

One-page summary for readers who do not need the detail. Whoobe 0.1.0, counts taken on **2026-10-09**. The full
description of every suite is in [`security-test-suite.md`](security-test-suite.md); how to run them is in
`scripts/security/README.md`; the state of the findings is in [`status-summary.md`](status-summary.md).

Automated tests run against a disposable stack (its own database, object storage and secrets) on every push to master,
nightly, and before every release. They verify controls; they do not prove the absence of bugs.

```
┌───────────────────────────────┐ ┌───────────────────────────────┐ ┌───────────────────────────────┐
│ 1 · API & AUTHORIZATION       │ │ 2 · BROWSER & CONTENT         │ │ 3 · STATIC ANALYSIS           │
│ Claim: black-box tests        │ │ Claim: real Chromium,         │ │ Claim: code, dependency and   │
│ against running services      │ │ hostile payloads              │ │ container image scanning      │
├───────────────────────────────┤ ├───────────────────────────────┤ ├───────────────────────────────┤
│ 1359 tests · 24 files         │ │ 30 tests · 18 specs           │ │ dependency audit · gitleaks   │
│                               │ │                               │ │ semgrep · shellcheck · hadolint│
│ · 1101 checks: 262 routes ×    │ │ · XSS in the editor, published│ │ trivy (config + images)       │
│   5 identities                │ │   pages and admin lists       │ │ testssl.sh (TLS 1.2/1.3)      │
│ · 182 function-permission     │ │ · file upload in forms        │ │                               │
│   tests (90 content routes)   │ │ · editor, navigation, UI      │ │ Accepted findings carry a     │
│ · 4 route-contract tests      │ │                               │ │ review date: an expired entry │
│   (static scan of the routes) │ │                               │ │ fails the run                 │
│ · login, MFA, CORS, SSRF,     │ │                               │ │                               │
│   uploads, rate limits, forms,│ │                               │ │                               │
│   gateway                     │ │                               │ │                               │
└───────────────────────────────┘ └───────────────────────────────┘ └───────────────────────────────┘

┌───────────────────────────────┐ ┌───────────────────────────────┐ ┌───────────────────────────────┐
│ 4 · LOGIC & UNIT              │ │ 5 · WORKSPACE ISOLATION       │ │ 6 · DAST                      │
│ Claim: pure functions and     │ │ Claim: two stacks side by     │ │ Claim: active scan with       │
│ validators                    │ │ side                          │ │ OWASP ZAP                     │
├───────────────────────────────┤ ├───────────────────────────────┤ ├───────────────────────────────┤
│ 276 security unit tests       │ │ 14 tests · 2 stacks           │ │ 154 routes attacked with an   │
│ 295 core tests                │ │                               │ │ admin session; passive        │
│  59 SDK tests                 │ │ Credentials and data of one   │ │ baseline of both web apps     │
│                               │ │ workspace do not work in the  │ │                               │
│ Operator scripts, upload      │ │ other                         │ │ Required on the release       │
│ limits, sanitization,         │ │                               │ │ commit (release gate)         │
│ encryption, roles             │ │                               │ │                               │
└───────────────────────────────┘ └───────────────────────────────┘ └───────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│ TOTAL  2033 automated tests (1359 + 276 + 295 + 59 + 30 + 14)     │
│ + 46 integration tests on a disposable database, run separately   │
│ Result: all passing · 59 findings recorded, all High fixed        │
│ Not covered: full SQL fuzzing, load testing, malware scanning of  │
│ uploads, generated sites in a browser                             │
└───────────────────────────────────────────────────────────────────┘
```

## How the numbers were obtained

| Figure | Source |
|---|---|
| 1359 API tests, 24 files | `vitest run --config scripts/security/vitest.config.ts api` |
| 182 function-permission tests | `api/granular-permissions.test.ts`: for each of the 90 content routes, a user holding only that function key passes, users holding another action or another area get 403 |
| 1101 authorization checks, 4 route-contract tests | `api/authz-matrix.test.ts`, `api/route-drift.test.ts` against `scripts/security/routes.expected.json` (262 core-api routes) |
| 276 security unit tests, 22 files | the same command with `unit` |
| 295 core tests | `pnpm --filter @whoobe-cms/core test` (26 more are integration tests that need a database and are skipped without one) |
| 59 SDK tests | renderer 46, Vue 7, React 6 |
| 30 browser tests, 18 specs | `playwright test --config scripts/security/playwright.config.ts` |
| 14 isolation tests | two stacks, `pnpm security:isolation`; count from the last full run, not repeated on 2026-10-09 |
| 154 DAST routes | `scripts/security/dast/run-zap.sh`; figure from the last run, which **predates the features of 2026-10-08/09** |
| 46 integration tests | mail settings 17, credential encryption 6, website portability 23, on a disposable PostgreSQL |

## Reading the claims correctly

- The **route-contract** tests find routes by a text scan of `apps/core-api/src/server.ts` (a regular expression on
  `app.<verb>(`), not by parsing the code. A route registered another way would not be seen. Only core-api is covered;
  asset-processor and gateway are covered by their own suites and by the DAST scan.
- The **static** tools and their pass criteria are listed in [`security-test-suite.md`](security-test-suite.md).
- **DAST** and the manual checklist must be repeated on the release commit (`scripts/release.sh check` requires the DAST run).
- The count is a snapshot: re-count before quoting it outside this repository.
