# Release 0.2: what to do about "what Whoobe does not do", modularity, and the editor preview

*Date: 2026-10-17. Status: **proposal, nothing built.** Statements about the code were checked in the repository on this date; the ones that were
not are marked **(not verified)**. Source of the list of limits: `docs/release/overview/whoobe-overview.md`, chapter 4. This plan does not decide the
scope of the release: section 8 lists what the owner has to decide.*

## 0. Name and objective of the release

**Name: "Conduct".** One word, three senses that are the three verbs: to conduct an orchestra (**orchestrate**), to conduct a test or an inspection
(**validate**), and to conduct the affairs of an organisation, its code of conduct (**govern**). Whoobe conducts the calls and the data of one
organisation; it does not play the instruments (the automation engine of the operator's choice does).

**Objective.** After this release each verb has a **proof a reviewer can check**, not only a sentence on a web page:

| Verb | What it must mean in the product | Proof (from the blocks below) |
|---|---|---|
| **Validate** | Everything that enters, leaves or is released is checked against a contract that a test can fail. | A1: the upgrade test, the restore rehearsal, the load figures. C2 step 1: the editor and the renderer compared on the same trees. B3 step 2: the route contract per module. The contracts of the data (Zod) and of the integrations (OpenAPI) already exist and stay. |
| **Govern** | Who changes what, who publishes, who calls, and what is left behind, can be shown. | A2: the audit log of administrative actions, OIDC login, mandatory 2FA, data subject tooling, readiness and metrics. B3: the "no Content" profile (run only what you need). A3 if asked: permissions per class. |
| **Orchestrate** (the calls, not the flows) | Whoobe tells an engine that something happened, reliably, and a flow can answer without starting itself. | A2 "more events"; D2: the wizard exports a working Node-RED flow and the conventions are one page. The delivery log, retries, signature and loop guard already exist. |

A sentence is allowed on the site for a verb only when its proof is in the release. Today "govern" is the weakest (no audit log, no SSO, no mandatory
2FA): the release is not called *Conduct* until A2 is in.

The **name is not the version number**: the number (0.1.1, 0.2.0) is still decision 1 of section 8.

## 1. Where we are (facts)

- `master` is **65 commits ahead of the tag v0.1.0** (2026-10-14). The release documentation describes some of them: object events and their delivery
  log, the Node-RED guide, the Objects list changes, the conversion of Markdown / rich-text fields in generated sites. The README says so and the
  object events and Node-RED guides carry a note "not in the v0.1.0 tag". The first question of the release is therefore *what the next version is
  called* (0.1.1 or 0.2.0, section 8).
- While the version starts with 0, a minor release may change behaviour (release notes). Object events add a migration (`0059`) and a worker in the
  Gateway: that is more than a patch.
- core-api has **228 routes in one file** (`apps/core-api/src/server.ts`, 6,824 lines). About 90 to 100 of them belong to the Content area (websites,
  pages, snippets, themes, templates, kits, paths, documentation sites, search); the rest is data, assets, events, users and infrastructure.
- The editor draws pages with its **own components** (canvas, preview, preview sites). It shares only helper modules with `@whoobe-cms/renderer`
  (animations, collapse, selection). The documentation used to say "same renderer"; it was corrected on 2026-10-17 after a Markdown field bound to an
  element was converted in the preview and shown as source in a generated site.
- The chapter 4 rows "machine credentials" and "a form is the only trigger" were out of date (API clients and object events exist) and were corrected
  on the same day.

## 2. Principles for choosing

1. **Do what the design decisions allow.** Whoobe is self-hosted, one organisation per instance, MIT, with editors who are trusted, and it has no
   automation engine of its own. A limit that follows from those decisions is not a gap.
2. **Close what stops an evaluation first.** The items that make a security officer or an IT manager stop reading (SSO, audit log, "untested upgrade").
3. **One person maintains this.** Each feature has a yearly cost in tests, documentation and fixes. Prefer one mechanism reused (the events table, the
   API-client token validation) to a new one.
4. **A plan item is done when a test or a check says so**, not when the code exists.

## 3. Block A: what Whoobe does not do

### A1. Do first: maturity of the project (chapter 4.6)

| Item | Done when |
|---|---|
| **Upgrade test.** A script installs the previous release, loads data, upgrades to the current tree, runs the migrations and logs in. | Runs in CI on every release candidate; fails when a migration breaks existing data. Needs v0.1.0 as the "N-1". **Script written and passing 2026-10-18** (`scripts/upgrade/upgrade-test.sh`); `.github/workflows/upgrade.yml` runs it on a `v*` tag and by hand; it passed once on GitHub on 2026-10-18 (v0.1.0 to master). **A1 upgrade test: done.** |
| **Restore rehearsal.** Restore a backup (database and bucket) on a spare machine; record the date and what was missing. | The runbook in `operations/backup-restore-and-dr.md` carries a dated "rehearsed" line; the bucket backup is covered by a script or a documented tool. **Done 2026-10-18 on a throwaway workspace** (`scripts/restore/rehearse.sh`, `scripts/backup-workspace-bucket.sh`); a rehearsal on a real spare host with real data sizes stays with the operator. |
| **Release pipeline.** `release.yml` builds the images for amd64 and arm64, attaches an SBOM, signs with cosign and publishes the GitHub Release from a tag. | A tag produces the images, the SBOM and the notes without a manual step; `release-process.md` loses the "not built yet" paragraph. |
| **Load test.** A k6 (or equivalent) script for public pages, the public query API, a client call and a login, on the reference machine. | The figures and the machine are in `capacity-and-scaling.md`; the "no load test" row of chapter 4.2 is rewritten with numbers or narrowed. **Done 2026-10-18 for four endpoints on a development machine** (`scripts/load/`, section 2.1 of the capacity page); the figures on the reference arm64 VM, and uploads, are still to measure. |
| **Repeat DAST and the manual checklist** on the release commit. | A new report under `scripts/security/reports/<date>/` and the status summary updated. |

### A2. Do next: what a security officer asks (chapters 4.1 and 4.5)

| Item | Design | Done when |
|---|---|---|
| **OIDC login for staff.** | Authorization-code with PKCE against any OIDC provider; roles mapped from a claim or assigned on first login. The token validation code of the API clients (`apps/gateway/src/jwt-verify.ts`, `packages/core/src/gateway/client-jwt.ts`) is the starting point, the login flow is new. Local accounts stay (break-glass). SAML and LDAP are **not** built: a broker (Keycloak) covers them. | Login with Keycloak in the disposable stack; a deactivated user at the provider cannot start a new session; tests for the mapping and for a forged token. **Done 2026-10-19** (`plans/system/oidc-login-plan.md`; `api/oidc-login.test.ts` against a mock provider that forges nine kinds of token, `browser/oidc-keycloak.spec.ts` against a real Keycloak 26). |
| **Mandatory 2FA and a password policy.** | A setting (`require 2FA for roles X`) and a minimum policy; enrolment is forced at the next login. | A user without a second factor is led to enrolment; tests in `mfa.test.ts`. **Done 2026-10-19** (`plans/system/mandatory-2fa-plan.md`; tests in `api/mfa-required.test.ts` and `browser/mfa-enrolment.spec.ts`, since the original `mfa.test.ts` covers the optional flow). |
| **Audit log of administrative actions.** | Append-only table; one write per user, role, website, setting and publish change, with actor, object, before and after (no secrets); a read-only list for administrators; retention configurable. | Every route that changes users, roles, websites or settings writes a row (a test walks the route contract and fails for a new route without a decision); the status summary drops the "no audit log" row. |
| **Data subject tooling.** | Export and erase by a field value (an e-mail) across form submissions and objects; a retention job configured per class; files of a deleted submission removed. | A documented, tested procedure that removes a person from the demo data; chapter 4.5 is rewritten. |
| **Readiness and metrics.** | `/health` checks the database (liveness stays cheap); a `/metrics` endpoint (Prometheus format) behind the service network. | A health test with the database down returns 503; a scrape shows request counts and queue depth. **Done 2026-10-19 for core-api** (`/health` readiness, `/health/live`, `/metrics` behind `METRICS_TOKEN`; `api/readiness-metrics.test.ts` stops the test database and checks the 503 and the recovery); asset-processor and gateway keep liveness only. |
| **More events.** | `asset.*` and `page.published` through the same events table, delivery and loop guard as object events. | Tests like `object-events-loop-guard.integration.test.ts` for each new type; the object events guide lists them. |

### A3. Maybe, with a condition

| Item | Condition |
|---|---|
| Permissions **per class** (not per website) | A real PIM user asks (see block B). Touches every data route: needs a plan of its own and a route-contract extension. |
| OAuth2 authorization-code connectors (Google, HubSpot) | Refresh tokens stored with the existing encryption (`INTEGRATION_SECRETS_ENCRYPTION_KEY`), one connector end to end first. |
| State of the services out of process memory (login limits, 2FA challenges) | Someone needs more than one replica. Cheapest first: the challenges into the database. |
| Antivirus for uploads | A `clamd` sidecar behind a compose profile and a setting; off by default. |
| A full Content-Security-Policy on the admin and editor | Report-only first. The editor loads the Tailwind browser build, so a strict policy needs a compile step: check before promising. |
| Third-party audit or certification | A budget (sponsors). Not an engineering item. |

### A4. Not to be built

Shared multi-tenancy and per-division isolation (separate workspaces cover it); an automation engine of our own and a visual editor for flows;
visitor personalisation and segmentation; access to private content after a form; mass e-mail, web analytics and A/B tests inside Whoobe; native
SAML and LDAP; tamper-proof log storage; an official Kubernetes operator. Each of these contradicts a design decision or needs another product and
another team. The documentation says so in chapter 4 and should keep saying it.

## 4. Block B: modularity (PIM / MDM, DAM and Integrations without Content)

### B1. What a "data and integrations" installation needs

Classes and objects, assets, the Gateway (Integrations, API clients, object events), users and settings. It does **not** need: the editor container
(`whoobe-one-spike`), websites, pages, snippets, themes, templates, kits, publishing, documentation sites, the mobile app generator, the AI page
generator. Two things look like Content but are used by data: **forms** (a page-builder element that stores submissions as objects) and **mail
templates** (written in the editor); an installation without Content has neither, and says so.

### B2. Options

| | Profiles of configuration | Profiles and routers per area | Separate products |
|---|---|---|---|
| What | `WHOOBE_MODULES=data,dam,integrations`: menu hidden, routes answer 404, editor container not started (compose profile) | The same, with `server.ts` split into one router per area, mounted by the profile | Whoobe Data, Whoobe Gateway... |
| Cost | low | medium to high (a large refactor, in small steps) | very high |
| Gain | smaller visible product, less surface | routes really absent; a smaller, testable core-api | clearer messages |
| Risk | combinations multiply tests and documentation; tables stay empty | refactor regressions (the route-drift test guards the contract) | duplication; the unified model, permissions and credential place are lost |

### B3. Proposal

1. **One profile, "no Content"**, as a configuration (first column). Steps: (a) a `modules` setting read by core-api and the dashboard; (b) the
   dashboard hides Websites, Pages, Snippets, Themes, Publish, Components that serve pages, Documents, AI page tools; (c) core-api answers 404 for the
   Content routes when the module is off; (d) a compose profile leaves out `whoobe-one-spike`; (e) `provision-workspace.sh --modules ...`.
2. **Tests:** the route contract gets a `module` field per route; the authorization sweep runs once with all modules and once with "no Content", and
   fails when a route of an off module answers anything but 404.
3. **Routers per area** in later releases, starting with the areas that change most (events, data objects), not in 0.2.
4. **Do not split into products.**

### B4. What a PIM user would still miss (say it in the positioning)

Permissions per class; import from CSV, JSON and XLSX (only Pimcore today; the documentation lists the others as "not yet"); bulk edit; variants and
completeness scoring; filters that run in the database (today in the application: "thousands of objects comfortably", `docs/release/by-role/data-owners.md`).
A "no Content" installation is honest for **small catalogues, assets and integrations**; for large ones the items above come first. Minimal PIM set to
consider for 0.3: CSV/XLSX import with a mapping, export, and indexed filters on a few declared fields.

### B5. Done when

A workspace provisioned with the no-Content profile starts without the editor container, shows only the data, assets and integrations areas, answers
404 for every Content route, passes the authorization sweep and the isolation tests, and the documentation has a page for it with its limits.

## 5. Block C: the editor preview follows the published output

### C1. The problem

Two implementations of "draw this tree": the editor's components and `@whoobe-cms/renderer` with the framework adapters. They are kept in step by
hand. The Markdown case (a bound field converted in one and not in the other) is the visible example; any new element or binding can repeat it.

### C2. Steps, smallest first

1. **A shared test.** A fixture set of trees (all element kinds, each binding type, each field type) rendered by both and compared as normalised HTML.
   It fails today where they differ; the list is the real size of the problem. *(This is the first thing to do and needs no change in the editor.)*
2. **"Published view".** A button in the editor (and in the preview sites) that renders the page with the Vue adapter of the SDK in a frame: the real
   output, next to the canvas. It also gives the optional "HTML" tab (a read-only view of the generated markup).
3. **Converge** the preview onto the renderer, element by element, as the fixtures pass. The canvas keeps its own components (it needs selection and
   dragging); only the preview and the preview sites change.

### C3. Done when

Step 1: the comparison runs in CI with a list of known differences that only shrinks. Step 2: a page opens in the published view from the editor.
The documentation can say again that the preview is the renderer, for the parts that converged.

## 6. Block D: flows for Node-RED without a new language

*Added 2026-10-17 after the question "describe a Node-RED flow in YAML?".*

### D1. The question and the answer

A YAML description of a flow is attractive for people who keep flows in the repository: `flows.json` has coordinates and ids, so every edit in the
editor gives a large, unreadable diff (the example flow's diff on the owner's machine is +183 / -8 lines). The costs of a **product** feature are real:
the generated flow cannot be read back into the YAML once it is edited in the Node-RED editor; a description language has versions, documentation and
tests, and its scope grows by itself; and a YAML for one engine goes against the position that Whoobe prefers none (a neutral one would need a compiler
per engine). So no language now; two small things first, and a limited recipe only on demand.

### D2. Steps

1. **The Connect-a-flow wizard exports a complete, importable Node-RED flow** for the one pattern that matters: receive the event, answer at once, do the
   work, write back with `X-Whoobe-Flow: stop`. The wizard already knows the class, the events, the endpoint and the API client; today it emits only
   the script of the function node, and the example flow (`examples/automation-engines/node-red/data/flows.json`) is written by hand. The flow includes
   the signature check when a signing key is set and the idempotency on `X-Whoobe-Event-Id`.
   *Done when:* a flow made by the wizard is imported into the disposable Node-RED, receives a test event, writes the field back and ends (no second
   delivery, a `stopped`-free log), in a browser or API test next to `object-events-loop-guard.integration.test.ts`.
2. **The conventions on one page** in `communication/node-red.md`: the mandatory steps, the headers, what to do with the event id, and a short
   instruction to give an agent ("write a Node-RED flow that follows these rules"). *Done when:* an agent given only that page produces a flow that
   passes the test of step 1 (checked once, the result noted in the page).
3. **On demand only:** a small YAML recipe for the same single pattern (trigger, steps, final write), compiled to the flow JSON by a tool in `examples/` or
   a separate package, never in the core. Fixed scope, stated in its README: no branches, no loops. *Promote it when* several people ask to keep and
   review flows in the repository.

### D3. Not in this block

A general flow language; round-trip between the Node-RED editor and a description; the same for n8n or Activepieces (their own editors and export
formats stay the way to work with them).

## 7. Order of work (each step says which verb it serves)

1. Corrections of the documentation and the alignment note (done 2026-10-17).
2. A1 (maturity) *[validate]*, because it needs no product decision and removes the heaviest rows of chapter 4.6.
3. C2 step 1 (the comparison) *[validate]*, which is small and finds the size of block C.
4. A2 *[govern]*: audit log, OIDC and mandatory 2FA first; then data subject tooling, readiness and metrics; more events *[orchestrate]*.
5. B3 steps 1 and 2 (the "no Content" profile) *[govern]*.
6. D2 steps 1 and 2 (the wizard exports the flow; the conventions page) *[orchestrate]*: small, and they end the hand-made example flow.
7. A3 and the rest of block C as demand and time allow.

## 8. Decisions for the owner

- **The number of the next release** — **decided 2026-10-18: 0.1.1** (the fixes and the features already on `master`), then 0.2.0 *Conduct* for this plan. (The name is *Conduct*, section 0.) Options were: 0.1.1 (fixes and the features already on `master`) followed by 0.2.0 for this plan, or one 0.2.0. The features on
  `master` are not in the tag: until a release exists, the documentation says "not in the v0.1.0 tag" next to them.
- **How to publish documentation of two versions:** one site that follows `master` (today, with notes), or a site per release. Proposal: one site, a
  note per feature not yet released, until there are users on two versions.
- **Positioning of the "no Content" profile:** "data and integrations platform for small organisations" or "a PIM". The plan assumes the first.
- **OIDC first or audit log first** if only one fits in the first month. Proposal: the audit log (smaller, no new login flow), then OIDC.
- **Whether per-class permissions are worth a release of their own.**

## 9. Not in this plan

Changing the data model of classes; a connector catalogue; a flow runner; a hosted service; translating the documentation.
