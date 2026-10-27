# Release 0.4: "Operable", and the enterprise installation funded on request

*Date: 2026-10-27. Status: **proposal, decisions of the owner recorded in section 6, nothing built.** Follows decision 7 of
`release-0.3-plan.md` (the Level 1 items not built in 0.3 move to a 0.4 plan). The statements about the code were checked in the repository
on this date (section 1). Day estimates are the ones of the 0.3 plan, re-read against today's code; they are estimates, not commitments.*

## 0. Objective

0.4 makes every installation, of any size, **installable the same way twice, checkable and restorable**, and gives the installer
(the owner sells installation and training, `release-0.3-plan.md` section 0.1) the material to do it: the trail of a request across the
services, rehearsed restore and rollback, an installation checklist, the user manual and the role guides. Nothing in it needs a particular
buyer.

The items that only an organisation running a high-availability infrastructure needs (several replicas, Helm, a managed database,
tracing, a hash chain over the audit log) are **not** built speculatively: they are described with their estimates in section 4 and built
when an organisation funds them. Section 5 says how, and what does not change: **the code stays MIT, one codebase**.

## 1. Where we are (checked 2026-10-27)

| Fact | Where |
|---|---|
| 0.3.2 is the latest release (publisher image fix, F-063). On `master` since: the AI usage per user and the retention of the AI history (F-064), not released. | `release-notes-0.3.2.md`, `CHANGES.md` |
| The audit row stores `X-Request-Id` when a request carries one; no service generates it, no log line carries it, nginx does not set it, the gateway only redacts it. | `apps/core-api/src/audit.ts`, `apps/gateway/src/redact.ts`, `deploy/nginx/` |
| Failed logins, failed MFA, refused permissions and refused API clients are not written to the audit table. | `apps/core-api/src/server.ts` (no such action) |
| The Gateway's administration routes have no audit spec. | `apps/gateway/src/` |
| asset-processor and gateway have no `/metrics` and no readiness route; core-api has both. | the three `server.ts` |
| Profiles: `sandbox.env` and `private.env` exist; `enterprise.env` does not. No installation checklist. | `deploy/profiles/` |
| Restore rehearsed once, 2026-10-18, on a development machine (WSL2); never on the reference host. Image rollback never tried; the upgrade test covers the database and a login. | `operations/backup-restore-and-dr.md` "Rehearsed" |
| User manual: chapters 3 to 7 written, at least ten listed as *planned*. Role pages exist (`by-role/`), task guides per role do not. | `guides/user-manual/README.md` |

## 2. Before 0.4: release 0.3.3

The AI usage feature is on `master`, tested in CI and tried on the local stack with a real provider (OpenRouter images). Release it as
**0.3.3** (release notes, tag, upgrade of the reference host) instead of holding it for 0.4. Still to try before the tag: the text
functions (generation, wizard, page translation) against a real provider.

## 3. What 0.4 contains

### 3.1 A3: the trail of a request (part of it)

| Item | Design | Done when | Days |
|---|---|---|---|
| **Correlation id** | nginx sets `X-Request-Id` when absent (`$request_id`); each service takes it when valid (length, charset), else generates one; it is in every log line, every audit row and the response header, and is passed on by the gateway to the upstream and by core-api to the asset-processor and the publisher. | One request through nginx, core-api and gateway shows the same id in the three logs and in its audit row | 2 |
| **Failed attempts** | Failed login, failed MFA, a refused permission on an administrative route, a refused API client: an audit row each, same shape as today, no secret (no password, no code, no key); throttled per ip and action so an attack cannot fill the table. | A test per kind; the throttle is tested; the audit filter shows them | 3 |
| **Gateway administration audited** | The administration routes of the Gateway (endpoints, routes, presets, API clients) go through `audited()` with a spec each. | The route contract test fails when a Gateway administration route has no spec | 2 |

The hash chain over the audit log (decision 3 of 0.3) is in section 4: its value is for an external auditor, which is an enterprise need.

### 3.2 A4: the cheap part of observability

| Item | Done when | Days |
|---|---|---|
| `/metrics` and a readiness route in asset-processor and gateway (readiness includes the object store), same `METRICS_TOKEN` rule as core-api. | A test with the object store down returns 503 | 3-4 |
| A log retention policy and `LOG_RETENTION_DAYS` for the files Whoobe writes itself. | Documented and applied | 1-2 |

### 3.3 A6: operations rehearsed on a real host

| Item | Done when | Days |
|---|---|---|
| Restore of a destroyed workspace on the **reference host** (Oracle), with the data size and the time it took. | A dated line in `backup-restore-and-dr.md` | 1 |
| Upgrade and **rollback** of the images on the reference host with nginx. | A dated record, the runbook corrected where it was wrong | 2 |
| Dynamic scan and the manual checklist repeated on the release commit. | A report under `scripts/security/reports/<date>/` | 1 |

### 3.4 A8: the installation checklist (for the profiles that exist)

| Item | Design | Done when | Days |
|---|---|---|---|
| **Installation checklist and acceptance test** | One page per existing profile (single host, `private`, `sandbox`) that an installer follows and signs: prerequisites, keys generated and backed up, TLS, backup **and a restore on a spare machine**, monitoring, first administrator, SSO when used. A script runs the automatic part and prints what is left to check by hand. | The checklist is timed on the A6 rehearsal; the script passes on the reference host | 3-4 |

