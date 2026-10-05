# Security CI - what you get when you fork or clone Whoobe CMS

**Audience:** teams and companies that fork or clone this repository to run, extend or resell it, and the buyers,
security reviewers and compliance teams who evaluate them.

Whoobe CMS ships with a security verification pipeline as part of the source. It is not a separate product or a
paid add-on: it is the `security` workflow, the test suites under `scripts/security/` and the Dependabot
configuration, and they come with every fork. This page explains what that gives you in business terms and in
technical terms, and where its limits are.

> State described here: 2026-10-05. Counts and coverage change as the suites grow; every run publishes its exact
> numbers in its reports. For the detailed description of each test suite see
> [`security-test-suite.md`](security-test-suite.md); for the findings register and the open items see
> `docs/plans/security/`.

---

## 1. In one paragraph

Every pull request, every push to `master` and every night, a fresh, disposable copy of the whole system is built on
a CI runner with random credentials and attacked by about a thousand automated tests, a browser-based XSS suite, a
cross-workspace isolation suite, container and dependency scanners and a TLS check. A change that weakens
authentication, permissions, tenant isolation, upload handling or the container images turns the pipeline red
before it can be released. A fork inherits all of this on day one.

---

## 2. What runs, and when

Defined in `.github/workflows/security.yml`. Nothing in it needs secrets: the test stack is generated on the runner
with random credentials (`scripts/security/gen-env.sh`) and removed afterwards, with its volumes.

| Job | Runs on | What it does |
|---|---|---|
| **static scans** | every pull request, every push to `master`, nightly | Dependency advisories (`pnpm audit`), secret scanning over the whole git history (gitleaks), SAST (semgrep), shell lint (shellcheck), Docker and Compose configuration (trivy config, hadolint). Judged against a baseline of accepted findings, each with a reason and a review date |
| **API + browser suites** | push to `master` (relevant paths), nightly, manual | Builds and starts the system on a disposable stack, then runs the API security suites, the Chromium XSS suite and the container image scan (trivy image) |
| **workspace isolation** | push to `master`, nightly, manual | Starts two complete stacks standing for two customers and checks that nothing of one opens anything in the other |
| **TLS** | every pull request, push to `master`, nightly | `testssl.sh` against the production nginx TLS template, for two nginx versions |
| **DAST** | monthly, manual | OWASP ZAP active scan of the API routes of the three services, plus a passive baseline of the admin and editor web apps |
| **Dependabot** (`.github/dependabot.yml`) | weekly (npm, Docker), monthly (GitHub Actions) | Opens update pull requests, which the pipeline then verifies |

The same checks run locally, without GitHub, on any machine with Docker:

```bash
pnpm security:static      # scanners, no stack needed
pnpm security:all         # scanners, then the API suites on a disposable stack
pnpm security:browser     # Chromium XSS suite
pnpm security:isolation   # two stacks, cross-workspace isolation
pnpm security:tls         # nginx TLS template
pnpm security:images      # container image scan
```

---

## 3. What it checks (technical)

- **Authentication and sessions** - login, lockout, password reset (tokens stored hashed, sessions revoked), MFA.
- **Authorization** - every HTTP route of core-api, tested with five identities (anonymous, a user with no
  permissions, read-only, read-write and a users manager; the administrator is not swept because some routes are
  destructive). A *route contract* test fails when a route is added or changed without its permission
  being declared, which is the most common way a fork introduces an authorization hole.
- **Input handling** - malformed identifiers and JSON, prototype keys, public query parameters, error responses that
  must not leak SQL or stack traces.
- **Stored and reflected XSS** - rich text, uploaded HTML/SVG, admin lists and previews, form results, executed in a
  real browser rather than only inspected in code.
- **Uploads and asset storage** - type and size handling, private assets refused to anonymous requests, image
  processing limits.
- **Outbound requests (SSRF)** - the gateway, OpenAPI import and custom AI endpoints go through a guard that refuses
  loopback, metadata and (optionally) private ranges.
