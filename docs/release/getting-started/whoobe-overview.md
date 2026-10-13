# Whoobe: what it is, what it is not, and whether it fits you

*A presentation for IT managers, CEOs, marketing managers and security officers. Written for release 0.1.0, the first release,
on 2026-10-11. Every statement about the product is taken from the code and from the technical documentation in this folder; where
something has not been tested, it says so.*

---

## A word from the CEO

I will start with what I would want to read if I were in your seat.

Whoobe is young. This is release 0.1.0, the first release, and it has been installed from scratch on one reference machine, not
on a hundred. We have put a great deal of effort into testing it (you will find the numbers in chapter 8), and we have fixed what the
tests and our own reviews found. But "we tested it" is not "it
has been in production for five years", and I would rather tell you that on the first page than have you find out in month three.

What we built is a platform that puts four things most organisations buy separately into one system you run yourself: a content
management system with a data model you change without a developer, a visual page builder, a gateway that connects your pages to
the systems you already own (ERP, CRM, e-mail, payments), and the tools to publish all of it to a website, a mobile app or an API.
We built it for the organisation that wants the authoring experience of a modern SaaS product and still wants to hold its own data,
its own credentials and its own servers.

We chose to be explicit about the limits. **Chapter 4 lists what Whoobe does not do.** It is longer and more specific than the usual
"roadmap" slide, because the decisions you make on the basis of this document are yours to live with. If chapter 4 describes
something you need today, we would rather you know now.

Read the part that is yours (chapter 2 tells you which), then chapter 4. Tell us what is missing. That is how the next release gets better.

*[Name], founder and CEO*

---

## 1. Whoobe in one page

**What it is.** A self-hosted content platform. You install it on your own infrastructure (a Docker Compose stack: five application
containers, PostgreSQL and an S3-compatible object store). One installation, called a **workspace**, serves **one organisation**.

**What it does, in six lines.**

1. **Author** pages, reusable blocks (snippets), kits and themes in a visual editor with a live preview; define your own structured
   content types (products, events, team members ...) without writing code.
2. **Store and deliver** images, documents and video in a built-in media library with visibility rules, thumbnails and optional CDN mirroring.
3. **Connect** external systems through an API gateway: you describe an API (or import its OpenAPI file), the credentials are encrypted on
   the server, and editors bind page elements to the data visually.
4. **Capture** visitor input with forms that create records, send an e-mail, call a service, or start a flow in an automation engine
   and show a different message depending on the answer.
5. **Publish** to the built-in preview, to a generated Next.js, Nuxt or fully static site, to a Capacitor mobile app, or to your own
   front end through a headless SDK (React, Vue, Svelte) and a public API.
6. **Govern** with roles and permissions, a publish permission, version history of pages and snippets, and an administrator dashboard.

**Who it is for.** An organisation with a technical team (or a technical partner) that wants to own its web platform: a company with
several sites, an agency that runs one workspace per client, a team that needs integrations with internal systems that no off-the-shelf
connector covers.

**Who it is not for.** A team without anyone to run a server; an organisation that needs single sign-on, an audit trail of every
administrative action, high availability, or a third-party compliance certificate **today**; a business that wants one shared platform for
many unrelated companies. Chapter 4 explains each.

**Licence.** MIT. No fee per user, per site, per page or per API call. You may use, modify and redistribute it, including commercially.

---

## 2. Which parts to read

| You are | Read first | Then |
|---|---|---|
| CEO / owner / sponsor | Chapter 1, 4 (the limits), 5 (costs), 6 (organisation and processes), 9 (fit), 10 (how to start) | Section 7.1 |
| IT manager / architect / DevOps | Chapter 3 (capabilities), 4, 7.2 (what you operate) | The [architecture overview](../architecture/architecture-overview.md), [capacity and scaling](../operations/capacity-and-scaling.md) |
| Marketing manager | Chapter 3 (authoring, forms, campaigns), 4, 7.3 | The [user manual](manual/README.md), [marketing automation](../guides/marketing-automation.md) |
| Security officer / DPO | Chapter 4, 7.4, 8 | The [threat model](../security/threat-model.md), [status summary](../security/status-summary.md), [data protection](../security/data-protection.md) |

