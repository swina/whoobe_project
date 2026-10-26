# What you can do with Whoobe

A short answer for an IT manager: one capability per line, with an everyday example and where to read more. Only what the current release does;
the limits are at the end.

## One place for product data
The catalogue that today lives in spreadsheets, the ERP and the website becomes a **Data Class**. The people who own it edit it in the
dashboard, with validation, a published flag and an optional workflow; the website, the app and partners read the same source.
*Example: a product sheet is changed once and the site, the app and the reseller's feed show the change.*
[Data model](../data/data-model.md)

## Files out of the shared folders
Product photos and technical PDFs go into the **asset library** (DAM): private while they are being prepared, mirrored to a CDN when they are
published.
*Example: the new brochure is uploaded once, kept private until launch day, then served from the CDN.*
[Asset management](../dam/asset-management.md)

## A landing page without a ticket
A visual block editor with themes and pages bound to data: prices on a landing page come from the Data Objects, not copied by hand. A site
can also start from the website wizard or from a site specification written by an AI assistant.
*Example: marketing builds the campaign page and the prices stay right when the catalogue changes.*
[Website wizard](../content/website-wizard.md), [site from a specification](../content/site-from-specification.md)

## Each application gets only what it needs
An **API client** has its own key (or a token of your identity provider), scopes, a request limit and a log. No database credentials, no VPN.
*Example: the agency that builds the mobile app gets "read the catalogue, create orders", nothing else, and you can revoke it in one click.*
[API clients](../communication/api-clients.md)

## Third-party passwords stay on the server
The credentials of the CRM, the mail service or the payment provider are held by the **Gateway**; the site and the apps call the Gateway, never
the service itself.
*Example: the CRM key is changed in one place; no app is rebuilt and no browser ever sees it.*
[Integrations](../communication/integrations.md)

## When X happens, start Y, with the tool you choose
Forms, Data Objects, files and pages emit **events**, delivered as signed webhooks with retries to the automation engine you run (n8n,
Activepieces, a script). Whoobe ships no engine and prefers none.
*Example: a "request a quote" form sends an event; your workflow creates the lead in the CRM and notifies sales.*
[Object events](../communication/object-events.md)

## Answers for the security officer
An **audit log** of who did what, mandatory **two-factor authentication** for the roles you choose, **single sign-on** with your OpenID Connect
provider, tools for **data subject requests** and retention. Each release has signed images, an SBOM and its test results published, the failed
runs included.
*Example: "who changed the price list last Tuesday?" is one filter in the audit log.*
[Audit log](../operations/audit-log.md), [authentication](../architecture/authentication-and-authorization.md),
[single sign-on](../operations/single-sign-on.md), [data subject requests](../operations/data-subject-requests.md),
[security status](../security/status-summary.md)

## It runs on your servers
Self-hosted with Docker Compose, MIT licence. The `private` profile runs on a network with no route to the internet: bundled fonts, no outside
CDN. One installation (a **workspace**) per organisation.
*Example: an installation inside the company network, with no call leaving it.*
[Private network](../operations/private-network.md), [creating workspaces](../operations/creating-workspaces.md),
[one workspace per organisation](../architecture/design-decisions/one-workspace-per-organisation.md)

## Many clients without mixing them
An agency or an IT department runs one isolated workspace per client, and the fleet commands (`scripts/workspaces.sh`) give the status,
the backups and the upgrade of all of them at once.
*Example: an upgrade tried first on one client's workspace (canary), then on the others.*
[Upgrade and migrations](../operations/upgrade-and-migrations.md)

## Try it in five minutes
A public **sandbox** with a demo login, reset every three hours, or `./try.sh` on your own machine.
*Example: open https://sandbox.whoobe.dev, sign in with the account shown in the banner, build a page.*
[Sandbox](../operations/sandbox.md), [deployment](../operations/deployment.md)

## What to know before you decide
- It is a **0.x** series: behaviour can change between minor releases; the [release notes](../README.md) say what.
- Single sign-on is tried with one OpenID Connect provider (Keycloak); no SAML or LDAP without a broker.
- No high availability yet: one instance per service; recovery is a restore from backup ([capacity and scaling](../operations/capacity-and-scaling.md)).
- No third-party certification and no outside penetration test.

> Instead of a CMS, a DAM, a PIM and an API gateway to buy, integrate and keep running: one self-hosted stack with one permission model and
> one log, which you can try today without installing anything.

More for your role: [for the IT manager and architect](../by-role/it-manager.md).
