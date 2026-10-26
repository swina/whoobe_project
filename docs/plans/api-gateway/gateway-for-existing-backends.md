# Whoobe in front of an existing backend: routes from OpenAPI, a spec per client, events from the Gateway, a `gateway` profile

Status: **proposal, 2026-10-26, not decided.** Not before the launch; candidate for the 0.4/0.5 plan. Follows
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

## 5. Phases

| Phase | Content | Size |
|---|---|---|
| 1 | Keep the original operation; request validation (`off`/`report`/`enforce`); re-import plan with disabled routes | M |
| 2 | Spec per client (`/client/openapi.json`) | S |
| 3 | Events from Gateway calls; inbound webhook | M |
| 4 | `gateway` profile, dashboard sections by flag, suites | S/M |
| 5 | Documentation: a guide "Whoobe in front of an existing API" (import, scopes, validation, events, moving a class into Data Objects later) | S |

Phases 1 and 2 are useful inside Whoobe too (any upstream with a spec), so they are worth doing even if the profile is never used.

## 6. Open decisions

1. The validator library (OpenAPI 3.1 support, maintenance, audit).
2. Scopes by `operationId`/tag, or route forms only.
3. Whether the profile keeps the asset-processor.
4. Default validation mode for a new endpoint imported from a spec (`enforce` is safer, `report` is easier to adopt).
5. Whether events may carry bodies at all, or only identifiers (privacy by default).
6. Positioning: one line in the launch posts ("you can also put the Gateway in front of the API you already have") to see whether people ask,
   before building phases 3 and 4.

## 7. Not in scope

An automation engine (runs, retries of flows, editor); a full API-management suite (developer portal with self sign-up, monetisation,
GraphQL federation); rewriting responses between versions of a spec.
