# Release 0.3: what is left of "what Whoobe does not do" for those who run it for others

*Date: 2026-10-22. Status: **proposal, decisions of the owner recorded in section 8, nothing built.** The statements about the code were checked in the repository on this date (listed in section 1); the day estimates are ours and were not measured. They assume one developer and no product decision pending.*

Release 0.2 closed most of chapter 4.1, 4.5 and 4.6 of the [overview](../../release/overview/whoobe-overview.md): audit log, OIDC login, mandatory 2FA for chosen roles, a password policy, data subject tooling, readiness and metrics, more events, the release pipeline, the upgrade test and the restore rehearsal. See [release-0.2-plan.md](release-0.2-plan.md). This plan is about what is still missing when an agency or an operations team, and their security and procurement people, read chapter 4 and decide.

## 0. Name and objective

Working name: **Operate**. Whoobe can be run by someone else's operations team, with more than one replica, with a trail that answers "who tried to do what", and with proof of what was shipped.

It serves the verbs of the 0.2 plan: **validate** (rehearsed operations, load), **govern** (audit, sessions, identity), and it adds nothing to **orchestrate**.

## 0.1 The two buyers and one model (decided 2026-10-22)

**One codebase, MIT, no editions and no paid modules.** What the owner sells is **installation support and training**, not software. So there is no "enterprise edition": every item here ships in the same code, off or equal to today's behaviour by default (section 7). What differs is the **deployment profile** (A8) and the **services** around it (section 5.1).

1. **An agency** running several projects for different clients: one workspace per client, run by the agency's people, many workspaces on a few hosts.
2. **An enterprise** that wants its own stack and governs it: one workspace (or a few: production, staging), run by its own operations team.

Both run **on a private network (VPN or LAN) or on the public internet**. This changes the order of Block A: the agency needs to operate *many* workspaces, the enterprise needs *more than one replica* and a trail, and a private network needs the product not to assume the internet (block A7).

## 1. Where we are (facts checked on 2026-10-22)

| Fact | Where |
|---|---|
| Login failure counters, pending MFA challenges (`mfaToken`), TOTP replay guard, forgot-password counters and the public, search, query, form, upload, PWA and AI rate limiters live in process memory; a second replica changes behaviour and an MFA login can fail across replicas | `docs/release/operations/capacity-and-scaling.md` section 3 |
| `GATEWAY_RATE_LIMIT_BACKEND=redis` is accepted but not implemented (falls back to memory) | same, section 3 |
| Migrations run at start in core-api with no lock | same |
| `GET /metrics` exists in core-api only, off unless `METRICS_TOKEN` is set; `/health` (readiness, database) and `/health/live` exist in core-api only; asset-processor and gateway have a plain `/health` | `apps/core-api/src/server.ts`, `apps/asset-processor/src/server.ts`, `apps/gateway/src/router.ts` |
| No tracing, no per-request correlation id, no log retention policy | `docs/release/operations/observability-and-logging.md` section 6; no request id found in core-api |
| The audit log covers successful administrative actions only (no failed attempts, no Gateway administration) | `docs/release/operations/audit-log.md`, overview 4.1 |
| `release.yml` builds amd64 and arm64 images from a tag, signs them by digest with cosign (keyless) and attaches a source SBOM; **no** SLSA provenance attestation; tags and commits are not signed | `.github/workflows/release.yml`, `docs/release/security/supply-chain.md` |
| Sessions: database, 7 days; no list of sessions, no remote sign-out; no CSRF token; no full CSP on the admin and editor | `packages/core/src/auth/session.ts`, authentication page section 9 |
| One OIDC provider; no single logout; roles are refreshed only at a new sign-in | `docs/plans/system/oidc-login-plan.md` |
| The administration API (users, roles, settings, websites, pages) has no machine credential | overview 4.1 |
| Workspace scripts act on **one** workspace (`provision-workspace.sh`, `create-workspace.sh`, `remove-workspace.sh`, `backup-workspace.sh`, `restore-workspace-db.sh`, `enable-tls.sh`, `render-workspace-nginx.sh`); no script among those listed acts on all of them (to be confirmed when A7 starts). TLS is by `enable-tls.sh` and `renew-certs.sh` (certbot) | `scripts/` |
| Compose on a host is the only supported deployment; no managed-database variant, no HA reference | `docs/release/operations/README.md` ("Not covered yet") |

## 2. Principles for choosing