The `enterprise` profile depends on section 4 (replicas, managed database) and comes with it.

### 3.5 The manual and the role guides

| Item | Done when | Days |
|---|---|---|
| The *planned* chapters of the user manual written, in the order a new editor needs them (data objects, assets, AI authoring, forms first). | No chapter listed as planned | 6-8 |
| One task guide per role (editor, publisher, administrator, operator), usable as training material. | A new editor completes the editor guide's tasks on the sandbox | 2-4 |

### 3.6 Total

About **26-34 days**. Order: 3.1 (it helps diagnose everything after it), 3.2, 3.3 on the reference host, 3.4 timed on 3.3, 3.5 alongside.
Each item is its own change with its own `CHANGES.md` entry (decision 5 of 0.3).

## 4. Enterprise installation: built when funded

What an organisation running its own high-availability stack needs. The estimates are kept here so a request can be answered with a figure.

| Item | Design (as in `release-0.3-plan.md` A1, A2, A3, A4) | Days |
|---|---|---|
| **More than one replica (A1)** | Challenges and counters out of memory (MFA, login, TOTP replay, forgot-password) into the database; request limiters through a shared store, Redis optional; a PostgreSQL advisory lock around the migrations; pool sizing and a PgBouncer overlay; a two-replica overlay with the security suite in CI on a tag. | 12-16 |
| **Managed database and reference architecture (A2)** | A compose variant without the data containers (`DB_SSL=verify-full`, external object store), a reference architecture page with what was tested. | 3 |
| **Helm chart (A2)** | One workspace per release; `helm template` renders and a kind cluster passes the health checks. | 5-8 |
| **Tracing (A4)** | OpenTelemetry, off by default, core-api and gateway, on the correlation id of 3.1. | 4-5 |
| **Alert rules and dashboard (A4)** | Prometheus rules and a Grafana dashboard for the metrics that exist. | 1-2 |
| **Hash chain over the audit log (A3)** | A chain over audit rows, a verify command and an export to a sink the operator controls; evidence, not storage that cannot be altered. | 3-4 |
| **Profile `enterprise` (A8)** | `deploy/profiles/enterprise.env` and its checklist page, on top of the items above. | 1-2 |
| **Load test on two replicas (A6)** | A mix of endpoints, at least 10 minutes, uploads and publishing; figures in `capacity-and-scaling.md`. | 2-3 |

About **31-43 days** in all; an organisation usually needs a subset (for example A1 and Helm).

## 5. How funded work is done (the code stays MIT)

1. **One codebase, MIT.** What is funded is merged into this repository and published under the MIT licence in the release after its
   delivery. No private branch, no edition, no paid module, no delayed publication: a second code line is what decision 6 of 0.3 excludes.
2. **"Enterprise" is an installation profile, not an edition**, like `sandbox` and `private`: settings, documents and tests in the same code.
3. **What the sponsor pays for**: the development, with priority and a date, in the generic form that fits their infrastructure.
   Not exclusivity: other users get the same code. For now the owner works on the codebase only: installation, training and support
   are not offered with funded work (they stay as described in `release-0.3-plan.md` section 0.1, for when the owner offers them).
4. **No maintenance commitment.** Funded work is delivered and verified, nothing more is promised to the sponsor. So that it does not
   silently stop working, each item enters with an automatic check in CI where one is cheap (`helm template` and a kind cluster for the
   chart, the two-replica overlay for A1), and the documentation states the version in which it was last verified. An item whose check
   cannot run in CI is marked *verified in version X* and is re-checked only when someone needs it.
5. **The sponsor's infrastructure stays out of the repository.** Only the generic part enters: the profile, the chart, the tests on a
   throwaway cluster. Host names, addresses, keys and the sponsor's own configuration stay with the installation.
6. **Credit**, if the sponsor wants it: in the release notes and on the community page.

`community/why-sponsor-and-contribute.md` (3.2 and 3.3) already says that the licence does not change and that a funded feature is agreed
with the author directly; it should link this section once the decisions below are taken.

## 6. Decisions of the owner (2026-10-27)

1. **The codebase stays MIT.** The enterprise installation (section 4) is built and released when it is sponsored or funded, always under
   the MIT licence, in the one codebase.
2. **No maintenance and no services with funded work, for now.** The owner works on the codebase only: a sponsor funds development;
   the safeguard is a check in CI and the "verified in version X" note (section 5, points 3 and 4).
3. *To decide:* 0.3.3 for the AI usage feature before 0.4 (section 2).
4. *To decide:* the scope of 0.4 as in section 3, or with an item of section 4 moved in if an organisation is already asking for it.

## 7. Not in this plan

Per-class permissions (their own release, decision 4 of 0.3); the control plane for many workspaces (C1 of 0.3, only past about ten
workspaces); Whoobe in front of existing backends (`api-gateway/gateway-for-existing-backends.md`, a proposal); the Level 2 items of 0.3
(sessions, machine credentials, several OIDC providers, CSRF token, breached passwords, CSP, upload antivirus, request register) except the
manual, which is in 3.5: they are taken as demand and time allow. Support stays deferred.
