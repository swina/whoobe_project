# The new whoobe.dev: audience, structure and texts

Status: **draft of the texts for the owner's review (2026-10-20)**. Nothing is built yet. Next: the owner edits the texts, then the pages are
built inside Whoobe itself (website "whoobe website" or a new one), published as a static site and deployed with `deploy-static.sh`.

## Why a new site

`www.whoobe.dev` shows the default nginx page. The old "whoobe website" (15 pages) was written for people who want to make a site by themselves;
Whoobe is not that. It is a platform with intrinsic complexity (data, integrations, publishing, governance) that tries to remove the complexity
with **configuration instead of glue code**, **no-code for the people who use it**, and **security and governance built in** (release 0.2, *Conduct*).
The reader is an **IT manager** or a **developer** evaluating it. They want to know what it replaces, how it is run, what is and is not there,
and where the proof is. The site is short, every claim links to a document that backs it, and the limits are stated.

Rules for every text: no superlative, no "easy" or "simple" where a limit applies, no feature that is not in the released version (0.2.0),
nothing that was "not tried" presented as tried. A claim goes in the table at the end with its source.

## Structure

| Page | Path | Reader's question |
|---|---|---|
| Home | `/` | What is this and should I read on? |
| Platform | `/platform` | What do I configure, and what do I not have to write? |
| Security and governance | `/security` | Can our security officer say yes? What is not there? |
| Run it | `/run` | Who runs it, on what, how is it upgraded and recovered? Is it for us? |
| Developers | `/developers` | How do I build on it, and can I read the code? |
| Blog | `/blog` | How is it built, what did you learn? (existing blog template and the Blog data class) |

Header: Platform · Security · Run it · Developers · Blog · Docs (docs.whoobe.dev) · GitHub · **Try the sandbox**.
Footer: documentation, GitHub, the sandbox, security policy (`SECURITY.md`), licence (MIT), release notes.

---

## 1. Home

**Title tag:** Whoobe, a self-hosted platform instead of the glue between your CMS, your data and your systems

**H1:** One platform instead of the glue between your CMS, your data and your systems.

**Lead:** Whoobe is a self-hosted platform for content, data and integrations. You configure it instead of coding it, the people who use it need
no code, and the security an organisation asks for is part of the product. MIT licence, one organisation per installation, no per-user fee.

**Buttons:** Try the live sandbox · Run it on your machine · Read the documentation

Under the buttons, in small type: `git clone https://github.com/swina/whoobe_project && cd whoobe_project && ./try.sh`

### What it replaces

Most organisations that publish and integrate end up with four things stitched together: a content platform, a page builder, a library for
files, and a layer of scripts and connectors to the systems they already own. Each has its own users, its own secrets, its own upgrades.
Whoobe is one installation with **one data model, one gateway to your systems, one media library and one editor**, run by the team that owns it.

### Three things to check

**Configuration, not glue code.** Point the gateway at an OpenAPI file or a sample request: routes, response shapes and fields appear in the
editor, and a block can show the data. The credentials stay on the server.

**No-code for the people who use it.** Editors build pages from blocks, snippets and kits. A data manager adds a field to a class without a
deploy. Nobody on the content side asks a developer to move a button or to publish.

**Security controls, and the proof behind them.** An append-only audit log, mandatory two-factor authentication by role, single sign-on with
OpenID Connect, encrypted credentials, data subject tools and retention, metrics. We do not certify our own code: we say what we tested,
publish the results, failures included, and list what is not covered. [Controls, tests and limits](/security)

### Benefits by role

The library snippet **"Whoobe Website - Benefits by role"** (seven roles: owner, IT manager and architect, operators, security and compliance,
marketing and content, data owners, developers; each with what you gain and *what to keep in mind*) is placed here as a copy. The snippet stays the
place where its text is kept; it was written for 0.1.0 and its texts were brought to 0.2.0 on 2026-10-20 (single sign-on with one provider, the
audit log of successful actions, metrics, the adapters, "a 0.x series"). The last link goes to `docs.whoobe.dev/by-role/`.

### Open source means showing the work

The code is MIT and public. So are the tests, the findings (open and closed), the results of every release, failures included, and the plans
that say how it is built, including the use of an AI assistant. We do not ask you to trust a claim: we put what backs it where you can open it.
Links: the tests, the findings, the results of release 0.2.0, the plans.