1. **Nothing here changes the data model of classes** (section 9 of the 0.2 plan stays true).
2. **A change that makes a state shared must keep one replica working exactly as today.** The default installation does not need Redis.
3. **An item is done when a test or a check says so.** A multi-replica claim without a multi-replica test is not a claim.
4. **What the 0.2 plan put in "Not to be built" stays there**: native SAML and LDAP, shared multi-tenancy, tamper-proof log storage, an operator for Kubernetes, our own automation engine.

## 3. Block A: Level 1, what stops a purchase

### A1. More than one replica

Follows the six steps already written in `capacity-and-scaling.md` section 4, in the order of importance given there.

| Item | Design | Done when | Days |
|---|---|---|---|
| **Challenges and counters out of memory** | Pending MFA and enrolment tokens, login and MFA failure counters, TOTP replay guard, forgot-password counters into the database (a table with an expiry, cleaned by a timer). The cheapest first, as the 0.2 plan says. | Two core-api replicas behind one proxy: a login whose password step hits A and code step hits B succeeds; the lockout threshold does not multiply | 5 |
| **Request limiters shared** | The public, search, query, form, upload, PWA and AI limiters through the same store; the gateway limiter gets the Redis backend the configuration already names. Redis is optional: without `REDIS_URL` the memory backend stays. | A test with two replicas shows one budget; the gateway limiter test passes with and without Redis | 3-5 |
| **Migration lock** | A PostgreSQL advisory lock around the migration step of core-api. | Two core-api starting together: one migrates, the other waits; a test starts both | 1 |
| **Connection sizing** | Document `pool max` per replica and a PgBouncer profile in a compose overlay. | The overlay starts and the suite runs through it | 1-2 |
| **Multi-replica test** | A compose overlay with two replicas of core-api and of the gateway, and the security API suite run through the proxy. | The suite is green on two replicas; the overlay is in CI on a tag | 3-4 |

### A2. High-availability reference and a managed database

| Item | Done when | Days |
|---|---|---|
| A compose variant that uses a managed PostgreSQL (`DB_HOST`, `DB_SSL=verify-full`) and an external object store, with a check that the stack starts without the data containers. | The variant starts; a restore from `rehearse.sh` works against it | 2 |
| A reference architecture page: replicas, proxy, database failover, object store, what is still a single point (nginx, the editor), RPO and RTO to be measured, not promised. | The page exists and lists what was tested | 1 |
| **Helm chart** (decision 2: yes; one workspace per release, so the agency installs it once per client). | `helm template` renders and a kind cluster passes the health checks | 5-8 |

### A3. A trail that answers "who tried"

| Item | Design | Done when | Days |
|---|---|---|---|
| **Failed attempts** | Failed login, failed MFA, a refused permission on an administrative route, a refused API client, written to the audit table with the same shape as today; no secrets, throttled so an attack cannot fill the table. | A test per kind; the dashboard filter shows them | 3 |
| **Gateway administration** | The administration routes of the Gateway (endpoints, routes, presets, API clients) go through `audited()` with an audit spec each. | The route contract test fails when a Gateway administration route has no spec | 2 |
| **Correlation id** | A request id in every service: taken from `X-Request-Id` when valid, else generated; in every log line, every audit row and the response header. | A request through nginx, core-api and gateway shows one id in all logs | 2 |
| **Tamper evidence** (decision 3: yes, if it has value; value stated in section 8) | A hash chain over audit rows, and a verify command. It is evidence, not storage that cannot be altered; the documentation says so. An optional export of audit events to a sink the operator controls goes with it. | Altering or deleting a row is detected by the verify command | 3-4 |

### A4. Observability

| Item | Done when | Days |
|---|---|---|
| `/metrics` and a readiness route in asset-processor and gateway, readiness including the object store. | The same `METRICS_TOKEN` rule as core-api; a test with the object store down returns 503 | 3-4 |
| Example alert rules (Prometheus) and a Grafana dashboard JSON for the metrics that exist. | The rules load in a throwaway Prometheus | 1-2 |
| OpenTelemetry tracing, off by default, for core-api and gateway, using the correlation id. | A trace of a page publish shows the services it crossed | 4-5 |
| A log retention policy: what is kept, where, for how long, and the setting for it. | Documented; `LOG_RETENTION_DAYS` applied to the files Whoobe writes itself | 1-2 |

### A5. Supply chain (implemented 2026-10-22, untested until the next tag)

