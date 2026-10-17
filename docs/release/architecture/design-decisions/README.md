# Design decisions

Why Whoobe is built the way it is. Each page states the decision, the reasons, **what it costs you**, and when it would be revisited. They are
short on purpose; the long design history stays in [`docs/plans`](https://github.com/swina/whoobe_project/tree/master/docs/plans), and the pages say which plan to read for it.

| Decision | In one line |
|---|---|
| [One workspace per organisation](one-workspace-per-organisation.md) | The tenant and the security boundary is a whole installation, not a row in a shared one |
| [A simple stack](a-simple-stack.md) | Node, PostgreSQL and S3: no queue, no cache service, no search engine to operate |
| [Credentials stay on the server](credentials-stay-on-the-server.md) | Editors, browsers, sites and apps use integrations without ever holding the third party's secret |
| [Client access without user accounts](client-access-without-user-accounts.md) | Applications use Whoobe with a server key or your identity provider's token; Whoobe creates no end users |
| [The data model is data](the-data-model-is-data.md) | Content types are defined at runtime and stored as data, Pimcore-style, without a deployment |
| [Draft is never public](draft-is-never-public.md) | One shared rule decides what the public surface may return |
| [One renderer, many outputs](one-renderer-many-outputs.md) | The editor preview, the published site and the app come from the same content tree and renderer |
| [No automation engine of our own](no-automation-engine-of-our-own.md) | Forms and the gateway plug into Activepieces, n8n or any webhook |
| [Self-hosted and MIT](self-hosted-and-mit.md) | You run it, you own the data, no usage-based fee |

## How to read them

Each page has the same parts: **Decision**, **Why**, **What it costs**, **When to revisit**, **Where it shows in the product**. If you are
evaluating Whoobe, the *What it costs* sections are the ones to read: they are the trade-offs you accept.