- **Tenant isolation** - sessions, accounts, roles, assets, the DAM service token, S3 credentials and database
  passwords of one workspace must not open anything in another.
- **Public surface** - drafts, preview tokens, unpublished content in public search, forms and rate limits.
- **Infrastructure** - published ports bound to loopback by default, compose files that refuse to start without
  credentials, container images scanned for fixable HIGH and CRITICAL vulnerabilities, TLS limited to 1.2/1.3 with
  forward-secret ciphers and HSTS.
- **Supply chain** - advisories in dependencies, secrets in history, base images pinned by digest.

Findings are tracked in a register (`docs/release/security/findings.md`); a fix lands together with a test that fails
without it, so a regression cannot return unnoticed.

---

## 4. Benefits for your business

- **No upfront build cost.** A comparable pipeline takes weeks to design and keep running. A fork starts with it
  already working, and with a history of what it caught.
- **Evidence for customers.** Enterprise buyers send security questionnaires: *do you scan dependencies, test
  authorization, isolate customer data, scan your images?* The answer can be a link to a pipeline and its reports
  instead of a statement.
- **Cheaper, calmer maintenance.** Dependency and base-image updates arrive as pull requests that are verified
  automatically, so they can be merged with confidence rather than postponed.
- **Safer customisation.** The usual fork changes - a new endpoint, role or field - are exactly what the route
  contract and the isolation suite check.
- **Multi-customer offerings.** If you host Whoobe for several customers, tenant isolation is the property you most
  need to be able to demonstrate, and it is tested continuously rather than reviewed once.
- **Less friction in audits.** The pipeline does not certify anything, but it gives an auditor or an external
  penetration tester a baseline to start from and a record of how issues were found and closed.

---

## 5. Limits, stated plainly

- **Not a certification, not a penetration test.** It proves that the behaviours encoded in the tests hold. It says
  nothing about what is not tested.
- **Known gaps** (see the status summary in `docs/release/security/status-summary.md`): prompt-injection impact of the
  AI features, fuzzing of every SQL-touching endpoint, real `next build` / `nuxt build` of generated sites, load
  testing, and a full Content-Security-Policy for the admin and editor web apps.
- **TLS** is tested on the nginx template, not on your live host. Run `testssl.sh` against your production
  hostname once HTTPS is enabled.
- **Accepted findings belong to this project.** The baseline (`scripts/security/static/baseline.json`) records
  advisories accepted *in this project's context*, with review dates. A fork must review them for its own use.
- **It only protects you while it runs.** A fork that stops merging upstream changes, disables the workflows or
  silences the tests keeps the files but loses the assurance.

---

## 6. Using it in your fork

1. **GitHub.** A fresh fork does not run workflows until you enable Actions in its *Actions* tab. Scheduled runs
   (nightly, monthly) come from the default branch; check GitHub's documentation for the rules that apply to your
   plan and repository visibility, including how long inactive repositories keep their schedules.
2. **Runner minutes.** The jobs that start Docker stacks are the longest (roughly 15 to 20 minutes for a full run).
   Check how this counts against your plan if the repository is private.
3. **Other Git hosts** (GitLab, Bitbucket, self-hosted). `.github/workflows/` is GitHub Actions only, but the
   suites are plain scripts (`pnpm security:*`) that run wherever Docker is available. Reproduce the job list of
   section 2 in your own pipeline.
4. **Review the baseline** and the open items in `docs/release/security/status-summary.md` before relying on the
   results.
5. **Keep it green.** Treat a red `security` run like a failing build: fix the change, or record an accepted
   finding with a reason and a review date. Do not delete the test.
6. **Add your own tests** for what you add. New findings go into the register with the next identifier; a fix adds
   its failing test first (see `scripts/security/README.md`).
7. **Before going live,** act on the items that only an operator can do: fresh secrets for every deployment,
   `TRUST_PROXY` behind a reverse proxy, correct CORS hostnames, HTTPS with a real certificate. They are listed in
   `docs/release/security/status-summary.md` (section 4) and in the workspace guide
   (`docs/release/operations/creating-workspaces.md`).