| Item | Done when | Days |
|---|---|---|
| SLSA provenance attestation for the images in `release.yml` (GitHub build provenance). | `gh attestation verify` passes on a released digest | 1 |
| Signed tags and release commits (Sigstore `gitsign` or GPG, decided in the release process). | The release process requires it and the check is in the gate | 1 |

### A6. Operations that were rehearsed

| Item | Done when | Days |
|---|---|---|
| Restore of a destroyed workspace on the **reference host**, with the dated result recorded. | A dated line in `backup-restore-and-dr.md` | 1 |
| Upgrade and **rollback** of images on a real host with nginx (today the upgrade test covers the database and a login only). | A dated record, and the runbook corrected | 2 |
| Load test extended: a mix of endpoints, a run of at least 10 minutes, two replicas, uploads and publishing. | New figures and the machine in `capacity-and-scaling.md` | 2-3 |
| Repeat the dynamic scan and the manual checklist on the release commit (the release gate already asks for it). | A new report under `scripts/security/reports/<date>/` | 1 |

### A7. Many workspaces, and a private network

Both items serve the two buyers: the agency lives in the first, a VPN/LAN installation in the second.

| Item | Design | Done when | Days |
|---|---|---|---|
| **Fleet commands** (done 2026-10-22, `scripts/workspaces.sh`; acceptance test run on three real throwaway workspaces the same day: `upgrade` moved two, the one broken on purpose was reported, exit status 1. Finding: the workspaces of a host share one checkout, so `upgrade` checks the tag out once, and a canary means rebuilding one workspace first; the existing scripts recorded no actions) | `scripts/workspaces.sh` with `list`, `status`, `upgrade`, `backup` and `verify` acting on every workspace (or a named set) by calling the existing per-workspace scripts; one failing workspace does not stop the others and the exit code says which failed. No central database: the source of truth stays the `.env.<slug>` files. Every action is appended to a log of fleet actions (who, which workspace, which command, result) on the host; whether the existing per-workspace scripts already record anything is to be checked first. | Three throwaway workspaces: `upgrade` moves them to a new tag, one deliberately broken is reported and the others are up | 4-5 |
| **Workspace label in metrics and logs** (done 2026-10-22 for core-api and the logger; asset-processor and gateway have no `/metrics` yet, that is A4) | A `workspace` label on `/metrics` and in log lines, from one variable, so one Prometheus or one log store serves many workspaces. | Two workspaces on one scrape show separate series | 1 |
| **Private-network profile** | A `deploy/profiles/private.env` and a page: TLS from an internal CA instead of ACME, images from a private registry or a mirror, no outbound call needed to start (AI, mail provider, CDN and breached-password lookup off), `OUTBOUND_ALLOW_PRIVATE` as the operator chooses. First step is a check of what the stack calls on the internet at start and at run time. | A stack with no route to the internet starts, passes the health checks and the API suite | 4-6 |

**Private-network profile, first step done 2026-10-22: what the stack calls on the internet.** By reading the source (not yet by running a stack with no route out, which is the "done when"):
- *Server side, nothing at start.* No call to the internet was found in core-api, gateway or asset-processor start-up. At run time the only targets are the ones the operator configures: AI providers (`packages/core/src/ai/providers.ts`, `image-providers.ts`), OneSignal, Cloudflare Images, Figma, the mail provider. They are off until configured. There is **no breached-password lookup** in the code, so the plan's "breached-password lookup off" has nothing to switch off.
- *Browser side, a real gap.* The admin dashboard (`apps/admin-dashboard/index.html`: Google Fonts Inter and Material Icons), the editor (`apps/whoobe-one-spike/src/main.ts`, `useThemeStyles.ts`: Google Fonts) and the DAM preview (`DamAssetPreviewPanel.vue`: Office viewer and an Unsplash fallback image) load from public hosts. On a network with no route out the pages work but fall back to system fonts and the Material icons do not draw. Fix: serve Inter and Material Icons from the dashboard itself (a code change, to be decided), and publish sites with the fonts bundled (the `publish` and `mobile-app` CLIs and the mail document also emit Google Fonts links).
- *Placeholders.* `picsum.photos` is used as the placeholder image by the editor, the AI prompts and the site spec; offline the placeholders show as broken images.
- *Install and build, not run time.* The Dockerfile needs the npm registry (pnpm install) and the Debian/Alpine repositories (`apt-get`, `apk upgrade`); the compose files pull `postgres`, `valkey` and `nginx` by name. A private install builds or mirrors the images beforehand; `release.yml` already publishes them to a registry that can be mirrored. TLS: nginx uses certbot only on the public flow; an internal CA needs the certificate files placed by hand.
- Still to do: the profile file and the page, the font change, and the run with no route out.


