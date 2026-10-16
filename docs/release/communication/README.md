# Communication

How Whoobe talks to other systems and how other systems talk to Whoobe: **Integrations** (Whoobe calls your systems), **Automations** (forms start flows),
the **Client Hub** (your applications call Whoobe), and mail. The common rule is that credentials stay on the server
([credentials stay on the server](../architecture/design-decisions/credentials-stay-on-the-server.md)).

## 1. Integrations: Whoobe calls your systems

| Document | What it covers |
|---|---|
| [Integrations guide](integrations.md) | Endpoints and routes, OpenAPI import, presets, visual binding, filters, security, limits, troubleshooting |
| [API Gateway security](api-gateway-security.md) | How the credentials are stored and protected |
| [Brevo integration](brevo-integration.md) | Send a page or snippet as a Brevo campaign |

## 2. Automations: forms start flows

| Document | What it covers |
|---|---|
| [Marketing automation](marketing-automation.md) | A form hands its submission to Activepieces, n8n or any webhook; the page reacts to the answer |
| [Automations architecture](automations-architecture.md) | What Whoobe does, what the engine does, what travels between them |
| [Object events](object-events.md) | Tell a service when a Data Object is created, changed, published or deleted: subscriptions, payload, delivery log, signature, loops |
| [Forms with file upload](form-uploads.md) | Files from visitors: checks, private storage, limits |
| [Why no engine of our own](../architecture/design-decisions/no-automation-engine-of-our-own.md) | The decision and its costs |

## 3. Client Hub: your applications call Whoobe

| Document | What it covers |
|---|---|
| [API clients guide](api-clients.md) | Register an application, key or identity-provider token, scopes for integration routes, published data and automations, calls, errors, limits |
| [Client access without user accounts](../architecture/design-decisions/client-access-without-user-accounts.md) | The decision and its costs |
| [API reference](../api/api-reference.md) | `/client/v1` and the administration routes |

## 4. Mail

| Document | What it covers |
|---|---|
| [Outgoing mail](mail-providers.md) | SMTP and HTTP mail providers, per-website settings, the mail log, templates |

**In the dashboard:** *Data & Communication > Integrations*, *API clients*, *Automations*, *Data bindings*, *Outgoing Mail*.
