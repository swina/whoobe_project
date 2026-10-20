# What Whoobe is, and why use a platform like it

A one-page picture first, then the detail by area. Read this before anything else; every section links to the document that goes deeper.
For an honest list of what Whoobe does **not** do, and a costed comparison, read the [full overview](whoobe-overview.md).

## 1. In one paragraph

Whoobe is a **self-hosted content and data platform**. In one system you run yourself it brings together what organisations usually buy
as separate products: a **visual editor** for websites and apps, a **data model you change without a developer**, a **media library**,
a **gateway** to the systems you already own (ERP, CRM, mail, payments) and a way for **other applications to use that gateway and your
data**, **forms and automations**, **AI assistance** you control, and the tools to **publish** to a site, a mobile app or an API.
It is licensed MIT, serves **one organisation per installation**, and keeps credentials, data and servers in your hands.

## 2. The platform at a glance

| Pillar | What you get | Start here |
|---|---|---|
| **Content** | Visual page, snippet, kit and template editor with a live preview that follows the published output; themes; multi-language; documentation sites; publishing to Next.js, Nuxt, static sites, a Capacitor mobile app or a headless API | [Content](../content/README.md) |
| **Data** (PIM / MDM) | Data Classes and Objects defined at runtime (products, events, people...), relations, reusable components, languages, draft/published workflow, import from Pimcore, bind any element to your data | [Data](../data/README.md) |
| **Communication** | **Integrations** (describe an API once, bind it visually, credentials stay on the server), **Automations** (forms start a flow in Activepieces or n8n), **Client Hub** (your apps and servers use the same integrations and data with a key or your identity provider's token), mail | [Communication](../communication/README.md) |
| **DAM** | Media library on S3-compatible storage, folders with visibility rules, image transforms, thumbnails, versions, optional CDN mirror | [DAM](../dam/README.md) |
| **AI** | Page, snippet and image generation, translation, Figma import, with the provider and key **you** choose; no AI vendor is built in | [AI](../ai/README.md) |
| **Settings** | One place for configuration: general, DAM, classes, users and roles, security (2FA), workflows, mail, PWA, uploads | [Settings](../settings/README.md) |
| **Security** | Roles and permissions per route, encrypted credentials, SSRF guard, rate limits, published-only public surface, a documented threat model and a test suite | [Security](../security/README.md) |
| **Operations** | Create a workspace, TLS, backup and restore, upgrade, configuration reference, observability | [Operations](../operations/README.md) |

## 3. What using a platform like this changes

**One system instead of five.** A CMS, a page builder, an integration layer, a media library and a mobile app generator normally mean
five contracts, five logins and five places where a secret can leak. Here the editor, the data and the integrations share one model, one
permission system and one place where credentials live.

**Authoring without waiting for a developer.** Marketing changes a page, a form or a layout and publishes it. Business users add a field to
a product type and fill it. A developer is needed to *connect* a new system once, not to change what it shows.

**Your systems, connected once.** An API is described one time (or imported from its OpenAPI file). From then on editors bind lists and
fields to it visually, forms send to it, and your own applications call it through the Client Hub, none of them holding the third party's secret.

**One content, many surfaces.** The same pages and data feed a website, a generated static or server-rendered site, a mobile app and an
API for your own front end. Nothing is re-entered per channel.

**Control and ownership.** You choose where it runs, which AI provider sees your text, which mail provider sends your mail, and you can
export a whole website and leave. There is no per-user, per-page or per-call fee.

**Security you can read.** The design choices are written down ([design decisions](../architecture/design-decisions/README.md)), the threats
are listed ([threat model](../security/threat-model.md)), and open findings are public ([findings register](../security/findings.md)).

## 4. How it is built, in five lines

- Five application containers (core API, asset processor, gateway, admin dashboard, editor), PostgreSQL and an S3-compatible store; no queue, no
  cache service, no search engine to run. A Valkey service is optional for shared rate-limit counters.
- Everything goes through one reverse proxy; databases and storage are never exposed.
- One installation is one **workspace** for **one organisation**: isolation is a separate stack, not a column.
- Public content is **published-only**, by one shared query rule; every generated site, the app and the SDK adapters use the same renderer.
- Detail: [architecture overview](../architecture/architecture-overview.md) and the [reasons behind the main choices](../architecture/design-decisions/README.md).

## 5. Who it is for, and who it is not for

**For** an organisation with a technical team or partner that wants to own its web platform: a company with several sites, an agency running
a workspace per client, a team whose integrations no off-the-shelf connector covers, an organisation that wants its apps to share one
governed gateway to internal systems.

**Not for** (today) a team without anyone to run a server; an organisation that needs SAML or LDAP login (or several single sign-on providers), an audit log that also records refused attempts,
high availability or a third-party compliance certificate; a business that wants one shared platform for many unrelated
companies. [Chapter 4 of the overview](whoobe-overview.md) explains each limit.

## 6. Where to go next

| You want to... | Go to |
|---|---|
| see it work | the [user manual](../guides/user-manual/README.md) |
| judge fit, cost and risk | [full overview](whoobe-overview.md), and the [reading paths by role](../by-role/README.md) |
| read the story behind it | [The story of Whoobe](../whoobe-history.md) |
| understand the design | [architecture](../architecture/architecture-overview.md), [design decisions](../architecture/design-decisions/README.md) |
| install it | [creating workspaces](../operations/creating-workspaces.md) |
| integrate with it | [Communication](../communication/README.md), [API reference](../api/api-reference.md) |
