# Whoobe in front of an existing backend: routes from OpenAPI, a spec per client, events from the Gateway, a `gateway` profile

Status: **proposal, 2026-10-26, not decided** (section 4.5 and phase 6 on rewriting the existing API added the same day). Not before the launch; candidate for the 0.4/0.5 plan. Follows
[client-access-hub.md](client-access-hub.md) (a workspace with no websites used as a hub), which assumed the data lives in Data Objects.

## 1. The idea

Some organisations have a data model they cannot rebuild: an ERP, a legacy database behind its own REST API, a service of another company.
Moving it into Data Classes is impossible or not worth it. They still want what Whoobe puts in front of an API: **API clients** with keys,
scopes and limits, one place that holds the upstream credentials, a log, and **integrations/automations** that start from what happens.

So Whoobe is placed **in front of** the existing API, described by its OpenAPI document. The automation philosophy does not change: Whoobe
ships no engine and prefers none ([why-no-custom-automation-engine.md](../automations/why-no-custom-automation-engine.md)); events leave
as signed webhooks to whatever the operator runs.

It is also a way **into** Whoobe rather than a second product: put the Gateway in front of the legacy API first, then, if and when it is worth
it, move one class of data at a time into Data Objects behind the same client routes (strangler pattern). The clients do not notice.

**Not a separate product.** Same repository, release, images, security suites and documentation; a **profile** decides what a workspace shows
(as `sandbox` and `private` do). A separate product would double the release, supply-chain and support work for the same code.

## 2. What exists today (checked in the code, 2026-10-26)

| Piece | Where | State |
|---|---|---|
| Upstream endpoints with credentials, proxy, SSRF guard, outbound allow-list, rate limits, plugins per route | `apps/gateway` (`proxy-engine.ts`, `gateway-auth-headers.ts`, `route-call.ts`, `plugin-loader.ts`) | done |
| **OpenAPI import**: one `gateway_routes` row per operation (path + method), description, request body schema, response schema; matched by (endpoint, path, method), so a re-import updates | `openapi-importer.ts`, `POST /endpoints/:id/import-openapi`, *Integrations* in the dashboard | done, with the limits in section 3 |
| API clients: keys, JWT, scopes `gateway:call:<endpoint>:<METHOD>:<route>` checked against the matched route template, `automation:run:<endpoint>:<route>`, failure lock | `client-router.ts` (`/gateway/:endpoint/*`, `/automations/:endpoint/*`), `packages/core/src/gateway/client-scopes.ts` | done |
| Event delivery: outbox, claim, backoff, signature, states; target = a gateway endpoint + route | core `object-events-delivery`, `apps/gateway/src/object-event-worker.ts` | done, but the only **source** is Data Objects (and forms, assets, pages) |
| Administration: endpoints, routes, clients, events | core-api + dashboard (*Integrations*, *API clients*, *Object events*) | done, inside the full dashboard |

## 3. What is missing

1. **The spec is not enforced.** `requestBodySchema` is stored but no code reads it at call time: a client can send any body. The schemas are
   also simplified into the `InferredSchema` shape (type, fields, nullable) used for bindings: `required`, `enum`, `format`, `minimum`,
   `pattern`, path and query parameters are lost.
2. **Routes removed from the spec stay.** A re-import creates and updates, never removes or flags.
3. **No contract for the client.** A client cannot get the OpenAPI document of what it may call.
4. **No events without Whoobe data.** A write that succeeds on the legacy API produces nothing an engine can react to.
5. **The whole dashboard comes with it**: pages, themes, DAM, Data Classes are in the way for someone who only wants the Gateway.

## 4. Proposal

### 4.1 Routes from the spec, enforced
- Keep the **original operation** (dereferenced, without external `$ref`, as today) next to each route: `operationId`, parameters, request
  body, responses. The simplified schema stays for bindings.
- **Validate the request** (path, query, headers that matter, body) against the operation before calling the upstream, with an OpenAPI 3.0/3.1
  validator (choice open: Ajv with the OpenAPI dialect, or a dedicated library; the dependency must pass the audit gate). 400 with the place
  of the problem, like the site specification. Per endpoint: `off`, `report` (log only), `enforce`; default `report` for an endpoint imported
  before this change.
- Response validation: `report` only (a legacy API that breaks its own spec should not break its clients without notice).
- **Re-import as a plan**: what is new, changed, removed (by `operationId`, falling back to path + method); applied after a confirmation;
  removed operations are disabled, not deleted, so their scopes and event subscriptions do not dangle.
- Scopes may name an `operationId` or an OpenAPI **tag** (`gateway:call:<endpoint>:op:<operationId>`, `...:tag:<tag>`), next to the route forms
  that exist. To decide: whether the new forms are needed or the route forms are enough.

### 4.2 A spec per client
- `GET /client/openapi.json`: the operations of every endpoint the client's scopes allow, rewritten to the Gateway's own paths
  (`/gateway/<endpoint>/...`), with the Gateway's security scheme instead of the upstream's, no upstream host, no server URLs. Generated, never
  stored. The upstream credentials and private descriptions (an `x-whoobe-internal` extension) never appear.