---

## 3. What Whoobe does

Only what exists in release 0.1.0. Items marked *(beta)* work but have had less use.

### 3.1 Authoring

- **Visual page editor.** Drag-and-drop blocks, Tailwind-based styling, a live preview that is the same renderer as the published output,
  a phone-frame mode (App Mode) for mobile layouts, responsive classes, version history of every page and snippet with restore.
- **Snippets, kits and templates.** Reusable blocks, packaged kits, website templates with header, aside and footer slots; dynamic
  website paths and menus.
- **Rich text, audio, download and Markdown elements,** forms with file upload fields, sliders, tables, search box.
- **Themes.** Colours, fonts and styles defined once and applied to a website or a page.
- **AI assistance.** Page, snippet and image generation, and translation of pages and snippets, using the AI provider **you** configure
  with **your** key. Figma import *(beta)*.
- **Multi-language.** Pages carry a locale; translations are linked; AI translation is available but is a draft for a human to review.
- **Search.** Built-in search across published pages, objects and assets (no separate search service).

### 3.2 Content model and workflow

- **Data Classes and Objects.** You define a content type and its fields at runtime and create records of it; no deployment to add a field.
- **Publish workflow.** Content is a draft until someone with the publish permission publishes it. Workflows per class are configurable.
- **Website export and import** as a single `.zip` (pages, snippets, data classes and objects, asset files), with references rewritten so
  the copy is a working twin. Useful for staging to production, for templates, and for leaving.

### 3.3 Digital asset management

- S3-compatible storage (a local Garage store by default, any S3 in production), folders with public/private rules, image transforms
  and thumbnails on demand, uploading a new version of an asset, optional mirroring to a CDN. Private assets are served only to a signed-in session.

### 3.4 Integrations (the API Gateway)

- **Describe an API once, use it everywhere.** Base URL or an OpenAPI import; routes, schemas and field types are detected.
- **Credentials stay on the server.** API key, bearer, basic and OAuth2 client-credentials are encrypted at rest (AES-256-GCM) and used
  only inside the gateway; the browser, the editor's users and the published site never see them.
- **Visual binding.** An editor connects a list or a field to an external result, with filters, without code.
- **Presets** for Brevo, Cloudinary, HubSpot, Mailchimp, Shopify and Stripe, plus a demo. Anything else is added by describing it.
- **Safeguards.** Outbound calls pass an SSRF guard; calls are rate limited; a form can only forward the fields it actually has.
- Full description, limits and troubleshooting: [Integrations guide](../guides/integrations/integrations.md).

### 3.5 Forms, mail and automation

- Forms can create a record, send a notification (to a recipient the author configured, never one chosen by the visitor), accept files
  (checked by content, stored privately), forward to a gateway endpoint, and **start a flow in an automation engine** (Activepieces or
  n8n, or anything that answers a webhook). The engine can answer with a one-word outcome, and the page shows a different message or
  redirects accordingly.
- A list of every form connected this way, across all pages and snippets, in the dashboard (Data & Communication > Automations) and in
  the editor.
- **Outgoing mail** per website through SMTP or an HTTP mail provider; an email **campaign draft** can be pushed to Brevo from a page or snippet.
- We do **not** build the automation engine ourselves. [Why](../../plans/automations/why-no-custom-automation-engine.md), and
  [how the pieces fit](../architecture/automations.md).

### 3.6 Publishing

- **Preview sites** served by the editor app.
- **Generated sites:** Next.js or Nuxt (server-rendered with revalidation) or fully static, with SEO metadata, sitemap and the gateway wiring.
- **Mobile:** a Capacitor project generated from the same content (an installable app shell and PWA).
- **Headless:** a public read API and SDK adapters for React, Vue and Svelte.
- **Documentation sites:** a folder of Markdown becomes a searchable site (with diagrams), rendered live or generated as static HTML.

### 3.7 Administration and operations

- Dashboard for websites, pages, snippets, components, themes, assets, data objects, documents, mail, integrations, users, roles, settings
  and system logs; optional TOTP second factor per user; per-service structured logs with a live level switch.
