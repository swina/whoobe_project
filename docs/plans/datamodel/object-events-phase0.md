# Object events, phase 0: implementation plan

*Date: 2026-10-16. Branch: `feat/object-events` (worktree `../whoobe_cms-object-events`). Status: **plan, nothing implemented**.
Implements phase 0 of [data-objects-automations.md](data-objects-automations.md); it is the first dependency of
[flow-orchestrator-app.md](../automations/flow-orchestrator-app.md). First engine: Activepieces.*

## 1. Goal of phase 0

Every change of a data object is stored, **in the same transaction**, as an event in an outbox; a worker in the gateway delivers it to
a webhook with retry; a subscription says which events go where. Enough to start a run of Whoobe Flows. No UI, no MQTT, no coalescing, no
loop guard beyond carrying the actor.

Out of scope (phases 1 and 2): dashboard, `object.published` / `unpublished` as separate types, field allow-list, circuit breaker, health metric.

## 2. Inventory of write paths (from the code, 2026-10-16)

Single choke points in `packages/core/src/db/data-objects-records.ts`:

| Function | Line | Emits | Notes |
|---|---|---|---|
| `createDataObject` | 381 | `object.created` | insert, then `syncNonLocalizedAttributes` (which updates **other** locale rows, line 328), then index. Not in a transaction today. |
| `updateDataObject` | 423 | `object.updated`, `object.transitioned` when `workflowState` changes | one `update`, then sync of non-localized values, then index. `published` is set here too. |
| `deleteDataObject` | 487 | `object.deleted` | the row must be read **before** the delete to build the payload. |
| `deleteDataObjectsByClassId` | 473 | one `object.bulk` (`kind: "delete"`) | "Empty data" and the migration clear. |
| `upsertDataObjectByPimcoreId` | 498 | none by default, or `object.bulk` from the caller | migration tool: thousands of rows. |
| `bulkImportDataObjects` | 601 | one `object.bulk` (`kind: "import"`) | already uses `db.transaction`: the outbox row joins it. |

Callers (all go through the functions above, none writes the table directly outside the file; checked with a grep on
`insert / update / delete (dataObjects)`):

| Caller | Place | Actor |
|---|---|---|
| core-api create / update / delete / import routes | `apps/core-api/src/server.ts` 4692, 4739, 4763, 4792 | `user` |
| core-api batch publish / delete | same file 4557, 4571 | `user` |
| core-api workflow transition | same file ~6236 (`/data-objects/:id/transition`) | `user` |
| core-api other `createDataObject` | same file 5075 | `user` (to identify in step 1) |
| core-api "Empty data" | same file 4071 | `user` |
| gateway API clients (create, patch) | `apps/gateway/src/client-router.ts` 351, 386 | `api-client` (the client id) |
| portability import (bundle) | `packages/core/src/portability/import.ts` 250-268 | `import` |
| migration tool | `packages/migration-tool/src/cli.ts` 393, 484 | `import` |

**Found:** the write functions take no actor today. The loop guard of the proposal needs one, so phase 0 adds it (section 4.2).
Also `updateDataObject` is the only path for publish and for the workflow state, so no separate publish route needs its own emit.

## 3. Tables (one numbered migration after `0058`)

| Table | Columns (main) |
|---|---|
| `object_events` | `id uuid pk`, `type`, `occurred_at`, `class_id`, `object_id`, `translation_group_id`, `locale`, `actor_type`, `actor_id`, `payload jsonb` (the minimal envelope: ids, state, `changed`) |
| `object_event_subscriptions` | `id`, `name`, `enabled`, `class_id null`, `events text[]`, `endpoint_id`, `route_id`, `payload_mode`, `fields text[]`, `ignore_actors text[]`, `signing_secret_ref`, timestamps |
| `object_event_deliveries` | `id`, `event_id fk`, `subscription_id fk`, `status` (`pending / delivered / retrying / dead`), `attempts`, `next_attempt_at`, `last_error` (truncated), `delivered_at`; index on `(status, next_attempt_at)` |

The deliveries are **created in the same transaction** as the event (one row per matching enabled subscription), so a subscription added
later never receives old events and the worker never has to match.

## 4. Steps (each one a commit; tests before the code of the step)

### Step 0: baseline
Run the existing suite of `data-objects-records.test.ts` and the API tests that touch objects; record the result in the commit
message. Transactions are added to functions that today are not wrapped: the baseline is the evidence that nothing changed.

### Step 1: pure module `object-events.ts` (next to the records file)
`buildEvent(type, before, after, actor)`: the envelope, `changed` (names of attributes whose value differs, plus `key`, `path`,
`parentId`), `classifyUpdate(before, after)` giving `updated` / `transitioned`. No database access. Unit tests: no change gives no
event, publish-only change, state change gives `transitioned` with `from` / `to`, attributes diff on nested values, deleted.