### Where it stands

Version **0.2.0** (a `0.` series: behaviour can change between minor releases and the release notes say what). One OpenID Connect provider,
no SAML or LDAP, no high availability yet. The limits are on [one page](/security#not-there).

---

## 2. Platform: configuration instead of glue code

**H1:** What you configure, and what you do not have to write.

**Lead:** Five parts, one installation. For each: what you set up, what you no longer write, and where it is documented.

### Data model

*You configure:* classes, fields and relations in the dashboard, changed at run time. Objects, translations and workflow states for review.
*You do not write:* a schema migration or a deploy to add a field, nor a second model for the mobile app or the API: they read the same one.
[Data model](https://docs.whoobe.dev/data/data-model/)

### Gateway to your systems

*You configure:* an endpoint by its base URL or an OpenAPI file, how it authenticates (API key, bearer, basic, OAuth 2 client credentials), a
rate limit, and which fields a block shows. Presets exist for common vendors.
*You do not write:* the connector, the token handling or a proxy for the browser. Credentials are encrypted at rest and used only inside the
gateway: the editor, the browser and the published site never see them.
[Integrations](https://docs.whoobe.dev/communication/integrations/) · [Gateway security](https://docs.whoobe.dev/communication/api-gateway-security/)

### Visual editor

*You configure:* pages from blocks, snippets, kits, themes, templates with header, aside and footer, translations, and the bindings between a
block and live data. A page is stored as a validated tree, not as HTML, so the same page can be a site, an app screen or an API response.
*You do not write:* a page template per channel, or a release to change the text of a button.
[User manual](https://docs.whoobe.dev/guides/user-manual/) · [Kits and snippets](https://docs.whoobe.dev/guides/user-manual/snippets-kits/)

### Events and forms

*You configure:* subscriptions to changes of objects, files and pages, with signed deliveries, retries and a guard against loops; forms with
file uploads. The engine that reacts to an event is yours (Node-RED, n8n, your own service): Whoobe emits, it does not impose one.
*You do not write:* polling jobs to find out that something changed.
[Object events](https://docs.whoobe.dev/communication/object-events/) · [Automations](https://docs.whoobe.dev/communication/automations-architecture/)

### Publishing

*You configure:* a static or server-rendered website (Nuxt or Next.js), a documentation site from Markdown, a native mobile app (Capacitor) or
the headless API with adapters for React, Vue, Next.js, Nuxt and Svelte.
*You do not write:* a different pipeline for each surface.
[Publishing](https://docs.whoobe.dev/content/publishing/) · [Headless SDK](https://docs.whoobe.dev/content/headless-sdk/)

**Closing line:** Try it: the [sandbox](https://sandbox.whoobe.dev) has a demo website, two kits and the editor; `./try.sh` runs the whole stack on your machine.

---

## 3. Security and governance

The principle (owner's): **open source earns the name by showing its work.** We do not say “our code is secure” and we do not certify it
ourselves. We say what we tested, against which objective, and publish the results, failures included. Policy and record:
`docs/release/security/results/`.

**H1:** What is built in, what we tested, and what we did not.

**Lead:** Open source earns the name by showing its work. We do not certify our own code and we do not say “our code is secure”. Release 0.2, named
*Conduct*, adds the controls a security officer asks for. This page lists them, says what we tested and why, what the tests cannot tell you,
and where every result is published.

### What is built in

A table, question / in Whoobe / documented, with nine rows: audit log, second factor, single sign-on, where integration credentials live, data
subject requests, monitoring, recovery, supply chain, tests (texts as in the page; each links to its document).

### What we tested, and with what objective

*We do not say “our code is secure”, and we do not certify it ourselves. We say what we set out to check, and how.* A table, objective / how
it is checked: sessions, lockout, password reset, second factor and single sign-on; every route guarded as intended (a checked-in contract, five
identities, a new route with no classification fails the run); one workspace cannot reach another; visitors cannot read what is not public;
uploads and outbound requests cannot be abused; stored text and pages do not run injected code (browser tests); no secret in the code or its
history, no known vulnerable dependency or image; the running stack answers safely to a standard scan (OWASP ZAP baseline, the TLS policy of the
proxy template). Link: the test suite document.

### What the tests do not tell you

A green run means that **these checks passed on this code, at this commit**. It does not mean that there are no vulnerabilities. It is not an
audit, a penetration test or a certification, and there has not been an outside one: all the work is ours. The coverage has holes, and they are
listed: SQL fuzzing of most endpoints, the impact of prompt injection on the AI features, a full Content-Security-Policy for the admin and the
editor, a live host with a public certificate, and load testing (by design).

### Where the results are, and they stay public

Open source earns the name by showing its work. The tests, the findings, the results of every release and the plans are in the repository or in
its public history. **The failures are published too**: on the day of release 0.2.0, two runs failed before the green one, and both are in the
record. A table, what / what it is / where: the tests (`scripts/security`), what each suite asserts, every finding open or closed, the status
summary, the result of each release (`docs/release/security/results/vX.Y.Z.md`), the CI runs, the plans. Closing line: *If a claim on this site
is not backed by something you can open, tell us.*

### What is not there (yet)

- **One OpenID Connect provider** at a time. It was tried against Keycloak; Microsoft Entra, Okta and Google follow the same standard and have
  **not** been tried. SAML and LDAP are not built: a broker in front covers them.
- **The audit log records successful actions.** A refused attempt is not in it.
- **Two-factor authentication, the password policy and retention are off until you set them.** An upgrade changes nothing by itself.
- **No high availability.** One installation, one database; recovery is by backup and restore.
- **No third-party certification** (ISO 27001, SOC 2) and no outside penetration test.
- It is a **`0.` series**: behaviour can change between minor releases. The release notes list what.

Closing band: *Check it yourself.* The sandbox is the real product with the risky features switched off, and the tests and their results are
public. Buttons: Open the sandbox; Read the results of 0.2.0.

---

## 4. Run it

**H1:** Built to be run by a small team.

**Lead:** Whoobe is containers, a PostgreSQL database and an S3-compatible object store. No licence server, no per-user fee, no call home.

### What runs

Five application services (API, asset service, gateway, dashboard, editor), PostgreSQL 16 and an object store (Garage in the default stack; any
S3-compatible store, or a managed one, in production). Docker Compose is the way it is deployed and documented. [Architecture](https://docs.whoobe.dev/architecture/architecture-overview/)

### How it is organised

**One organisation per installation.** A company with several sites uses one installation and several websites; an agency uses one workspace
per client. Roles follow functions (editor, publisher, administrator), not people.
[Creating workspaces](https://docs.whoobe.dev/operations/creating-workspaces/)

### Day two

- **Upgrades:** migrations are additions only, applied when the API starts; the release notes list behaviour changes; take a backup first.
  [Upgrade and migrations](https://docs.whoobe.dev/operations/upgrade-and-migrations/)
- **Backups and recovery:** encrypted database backups, restore scripts and a rehearsal; the nightly job pulled by another machine, with a freshness check, comes with the next release (it is in the code after 0.2.0). [Scheduling backups](https://docs.whoobe.dev/operations/scheduling-backups/)
- **Observability:** health, metrics, logs. [Observability](https://docs.whoobe.dev/operations/observability-and-logging/)
- **What it takes:** the skills and the hours, estimated, by task and by frequency. [Skills and effort](https://docs.whoobe.dev/operations/skills-and-effort/)

### Is it for you

**For** an organisation with a technical team or partner that wants to own its web platform: a company with several sites, an agency with a
workspace per client, a team whose integrations no ready-made connector covers, an organisation that wants its applications to share one governed
gateway to internal systems.

**Not for** (today) a team with nobody to run a server; a deployment that needs high availability or a third-party compliance certificate; a
business that wants one shared platform for many unrelated companies.

---

## 5. Developers

**H1:** Build on it, or read it.

**Lead:** The code is MIT-licensed and public. The platform is an API first and an interface second.

- **Headless:** adapters for React, Vue, Next.js, Nuxt and Svelte, and a public API with keys per website. [Headless SDK](https://docs.whoobe.dev/content/headless-sdk/)
- **API:** every route is documented, and a test fails for a route that is not. [API reference](https://docs.whoobe.dev/api/api-reference/) (OpenAPI file included)
- **Events:** subscribe to object, file and page changes; deliveries are signed (HMAC) and guarded against loops. [Object events](https://docs.whoobe.dev/communication/object-events/)
- **Gateway:** put any API behind it and bind its fields to blocks. [Integrations](https://docs.whoobe.dev/communication/integrations/)
- **The code:** TypeScript monorepo (Node, Vue 3, Postgres). `./try.sh` starts everything locally. [Developing Whoobe](https://github.com/swina/whoobe_project/blob/master/docs/development.md)
- **How it is built:** with an AI assistant working inside written plans, all public in [`docs/plans`](https://github.com/swina/whoobe_project/tree/master/docs/plans),
  and a test suite that guards the boundaries. [Plans before code](/blog/article/plans-before-code-keeping-an-ai-inside-the-architecture)
  and [what we measured](/blog/article/building-whoobe-with-ai-what-we-measured)

Buttons: GitHub · Documentation · Contribute (`CONTRIBUTING.md`)

---

## 6. Blog

The existing Blog data class and the `/blog` and `/blog/article/{slug}` templates. At launch: the three published articles and the two about the AI
(both are `publish = false` today and are published together; the first links to the second). Update "72 files in docs/plans" to the current count.

---

## Open decisions for the owner

1. The English of the texts above, and anything you do not recognise as Whoobe's own voice.
2. "No call home" (Run it, lead) is backed by `security/data-protection.md` (no telemetry, no analytics, no licence check, nothing sent to the project's authors): keep it.
3. Whether to name Node-RED and n8n in the events section, or only "your engine".
4. Keep `unifythestack.dev` as a separate landing or let it redirect to the new site when it is live.
5. A contact: an address, or only GitHub issues and `SECURITY.md`.

## Evidence: where each claim comes from

| Claim | Source |
|---|---|
| Release 0.2 *Conduct*: "lets an organisation with a security officer say yes" | `docs/release/release-notes-0.2.0.md` |
| Audit log append-only, fields before/after, secrets as "changed", CSV, DB refuses UPDATE/TRUNCATE | release notes 0.2.0; `operations/audit-log.md` |
| Mandatory two-factor by role, no session until enrolled; password policy; off by default | release notes 0.2.0 |
| OIDC with PKCE, roles from a claim, verified e-mail, break-glass; tried against Keycloak only; Entra, Okta, Google not tried; no SAML/LDAP | release notes 0.2.0; `operations/single-sign-on.md` |
| Credentials encrypted at rest, only inside the gateway | `docs/release/overview/executive-summary.md`; `operations/encryption.md`; `operations/secrets-and-keys.md` |
| Data subject requests, dry run, retention off until set | release notes 0.2.0; `operations/data-subject-requests.md` |
| Readiness, liveness, Prometheus metrics behind a token | release notes 0.2.0; `operations/observability-and-logging.md` |
| Encrypted database backups, restore scripts and a rehearsal in 0.2.0; the nightly pulled job with a freshness check is **after** 0.2.0 (next release) | `operations/backup-restore-and-dr.md`; `scripts/restore/rehearse.sh`; `operations/scheduling-backups.md`; `CHANGES.md` |
| Signed service images and source SBOM per release; CI scans | `docs/release/README.md`; `security/supply-chain.md`; `.github/workflows/release.yml`, `security.yml` |
| Automated API, browser, isolation and DAST suites in CI; findings published | `security/security-test-suite.md`; `security/findings.md` |
| Two workspaces cannot reach each other (tested) | `scripts/security/isolation`; `security/security-test-suite.md` |
| Results of 0.2.0: full run 39271161567 on `c21a633` all green; the tag adds only the version number; two earlier runs of the day failed | `security/results/v0.2.0.md` |
| Failures are published, nothing is self-certified, results are public | `security/results/README.md` |
| Every API route documented, a test fails otherwise | `docs/release/api/api-reference.md`; `scripts/security/routes.expected.json` |
| One organisation per installation; MIT; no per-user fee | `architecture/design-decisions`; `LICENSE.md` |
| No licence server, no call home, no telemetry | `security/data-protection.md` |
| Adapters for React, Vue, Next.js, Nuxt, Svelte | `packages/sdk`; `content/headless-sdk.md` |
| Events for objects, files and pages; signed delivery; loop guard; the engine is not imposed | `communication/object-events.md`; release notes 0.2.0 |
| Built with an AI assistant under written plans, public | `docs/plans`; the blog article "Plans before code" |
| No high availability, no third-party certification | `overview/what-is-whoobe.md` (section 5) |