- **Workspaces:** scripts to create, secure (TLS), back up (encrypted database dump), restore and remove an isolated installation.
- A **public sandbox** profile for demonstrations (AI, mail, imports and outbound HTTP switched off, caps on assets, rebuilt every three hours).

---

## 4. What Whoobe does not do

This is the chapter we would want a vendor to write. Items are grouped by what they affect. Where a workaround exists we say so; where
it does not, we say that too.

### 4.1 Identity, access and accountability

| Not provided | What it means for you |
|---|---|
| **Single sign-on (SAML, OIDC, LDAP)** | Users have local accounts (e-mail and password). No central deprovisioning: when someone leaves, an administrator deactivates the account by hand. |
| **Mandatory two-factor authentication** | TOTP is available per user but cannot be enforced for everyone. No password policy beyond a minimum length. |
| **Per-website permissions** | Roles describe a **function** (editor, publisher, administrator), not a **division**. Anyone who may edit pages may edit the pages of every website in the workspace. If one division must not touch another division's sites, that fence does not exist inside one workspace; use separate workspaces. |
| **An audit log of administrative actions** | Creating a user, changing a role, deleting a website: none of it is recorded as an auditable event. Page and snippet version history exists, and failed logins are logged, but if you need evidence of "who changed the permissions on what date", the product cannot give it. |
| **Machine credentials for Whoobe's own API** | There are no API tokens for scripts or flows. Automation that must act on Whoobe uses a dedicated user account (a session) or the public read surface. |

### 4.2 Scale and availability

| Not provided | What it means for you |
|---|---|
| **High availability / more than one replica per service** | Some state (login throttling, second-factor challenges, rate limits) is held in process memory. Two replicas behave differently from one, and a second-factor login can fail across replicas. The path to HA is written down ([capacity and scaling](../operations/capacity-and-scaling.md)); it has not been built or tested. |
| **Kubernetes manifests, a Helm chart, a managed-database variant** | The supported deployment is Docker Compose on a host. Pointing at a managed PostgreSQL is possible through configuration; it is not a packaged option. |
| **Load testing** | **No performance test has been run.** The sizing figures in the documentation come from the code and a small reference machine, not from measured throughput. Measure with your own traffic before you commit. |
| **Metrics, tracing, alert rules** | There is no metrics endpoint. The health route does not check the database. You monitor with what your platform gives you (container health, logs, an external uptime check). |

### 4.3 Multi-tenancy and organisation

| Not provided | What it means for you |
|---|---|
| **A shared platform for many unrelated customers** | By design. One workspace is one organisation, with its own database, bucket, secrets and containers. Hosting several clients means running several workspaces (the tooling exists); offering one instance to unrelated companies is not a supported model, because the product has no per-tenant data scoping, quotas or keys. |
| **Per-division data isolation** | See 4.1. |

### 4.4 Marketing

| Not provided | What it means for you |
|---|---|
| **An automation or workflow engine** | Whoobe starts a flow in Activepieces, n8n or a similar tool; it does not run flows, keep run histories or retry steps. You operate that engine as a second system. A form submission is the **only** trigger: other events (an asset downloaded, a page published) do not start anything. |
| **Visitor personalisation and segmentation** | The same page is served to every visitor. Content cannot be shown or hidden by lead status, segment or company. A block hidden by the page's own script is still in the HTML, so it is not a way to protect content. |
| **Access to private content as a result of filling in a form** | Not provided, and not safe to improvise: the visitor's e-mail address is not verified. |
| **Web analytics, A/B testing, heat maps** | None are built in. Use your own tool; Whoobe sets no cookie for visitors. |
| **Mass e-mail delivery** | Whoobe sends transactional and notification mail through the provider you configure. It prepares campaign **drafts** in Brevo; sending, lists, deliverability and reporting stay in that tool. |
| **A large connector catalogue** | Six vendor presets and anything you describe yourself. Breadth of ready-made connectors is where an integration platform is far ahead; that is why we recommend an automation engine for that side. |
| **OAuth2 authorisation-code (user consent) flows** | Only server-to-server credentials are supported. |
| **A visual editor for automations inside Whoobe** | You build flows in the engine's own editor. |