### Step 2: tables and migration
Drizzle schema files next to the others (`object-events-schema.ts`), the migration `0059_object_events.sql`, a records file with
`insertEvent(tx, …)` which also writes the delivery rows. Integration test: an event creates one delivery per matching subscription and
none for a disabled one or another class.

### Step 3: emit in the write functions, inside a transaction
- `createDataObject`, `updateDataObject`, `deleteDataObject` open `db.transaction`; the data change, `syncNonLocalizedAttributes` (it
  already takes a runner, to be confirmed) and the event commit together. The search index is updated **after** the commit, as
  `bulkImportDataObjects` does (an indexing failure never undoes the data).
- `assertUniqueValues` already accepts a runner (used with `tx` in the bulk import): pass the transaction.
- **Locales**: the change of a localized field in one row emits one event for that row; the rows touched by `syncNonLocalizedAttributes`
  emit their own `object.updated` with `actor: system` and `changed` listing only the synchronised fields (the proposal says one event per
  locale row).
- Bulk functions emit one `object.bulk`. `upsertDataObjectByPimcoreId` emits nothing itself; the migration tool calls a small
  `emitBulkSummary()` once per run.
- Test: a failure after the data write (forced error in the event insert) leaves no data change; a failing index leaves both.

### Step 4: the actor
Add an optional last argument `opts?: { actor?: EventActor }` to the six write functions, default `{ type: 'system' }`. Pass it from the
callers listed in section 2 (core-api: the user id from the request; gateway: the API client id; import and migration: `import`).
Explicit parameter rather than implicit request context: it shows in the signature and in a code search, and a forgotten caller falls
back to `system`, visible in the log. Test: a list of the write functions that fails if a new one appears without an event (the guard
from the risks table of the proposal).

### Step 5: worker in the gateway
`apps/gateway/src/object-event-worker.ts`: poll with `SELECT … FOR UPDATE SKIP LOCKED` on due deliveries (limit and concurrency cap),
call the subscription's endpoint and route through the **existing route-execution code** (credentials, `safeFetch`, the allow-list),
mark `delivered` on 2xx, otherwise `retrying` with the backoff 1 min, 5 min, 30 min, 2 h, 12 h, then `dead`. Timeout 10 s. Response body
never stored. Headers `X-Whoobe-Event-Id`, `X-Whoobe-Timestamp`, `X-Whoobe-Signature` (HMAC) when a secret is set. Kill switch
`OBJECT_EVENTS_ENABLED=0`, default **off** until configured. `LISTEN/NOTIFY` as a wake-up is optional in phase 0; a 2 s poll is enough.
Tests: retry schedule, dead after the last attempt, the SSRF refusal of a private host, signature, no body stored.

### Step 6: subscriptions API
core-api routes `/object-event-subscriptions` (list, create, update, delete, **send test event**, deliveries list, retry a dead one),
permission `object-events:manage` (admin only), blocked under `SANDBOX_MODE` (403). New routes added to `routes.expected.json`; tests for
the permission, the sandbox block, and that a subscription cannot point outside the Gateway's endpoints.

### Step 7: end to end with Activepieces
With the stack running (`docker-compose.automation.yml`, Activepieces attached to the workspace network, `OUTBOUND_ALLOW_HOSTS` set to its
host name): a subscription on a test class, a record inserted by an API client; an Activepieces flow with a webhook trigger receives the
event, reads the record, and answers 200. Record the setup as a short recipe in `docs/plans/automations/` (the real documentation comes
in phase 1). This is the hand-over point to `apps/flows`.

## 5. Risks specific to this phase

| Risk | Mitigation |
|---|---|
| Wrapping the write functions in transactions changes behaviour (isolation, errors, the nested transaction of the bulk import) | step 0 baseline; step 3 changes one function per commit; a transaction runner parameter instead of nesting |
| The first-version payload is read by a flow before the commit is visible | the event is written in the transaction and delivered only after the commit, by polling, so the record is visible when the engine reads it |
| `syncNonLocalizedAttributes` multiplies events (one per sibling locale) | `changed` limited to synchronised fields; `actor: system`; coalescing in phase 2 |
| A writer outside these functions (SQL script, restore) is silent | the unit test of step 4 plus the grep above; the PostgreSQL trigger stays a later safety net (open question 11 of the proposal) |
| Events for the public sandbox | `SANDBOX_MODE` blocks configuration; the reset does not emit |

## 6. Done when

All steps merged on the branch with the suite green; the end-to-end of step 7 repeatable from the recipe; `CHANGES.md` and
`docs/release` unchanged except for a note that the feature is off by default.