- Optional: a read-only documentation page per client (rendered from that spec) for the people who write the client.

### 4.3 Events from the Gateway
- A new event source: **a call through the Gateway that succeeded** (2xx) on a route marked as an event route (writes: POST, PUT, PATCH, DELETE).
  The event carries endpoint, route, `operationId`, status, the client, time and, per route, nothing / the request body / the response body
  (default nothing; bodies may hold personal data, see the redaction rules in `redact.ts`).
- A second source: an **inbound webhook** from the legacy system (`POST /events/in/<name>` with a signature of its own), for changes made
  outside the Gateway.
- Both go into the existing outbox and are delivered by the existing worker, with the same backoff, signature and loop guard
  ([object-events-loop-guard.md](../automations/object-events-loop-guard.md)). The engine stays outside.

### 4.4 The `gateway` profile
- `provision-workspace.sh --profile gateway`: core-api, gateway, Valkey, Postgres, dashboard; no publisher, no editor, no asset-processor
  (or kept, if clients need files: to decide).
- The dashboard shows Integrations, API clients, Events, Users and roles, Audit log, Settings; the other sections are hidden by a flag read
  from `/config.js`, not removed (switching the profile off brings them back, nothing is lost).
- Same images, same release. The profile is added to the isolation and API suites (a workspace with the profile must still pass them).

### 4.5 Rewriting the existing API behind the Gateway
When the organisation has to rewrite its API, Whoobe does not write the new code (except in the case below), but it lets the rewrite happen
**one operation at a time** while the clients keep the same contract: they only know the Gateway's routes, keys and scopes, never the backend.
The new API does not reimplement client authentication, scopes, limits or upstream credentials: it receives calls already checked.

- **Cut-over per operation**: each route chooses its upstream (legacy or new), switched and switched back from the dashboard, with the change
  in the audit log.
- **Shadow traffic**: the legacy upstream answers the client; a copy of the request goes to the new one and the Gateway compares the two
  answers (status, shape against the spec, chosen fields), without returning the new one. Reads only, or writes to a test upstream: duplicated
  writes to two real systems are a hazard. The comparison is logged without bodies by default (personal data, see `redact.ts`).
- **Canary**: a share of the calls, or named clients, go to the new upstream.
- **Data Objects behind a legacy route**: for the parts whose data *can* be rebuilt (migration-tool with its MySQL adapter, or *Class from
  file* with CSV/JSON), a Gateway route keeps the legacy path and JSON shape and is served by Data Objects (a mapping: fields, names, filters,
  pagination) instead of an upstream. Then the CRUD needs no new code and the client does not notice. Today the client routes have Whoobe's
  own shape (`/data/:className`), so the mapping is the missing piece.
- **The contract as a test**: response validation in `report` mode (4.1) shows where the new API breaks the spec; samples of real requests and
  answers (the `schema-inferrer` already reads live responses), with personal data removed, become test cases for the new implementation.
- **Side effects become events**: cron jobs, triggers and mails inside the legacy code can move to Gateway or Data Object events delivered to
  the operator's engine (4.3), so the new API stays smaller.

### 4.6 An example: a distributor's order API

*Hypothetical, to make the steps concrete. What exists today and what is proposed is marked on each step.*

**Where they start.** A distributor of spare parts has a REST API written in 2014 (PHP) over a MySQL schema of 140 tables nobody dares to
change. Three consumers use it: the e-commerce site, a mobile app for the sales agents, and a reseller's system that reads the catalogue every
night. One shared API key, embedded in the app. No OpenAPI document. Inside the PHP code:

| Operation | Logic in the legacy code |
|---|---|
| `GET /api/v1/products`, `GET /api/v1/products/{code}` | catalogue from 6 tables, images as file paths on the server |
| `GET /api/v1/customers/{id}/prices` | price list per customer group, discounts computed in PHP |
| `POST /api/v1/orders` | checks the stock, writes the order, decrements the stock, sends a confirmation mail |
| `GET /api/v1/orders/{id}`, `PUT /api/v1/orders/{id}/status` | order and its state |
| (cron, 02:00) | exports the day's orders to the ERP as a CSV file |

**What they need to change.** The commercial department wants promotions by period and by product line (a change of the pricing logic); the
reseller needs its own limited access; the catalogue should be edited by people, with real images, instead of by SQL. Rewriting everything at
once is not an option: orders and stock are the business.

**Step 0 - Whoobe in front, nothing changes behind** (exists today, except validation and the spec per client).
- An OpenAPI document is written for the six operations (by hand, or from samples: the `schema-inferrer` reads live responses), imported:
  one Gateway route per operation on an endpoint `orders-legacy`, whose credential is the old shared key, now known only to the Gateway.
- One API client per consumer: the agents' app (catalogue, prices, orders), the site (the same), the reseller (`GET /products*` only, a
  limit per minute). Each consumer changes its base URL once; the old key is withdrawn from the app.
