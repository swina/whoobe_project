# For the IT manager and architect

In one page, with examples: [what you can do with Whoobe](../overview/what-you-can-do.md).

## What you will run
Five application containers (core API, asset processor, gateway, admin dashboard, editor), PostgreSQL 16 and an S3-compatible store; nginx is the
only public listener. One installation is one **workspace** for **one organisation**; you may run many on a host.

## Your questions
| Question | Answer and where |
|---|---|
| What are the parts and how do they talk? | [Architecture overview](../architecture/architecture-overview.md) |
| Why this shape? | [Design decisions](../architecture/design-decisions/README.md), especially [a simple stack](../architecture/design-decisions/a-simple-stack.md) |
| Where is data stored, how does the schema evolve? | [Data and storage](../architecture/data-and-storage.md) |
| How do people sign in, what can they do? | [Authentication and authorization](../architecture/authentication-and-authorization.md): local accounts with TOTP (mandatory for the roles you choose), optional single sign-on with one OpenID Connect provider (SAML and LDAP through a broker), roles and permissions per route: [single sign-on](../operations/single-sign-on.md) |
| How do our applications use it? | [API clients](../communication/api-clients.md): server keys or tokens of your identity provider (Keycloak, Entra ID...), scopes, limits |
| How do we connect our ERP, CRM, mail? | [Integrations](../communication/integrations.md); credentials stay on the server |
| How does it scale, and how available is it? | [Capacity and scaling](../operations/capacity-and-scaling.md): vertical first, one instance per service, restore from backup is the recovery path |
| Which skills does it take to run and maintain, and how much work? | [Skills and effort](../operations/skills-and-effort.md) |
| What do I have to add around it? | Monitoring and alerts (health endpoints and optional Prometheus metrics exist; nothing pages anyone), a broker if you need SAML or LDAP, a schedule for the backups ([scheduling backups](../operations/scheduling-backups.md)), retention values: [overview 7.2](../overview/whoobe-overview.md) |
| What are the data model and its limits? | [Data model](../data/data-model.md) |
| Which licences and dependencies? | [Supply chain](../security/supply-chain.md) (SBOM) |

## Before production
Rehearse a restore on a spare host; test an upgrade; run your own load test; run a TLS check on your real hostname; decide log and data retention;
decide how people will sign in (local accounts with two-factor, or your OpenID Connect provider).

## Reading path
[What Whoobe is](../overview/what-is-whoobe.md), [architecture overview](../architecture/architecture-overview.md), [design decisions](../architecture/design-decisions/README.md),
[authentication](../architecture/authentication-and-authorization.md), [capacity](../operations/capacity-and-scaling.md), then the [operators' page](operators.md).