### 4.5 Security and compliance

| Not provided | What it means for you |
|---|---|
| **A third-party audit or certification** (SOC 2, ISO 27001, an external penetration test) | None. Our security work is internal and automated (chapter 8). Self-hosting puts your compliance posture in your hands, and the documentation is written so a reviewer can check it, but nobody outside the team has signed it off. |
| **A full Content-Security-Policy on the admin and editor applications** | Baseline headers and clickjacking protection are in; a strict CSP is postponed because the supported model is one organisation, with trusted editors. If you give the editor to people you do not trust, this matters more. |
| **Malware scanning of uploads** | Uploads are checked by type and content, images are re-encoded, active content is served as a download or in a sandbox, but files are not scanned for viruses. |
| **Automatic data retention and data-subject tooling** | Nothing is deleted automatically, and there is no one-click export or erasure of a person's data. The documentation lists where personal data lives and the procedure; **you** define and run the retention routine. Files uploaded through a form are not removed when the submission is deleted. |
| **Tamper-proof logs or log retention** | Logs go to standard output and files; their retention and protection are yours. |
| **AI prompt-injection hardening** | AI-generated content is a draft for an editor to review. The effect of hostile input on the AI features has not been tested. |

### 4.6 Maturity and operations of the project itself

| Fact | What it means for you |
|---|---|
| **First release (0.1.0)** | Installed from scratch on one reference machine (an arm64 virtual machine). That install found and fixed real defects. Expect more in the first months. While the version starts with 0, a minor release may change behaviour; the release notes tell you what. |
| **Upgrades are untested** | There is no earlier release to upgrade from. The upgrade and rollback procedures are written, not rehearsed. The first upgrade test belongs to the next release. |
| **Restore has not been rehearsed** | The database backup is scripted and encrypted; the asset bucket is not (you use your storage provider's tools). Run a restore once, on a spare machine, before you rely on it. |
| **Images are built and published by hand** | Not yet by an automated pipeline; no signatures or provenance attestations. A software bill of materials can be generated. |
| **Some checks must be repeated on the release commit** | The dynamic security scan and the manual security checklist were last run before the final features were added. The release process requires a new run. |
| **Documentation is English only,** and the user manual is partial (several chapters are listed but not written). | Training material for editors in other languages is yours to produce. |
| **Support** | Security fixes are made for the latest two minor versions. *[Commercial support, response times and who answers the phone: to be stated by us before you sign anything.]* |

---

## 5. What it costs, honestly

### 5.1 What you stop paying

- **Licence fees.** The software is MIT: nothing per user, site, page, API call or environment. A staging copy costs a few more
  containers, not a licence.
- **Several subscriptions.** Organisations that today pay separately for a headless CMS, a page builder, a digital asset manager and an
  integration platform pay once, in infrastructure, for the part of that Whoobe covers. (It does not replace an integration platform's
  catalogue; see 4.4.)
- **Lock-in costs.** Your content is in PostgreSQL and S3; a website can be exported as a `.zip`; the licence lets you keep running
  and modifying the software whatever happens to us. This is a real but hard-to-price benefit.
- **Developer time for routine work.** Landing pages, forms, new content types and many integrations become editor tasks instead of tickets.

### 5.2 What you start paying

| Line | Notes |
|---|---|
| **Infrastructure** | A small workspace ran in about 3.7 GB of memory in our smallest configuration; a production starting point is 2 vCPU and 4 GB plus storage for assets. **Not measured under load.** Add a staging environment and backups. |
| **People** | Someone to install, update, back up, monitor and secure it, and to respond when something breaks. This is the cost that decides whether self-hosting is cheaper for you. |
| **Third-party services you choose** | AI provider usage, the mail provider, a CDN, an automation engine (self-hosted or its vendor's cloud), the services your flows call. |
| **Integration work** | The first connection to each system needs someone who understands its API. |
| **Training** | The editor is visual, but a content model and a publishing process still need to be designed. |
| **Security review** | If you must do your own review or penetration test (4.5), that is yours. |

### 5.3 How to compare, with your numbers

We deliberately give no total, because it would be invented. Put your own figures in this frame:

> **Cost of staying** = subscriptions you would cancel + the share of developer time that becomes editor time
> **Cost of Whoobe** = infrastructure + operations staff time + third-party services + one-off integration and migration work
>
> Whoobe is cheaper when the first is clearly larger **and** you already have people to operate software of this kind.
> If you would have to hire for operations to host one site, a managed SaaS is probably cheaper and safer for you.

---

## 6. Organisational and process benefits

- **One place for content, assets and integrations.** An editor sees pages, structured content, files and external data in one tool; an
  administrator sees every credential in one encrypted place instead of in many tools and spreadsheets.
- **Separation of duties that is real, within one organisation.** Authors write, publishers publish (a separate permission that is
  enforced, so a draft cannot be published by someone without it), administrators manage users. Version history lets you see and undo
  changes to pages and snippets.
- **Fewer hand-offs.** A marketer builds a landing page with a form, connects it to a CRM or a flow, and sees the outcome on the page, without a
  development ticket. A developer uses the same data through the API or the headless SDK where code is the better tool.
- **Repeatable environments.** A whole website exports as one file and imports as a working copy: staging, regional variants, a template
  for the next client. Workspaces are created by script, with fresh secrets each time.
- **Controlled integration.** Because integrations go through one gateway, you can decide centrally what may be called, with which
  credential, at what rate, and what the browser may see, instead of having each site hold keys.
- **Visibility of what is connected.** The Automations list answers "which form sends data where?" without opening every page.
- **Documentation as a product.** The same platform publishes your internal or customer documentation from Markdown, with search and diagrams.
- **Reversibility.** Because data, licence and tooling are open, leaving costs effort, not permission.

---

## 7. By role

### 7.1 For the CEO

**The decision.** Whoobe is a good bet if you want to own your web platform, have (or can buy) the people to run it, and value the absence of
licence fees and lock-in over the comfort of a vendor SLA and certificates. It is a poor bet if you need those comforts now.

**The risks you carry.**

1. *Young product.* First release; defects will be found by use. Mitigation: a pilot (chapter 10), version pinning, the published test evidence.
2. *Operations.* Self-hosting means your team patches, backs up and monitors. If it does not, the risk is yours, not ours.
3. *Compliance.* No outside certificate; your auditors will review the documentation and the code themselves, and some controls they
   expect (single sign-on, audit log) are missing (4.1).
4. *Vendor risk.* Whoobe is a young project. *[Team size, funding, roadmap commitments and support terms: to be stated by us.]*
   Mitigation: the code is MIT and the data is in standard stores.

**What you get in return.** Control of data and infrastructure, no per-seat licensing, one platform for the web, the mobile shell and the
integrations, and the ability to change the product (or hire someone to) when it does not fit.

### 7.2 For IT managers, architects and DevOps

**What you run.** Five application containers (core API, asset processor, gateway, admin dashboard, editor), PostgreSQL 16, an S3 store
(Garage locally, any S3 in production), and nginx as the only public listener (a host nginx or the provided proxy compose file). Node.js
22, amd64 and arm64.

**What is provided.** Scripts to provision a workspace with fresh secrets, enable TLS (Let's Encrypt or your own certificate), back up the
database with encryption, restore it, and remove the workspace. Security scanning in CI (static analysis, dependency audit, secret scan, container scan).

**What you must add around it.**

| Need | Today |
|---|---|
| Single sign-on | Not available; local accounts. |
| Monitoring and alerting | Your platform's; the services expose container health and logs only. |
| Backup of the asset bucket | Your storage provider's versioning or a sync job. Not scripted. |
| High availability | One instance per service; restore from backup is the recovery path. |
| Retention and erasure jobs | Yours to write ([data protection](../security/data-protection.md) lists where the data is). |
| An automation engine, if you want one | A second system, outside the workspace, with its own database and secrets ([how](../architecture/automations.md)). |

**Things to do before production.** Rehearse a restore on a spare host; test an upgrade between two versions when the second one exists;
run your own load test; run the testssl check against your real hostname; decide how long each kind of log and personal data is kept.

**Start here:** [architecture overview](../architecture/architecture-overview.md), [creating workspaces](../operations/creating-workspaces.md),
[configuration reference](../operations/configuration-reference.md), [capacity and scaling](../operations/capacity-and-scaling.md),
[backup and recovery](../operations/backup-restore-and-dr.md).

### 7.3 For marketing managers

**What you can do yourself.** Build and change pages and snippets visually; create forms and decide what happens when they are submitted
(a record, an e-mail, a call to your CRM, a flow); show a thank-you block, a different block or a redirect according to the answer; connect
HubSpot, Brevo, Mailchimp and other tools through the gateway; prepare a Brevo campaign draft from a page; translate pages (AI draft,
human review); publish documentation; manage images and files with a media library; set SEO metadata and a sitemap per site.

**What you will still need other people for.** Building the first connection to each system; designing flows in the automation engine (a
visual tool, but it needs someone who thinks in steps and conditions); anything that changes the content model.

**What you will not get from Whoobe.** Personalisation by visitor, A/B tests, analytics and heat maps, gated content that depends on a
verified lead, mass e-mail sending and reporting, a catalogue of hundreds of ready-made connectors (4.4). Plan to keep your analytics
tool, your e-mail platform and your CRM; Whoobe connects them to your pages.

**A good first project.** One landing page with a form that creates the contact in your CRM and shows a message that depends on the
answer. It touches the editor, the gateway, the engine and the page, and it takes days, not months.

**Start here:** the [user manual](manual/README.md), [marketing automation](../guides/marketing-automation.md), [mail providers](../guides/mail-providers.md),
[Brevo integration](../guides/integrations/Brevo-Integration.md).

### 7.4 For security officers and data-protection officers

**What is in place** (details in the [status summary](../security/status-summary.md) and the [authentication and authorization](../architecture/authentication-and-authorization.md) page):

- Sessions with opaque tokens stored as hashes; lockout and throttling on login, second factor, and password reset; passwords hashed;
  optional TOTP with encrypted secrets.
- Permission checks on every administrative route, kept in a contract file that tests compare with the code (214 routes); an isolation
  suite on two stacks checks that one workspace's credentials and data do not work in another.
- Third-party credentials (gateway, AI, mail, Figma, push) encrypted at rest with keys you hold; a server-side request forgery guard on
  every outbound call; rich text filtered on output; uploaded files checked by content; active content served as a download.
- Public routes rate limited; public forms forward only the fields the form has; notification mail only to recipients an author configured.
- A threat model, a findings register, a data-protection description (what personal data, where, how long, how to export and delete),
  and a software bill of materials generator.

**The evidence, and its limits.**

- 59 security findings were recorded by our own tests and reviews; all those rated High are fixed. Some lower-severity items are open or
  accepted with a review date; they are listed in the status summary (for example residual unsanitised display paths covered by tests only
  in part, the postponed Content-Security-Policy, two accepted dependency advisories).
- Automated suites: about 1,170 API tests, 270 unit tests, 14 isolation tests on two stacks, 30 browser tests, static analysis and
  dependency, secret and container scans, and an OWASP ZAP active scan, run on a disposable stack. This is **our** evidence. Nobody
  outside the team has audited it.
- Not covered: no load test; no SQL fuzzing of every endpoint; the generated Next/Nuxt sites are generated and parsed but not built in the tests;
  TLS has been tested on the rendered template, not yet on a live public hostname; the dynamic scan and manual checklist need to be repeated on the release commit.

**Known gaps for your risk assessment** (all in chapter 4): no SSO, no mandatory second factor, no audit log of administrative
actions, no per-website roles, no full Content-Security-Policy on the admin applications, no malware scanning, no automated retention or
data-subject tooling, no third-party certification, in-memory throttling per process.

**Deployment advice.** One organisation per workspace. HTTPS only, behind the proxy; database and object store bound to the loopback
interface (the scripts do this); set every encryption key (the workspace scripts generate them; losing one makes the encrypted values
unreadable, so back the keys up separately); restrict who gets the editor, because the admin applications have no full CSP; define log and
data retention; keep the engine of any automation behind HTTPS with a secret on each webhook.

**Start here:** [threat model](../security/threat-model.md), [findings register](../security/findings.md), [data protection](../security/data-protection.md),
[encryption and keys](../operations/encryption.md), [supply chain](../security/supply-chain.md).

---

## 8. The evidence behind the claims

| What | State |
|---|---|
| Fresh installation | Done on one arm64 host (Ubuntu 22.04, nginx on the host, Let's Encrypt), following the written procedure; it found and fixed three defects in the TLS scripts |
| Automated tests | API about 1,170, unit about 270, isolation 14, browser 30, run in CI; plus the tests of the packages |
| Security review | 59 findings recorded; High all fixed; remaining items listed |
| Dynamic scan (OWASP ZAP) | Active scan of 154 routes with an admin session found nothing above informational, before the last features; to be repeated |
| Upgrade, rollback, restore, multi-replica, load | **Not tested** |
| External audit or certification | **None** |
| Documentation | Technical set (architecture, operations, security) written from the code; user manual partial; checked automatically for broken links, non-existent paths and undocumented settings |

Everything here is in the [release documentation](../README.md), including the [release notes](../release-notes-0.1.0.md) with the behaviour
changes to check before installing over a development setup.

---

## 9. Is Whoobe a fit?

| Whoobe is a good fit if ... | Whoobe is a poor fit if ... |
|---|---|
| You want to own your data, credentials and servers | Nobody in your organisation or partner network can run a server |
| You already run containers and PostgreSQL | You need single sign-on or an audit trail **now** |
| You have several sites, languages or channels from one content model | You need a high-availability setup with an uptime commitment |
| You integrate with internal or niche systems no connector covers | You need a certificate (SOC 2, ISO 27001) from the vendor |
| Editors should publish without developer tickets | You need visitor personalisation, A/B testing or analytics in one tool |
| Licence cost and lock-in weigh on your decision | You want one platform for many unrelated customers |
| You can start with a pilot and grow | You cannot accept a first release in production yet |

---

## 10. How to start

1. **Look.** Run a local stack, or a workspace with the sandbox profile (an afternoon). Build a page, a form, a data class.
2. **Pilot (a few weeks).** One workspace on a spare host, one real but low-risk site. Success criteria written in advance: editors
   can do their tasks without help, one real integration works, the stack survives a restart and a **restore from backup**.
3. **Review.** Security and data-protection review against chapters 4 and 7.4, using the findings register and the data-protection page. Decide the retention routine.
4. **Decide.** With the pilot's findings, decide go, go with conditions (for example "only after we have monitoring and a rehearsed
   restore"), or not yet. A "not yet" is a good outcome of a pilot.
5. **Run.** Pin the version, plan the first upgrade for when the next release exists, repeat the restore test on a schedule.

If you tell us what you need that chapter 4 says is missing, we will tell you plainly whether it is planned, whether it is hard, and whether it
is something we would advise you to solve outside Whoobe.

*[Name], founder and CEO. [Contact details.]*

---

## Appendix: more detail

| Topic | Document |
|---|---|
| What is in release 0.1.0, and what changes for existing installations | [Release notes](../release-notes-0.1.0.md) |
| Components, routing, trust boundaries, deployment model | [Architecture overview](../architecture/architecture-overview.md) |
| Identities, sessions, permissions, public surface | [Authentication and authorization](../architecture/authentication-and-authorization.md) |
| Where data lives, retention | [Data and storage](../architecture/data-and-storage.md) |
| Installing and operating | [Creating workspaces](../operations/creating-workspaces.md), [configuration reference](../operations/configuration-reference.md), [secrets and keys](../operations/secrets-and-keys.md) |
| Capacity and the road to more than one replica | [Capacity and scaling](../operations/capacity-and-scaling.md) |
| Security evidence | [Threat model](../security/threat-model.md), [status summary](../security/status-summary.md), [findings](../security/findings.md) |
| Marketing automation and the automation engine | [Guide](../guides/marketing-automation.md), [architecture](../architecture/automations.md) |
| Using the editor | [User manual](manual/README.md) |
| Earlier positioning text (dated 2026-09-18; compare tables are not maintained) | [Executive summary](executive-summary.md) |