- Validation in `report` (4.1) for two weeks: it shows, for example, that the app sends quantities as strings. Fixed in the app, or accepted
  in the spec, before anything is rewritten.
- The reseller gets its own `/client/openapi.json` (4.2) with only the catalogue.

**Step 1 - the catalogue moves into Data Objects** (import exists; the legacy-shaped route is the mapping of 4.5, to build).
- A Data Class `Product` (code, name, line, group prices reference, attributes) filled by the migration-tool's MySQL adapter from the six
  tables; images uploaded to the DAM and mirrored to the CDN. From now on the catalogue is edited in the dashboard, and the website builder
  uses the same objects.
- `GET /api/v1/products` and `/{code}` keep their path and JSON shape, served by the mapping onto `Product` instead of PHP. First as
  **shadow** (PHP still answers, the Gateway compares), then **canary** (the reseller first, the least critical), then cut over. The PHP
  catalogue code and its six tables become read-only, then retired.
- Until the cut-over the two copies must not drift: the import runs again, or catalogue edits stay in the legacy system until that day.
  No two-way sync (out of scope).

**Step 2 - the new pricing logic** (Whoobe does not host it; proposed: upstream per route, shadow, canary).
- The rules are business logic, so they live in a **new small service** the distributor writes (any language), `pricing-service`, reading the
  promotions from a Data Class `Promotion` that the commercial department edits in the dashboard, and the groups from the legacy database.
- `GET /api/v1/customers/{id}/prices` gets a second upstream: shadow for a month (the Gateway reports every price that differs: the
  expected differences are the promotions, any other is a bug), then canary to five agents, then everyone. Switching back is one click.
- Small adaptations that are not business logic (rename a field, drop an internal one) can be a request/response plugin of the route (the
  plugin chain exists today) rather than code in the service.

**Step 3 - side effects out of the PHP code** (proposed: events from Gateway calls, 4.3).
- `POST /api/v1/orders` becomes an event route: each successful call emits `order.created` (identifiers only by default) to the engine the
  distributor runs (n8n, Activepieces, a script). The engine sends the confirmation mail and pushes the order to the ERP when it happens,
  instead of the 02:00 CSV.
- The mail is switched off in PHP **in the same release** in which the engine starts sending it (otherwise two mails), and the CSV export
  stays until the ERP push has run cleanly for a while.

**Step 4 - what stays** (a decision, not a technical limit).
- Orders and stock stay in the legacy system for now: they need transactions across tables (check, write, decrement), which is not what Data
  Objects are for. When they are rewritten, it is a new service behind the same two routes, with shadow on `GET` and a dated cut-over for
  `POST` (no shadow of writes on the real system).

**End state.**

| Route | Served by | Changed for the clients |
|---|---|---|
| `GET /api/v1/products`, `/{code}` | Data Objects (mapping) | nothing |
| `GET /api/v1/customers/{id}/prices` | `pricing-service` | the promotions appear |
| `POST /api/v1/orders` | legacy PHP + event to the engine | the mail comes from the engine |
| `GET /api/v1/orders/{id}`, `PUT .../status` | legacy PHP | nothing |

The three consumers changed one base URL and one key each. The distributor wrote one service (pricing) and removed three parts of the PHP
code (catalogue, mail, CSV cron). Everything else moved by configuration.

## 5. Phases

| Phase | Content | Size |
|---|---|---|
| 1 | Keep the original operation; request validation (`off`/`report`/`enforce`); re-import plan with disabled routes | M |
| 2 | Spec per client (`/client/openapi.json`) | S |
| 3 | Events from Gateway calls; inbound webhook | M |
| 4 | `gateway` profile, dashboard sections by flag, suites | S/M |
| 5 | Documentation: a guide "Whoobe in front of an existing API" (import, scopes, validation, events, moving a class into Data Objects later) | S |
| 6 | Rewrite support: upstream per route with switch-back, canary, shadow traffic with comparison, Data Objects behind a legacy route (mapping), samples as tests | L |

Phases 1 and 2 are useful inside Whoobe too (any upstream with a spec), so they are worth doing even if the profile is never used.

## 6. Open decisions

1. The validator library (OpenAPI 3.1 support, maintenance, audit).
2. Scopes by `operationId`/tag, or route forms only.
3. Whether the profile keeps the asset-processor.
4. Default validation mode for a new endpoint imported from a spec (`enforce` is safer, `report` is easier to adopt).
5. Whether events may carry bodies at all, or only identifiers (privacy by default).
6. Shadow traffic: which fields are compared, where the differences are kept, whether writes may be shadowed to a test upstream.
7. The mapping of a legacy route onto Data Objects: declarative (fields, filters, pagination) only, or a plugin for the cases it cannot express.
8. Positioning: one line in the launch posts ("you can also put the Gateway in front of the API you already have") to see whether people ask,
   before building phases 3 and 4.

## 7. Not in scope

Generating the code of the new API; continuous two-way synchronisation of data between the legacy system and Data Objects; An automation engine (runs, retries of flows, editor); a full API-management suite (developer portal with self sign-up, monetisation,
GraphQL federation); rewriting responses between versions of a spec.