### A8. Deployment profiles and an installation checklist

The owner sells installation: a repeatable install is margin, and an install that cannot be restored is a liability.

| Item | Design | Done when | Days |
|---|---|---|---|
| **Profiles `enterprise` and `private`** | `deploy/profiles/enterprise.env` (replicas, managed database, metrics on, retention set, mandatory 2FA for the administrator roles, OIDC) and `private.env` (A7), next to the existing `sandbox.env`. Each is only a set of values and a compose overlay: no code path depends on the profile name. | `provision-workspace.sh --profile enterprise` and `--profile private` create a workspace that starts and passes the suites | 2-3 |
| **Installation checklist and acceptance test** | One page per profile that an installer follows and signs: prerequisites, keys generated and backed up, TLS, backup and a **restore on a spare machine**, monitoring wired, first administrator, SSO. A script runs the checks that can be automated (`scripts/workspaces.sh verify`, A7) and prints a report to hand to the customer. | A fresh host reaches "accepted" following the page only, timed | 3 |

Level 1 total: **37-52 days**.

## 4. Block B: Level 2, asked often

| Item | Design | Done when | Days |
|---|---|---|---|
| **Machine credentials for the administration API** | A service token with scopes for the administration routes, created and revoked in the dashboard, audited, never able to create users or change roles. | A script administers a website without a user account; the authorization matrix has a row for it | 4-6 |
| **Sessions** | A list of the person's sessions and remote sign-out; an administrator can end the sessions of a user; the deactivation of a user ends them. | Tests for each; the OIDC limit ("a session already open runs to its end") is gone for deactivated users | 3-4 |
| **More than one OIDC provider; back-channel logout** | Providers become a list, each with its own claim mapping; the back-channel logout token ends the sessions of that identity. | A test with two mock providers; a logout token ends a session | 5 |
| **CSRF token** | A double-submit token on state-changing routes for cookie sessions; API clients and bearer calls are exempt. | The authorization matrix and the browser suite pass; a request without the token is refused | 3 |
| **Breached-password check** | k-anonymity range lookup, off by default because it is an outbound call (goes through the outbound guard). | A known-breached password is refused when the setting is on | 2 |
| **User manual and role guides** | Finish the chapters listed but not written; one short guide per role (editor, publisher, administrator, operator) that can be used as training material. English first; translation is the trainer's, from the same source. | The manual has no listed-but-empty chapter; a new editor completes the guide's tasks on the sandbox | 8-12 |
| **Per-class permissions** | **Out of this release** (decision 4): an ad hoc release with a plan of its own, because it touches every data route and the route contract. | A separate plan | 10-15 |
| **Content-Security-Policy** | Report-only first, then enforced; the editor loads the Tailwind browser build, so check whether a strict policy needs a compile step before promising. | Report-only for a release with a collector; no violation on the browser suite | 5-8 |
| **Upload antivirus** | A `clamd` sidecar behind a compose profile and a setting; off by default. | An EICAR file is refused in the API suite | 3-4 |
| **Request register and consent records** | A register of data subject requests with a deadline, an owner and a state; consent records for forms. Matching stays by the whole value. | The register shows open and late requests | 4-5 |

Level 2 total: **37-55 days** without per-class permissions.

## 5. Block C: conditional

### C1. A control plane for many workspaces (a separate application)

Asked 2026-10-22. For the agency profile, an application **outside every workspace** that governs the fleet and keeps its own audit. It is not built in this release and not before the fleet commands of A7 are in use; the trigger is the number of workspaces the agency actually runs (to be set by the owner; below roughly ten, the commands are enough).

What it is for: a list of workspaces with version, health, last backup and certificate expiry; provisioning, upgrade, backup, restore and removal as actions with an approval where wanted; **its own audit log of fleet actions** (who provisioned, upgraded, restored, removed, rotated a key or renewed TLS), which the audit of a single workspace cannot show because it happens above it; roles per client (who may act on which workspaces), which a workspace does not have.

Constraints that keep the isolation of `workspaces-plan.md` true:

- It reads **state and metrics only, never client content**: no connection to a workspace database, no call to a content route. It looks at the `workspace` label of the metrics and at the health routes (A4, A7).
- It acts on hosts through a **small agent on each host**, not through a web service holding the Docker socket or an SSH key to every host.
- Keys and `.env` values are kept in a **secrets store or a KMS**, not copied into the application.
- The audit of each workspace stays local and unchanged. The control plane adds a layer; it does not collect the workspaces' audits.
- It is the most valuable target of the whole installation (access to every client): it needs its own threat model, its own security suite and its own release, so it is a product of its own, not a package of this repository's services by default.
- The enterprise profile with one stack does not need it.

Done when (for its own plan): a threat model exists before the first line of code, the agent has the narrowest set of commands that serves the actions above, and a test shows that a compromised control-plane account cannot read a content route of any workspace.

### C2. The rest

OAuth2 authorization-code connectors (Google, HubSpot): refresh tokens with the existing encryption, one connector end to end first. SCIM provisioning (it is not in the 0.2 "not to be built" list, but the OIDC plan names it as not built): only if a buyer asks. The translation of the manual. A third-party audit or certification is **not an engineering item**: it needs a budget and a decision of the owner.

## 5.1 Services: installation and training (support deferred)

The services are the owner's; this section says what the product must give them, and what is left for the owner to write.

| Service | What the product provides | What the owner writes |
|---|---|---|
| **Installation** | The profiles and the checklist with its acceptance report (A8), the fleet commands (A7), restore and upgrade runbooks that were rehearsed (A6) | The scope of an installation, what the customer must have ready, what is billed |
| **Training** | The manual and the role guides (Block B), the sandbox, the example sites | The courses, the languages, who trains |
| **Support** | *Deferred by the owner (2026-10-22): no support offer for now, to be decided later.* Meanwhile: logs with a correlation id and the metrics (A3, A4), so a problem can be described and found; public issues for defects of the product | Nothing for now. When it is decided: what is covered, response times, who answers, for how long. Row "Support" of chapter 4.6 of the overview still says "to be stated by us" and is updated when these are decided; the plan does not invent them |

Defects found during an installation go to the public tracker and are fixed in the product, not in the customer's copy: a customer-specific patch is the way a second product starts.

## 6. Order of work

Each item is its own change, with its own CHANGES entry (decision 5).

1. A5 (provenance, signed tags): small, no decision needed.
2. A7 fleet commands and the workspace label, then A8 (profiles and the checklist, which use them): they make everything after it cheaper to roll out and to check on the agency's many workspaces.
3. A3 failed attempts, Gateway administration and the correlation id; then the hash chain.
4. A1 challenges and counters out of memory, then the migration lock; the multi-replica test comes with them, not after.
5. A4 metrics and readiness of the two other services; alert rules.
6. A1 shared limiters and the Redis backend; A2 the managed-database variant, the reference page and the Helm chart.
7. A7 private-network profile: start with the check of what the stack calls on the internet.
8. A6 rehearsals on the reference host, once the above is on `master`; the checklist of A8 is timed on them.
9. Block B as demand and time allow; the manual and role guides first, since training depends on them.

## 7. What does not change for the person who runs one replica

No new required service (Redis stays optional), no new required variable, no change in behaviour with one replica, and every setting that is added is off, or equal to today's behaviour, by default (the rule used for mandatory 2FA).

## 8. Decisions of the owner (2026-10-22)

1. **The buyers.** Two: an agency with several client projects, and an enterprise that wants its own stack and governs it; both on a private network (VPN or LAN) or on the public internet (section 0.1). Effect: block A7 added, fleet commands early.
2. **Helm chart.** Yes (A2).
3. **Hash chain over the audit log.** Yes, if it has value. The value: an auditor of the enterprise, or the agency's client, can check that rows were not altered or removed after the fact, which the database rule alone does not show. It does not prevent a person with database access from rewriting the chain and the tail; the documentation says so, and the export to a sink the operator controls is what covers that case. If a review finds the value smaller than the cost (3-4 days), the item is dropped and only the export stays.
4. **Per-class permissions.** An ad hoc release of their own, not in 0.3.
5. **One at a time.** Level 1 items ship one by one, each with its CHANGES entry.
6. **The business model.** One codebase under the MIT licence; the owner sells installation and training, nothing else; support is deferred. No edition, no paid modules (section 0.1).

## 9. Not in this plan

Native SAML or LDAP; several tenants in one installation; storage that cannot be altered; an operator for Kubernetes; a flow runner; a hosted service; an enterprise edition, paid modules or a second code line; changing the data model of classes. The documentation says so in chapter 4 and should keep saying it.
