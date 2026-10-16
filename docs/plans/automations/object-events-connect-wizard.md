# Object events: a wizard to connect a flow

*Date: 2026-10-16. Status: **plan, nothing implemented**. Follows [object-events-activepieces.md](object-events-activepieces.md) (the recipe) and the
administrators' guide `docs/release/communication/object-events.md`. Branch for the work: a new one from `master` (worktree, see the note in section 7).*

## 1. Why

Connecting one flow today means five hand-made things in four places, and the owner hit most of the traps in a single afternoon (2026-10-16):

| Step today | Where | Trap seen |
|---|---|---|
| a Gateway endpoint for the engine | Integrations | the base URL must stop before the flow id |
| a route, **POST**, fixed path | Integrations | a GET route was created; a PATCH route was created; the subscription accepts only POST / PUT / PATCH |
| test URL versus live URL | Activepieces | the trigger listens on `/<id>/test` only while *Test trigger* is waiting; the live path is another route |
| the subscription | Object events | pointed at the route of an **older** flow (`.../sync`); events chosen `created, updated` but the save was a publish, which is `object.published` only |
| write back: API client, scope, key, `ignoreActors`, the HTTP step | API clients, Object events, Activepieces | the key is shown once; an API write is refused on a published record (409) |

Nothing is wrong in the engine of the feature; the cost is the number of separate screens and the knowledge needed to join them.

## 2. Goal

One dialog in *Object events*, **Connect a flow**, that takes four answers and leaves a working, tested connection:

1. **What happens in Whoobe?** class, and one of three presets of events (below);
2. **Where is the flow?** the pasted webhook URL;
3. **Does the flow write back to the record?** yes / no;
4. **Test**: sends a test event and says in words what came back.

Not a goal: a second way to do anything. The result is the same endpoint, route(s), subscription and API client that exist today, visible and
editable in their own screens afterwards. No new table, no new route, no new permission.

## 3. The dialog

### Step 1: what happens in Whoobe

Class (list of classes). Event presets, because the seven raw types are what made the first attempt miss:

| Preset | Events | Plain explanation |
|---|---|---|
| A record is **created** | `object.created` | "when someone adds a record" |
| A record is **changed** | `object.updated` | "when a field changes; saving without a change, or only publishing, does not count" |
| A record is **published** | `object.published`, `object.unpublished` | "when it goes live or is taken down" |
| Other | the seven types, as in the editor today | |

Several presets can be ticked.

### Step 2: where is the flow

One field, **Webhook URL** (what the engine shows), and an optional second one for the other mode.

`parseWebhookUrl(url)` returns `{ baseUrl, path, mode }`:

- Activepieces: `http://host:8090/api/v1/webhooks/<flowId>[/test|/sync]` gives base `http://host:8090/api/v1/webhooks`, path `/<flowId>[/test]`.
  The wizard derives the **other** mode by adding or removing `/test` and creates **both routes**; a switch *Test mode / Live* on the
  subscription chooses between them (a switch of `routeId`, nothing else). A `/sync` URL is kept as it is (it is its own flow).
- n8n: `.../webhook/<path>` and `.../webhook-test/<path>` are two URLs; if one is pasted the wizard offers the field for the other.
- Any other URL: base = origin, path = the rest, one route, no switch.
- The method is always **POST**; the wizard offers no other.
- An endpoint with the same base URL is **reused**, not duplicated; the name defaults to the engine's host name.
- A host that is `localhost` or `127.0.0.1` shows a hint: "if the flow engine runs in Docker, the Gateway may need the engine's network name" and, in a
  production instance, the `OUTBOUND_ALLOW_HOSTS` note (link to the guide).

### Step 3: write back

*No*: nothing more is created.

*Yes*: choose the fields the flow may write (informational in v1; the scope is per class, see section 6) and the wizard creates:

- an API client named `<subscription name> (flow)` with `data:read:<Class>` and `data:write:<Class>` only;
- its key, shown **once**, with a copy button and the warning that it cannot be shown again;
- the client's id in the subscription's `ignoreActors` (the loop guard, so the user never has to know it exists);
- a ready-to-paste block for the engine's HTTP step: method `PATCH`, the URL `<gateway>/client/v1/data/<Class>/<record id>` with the engine's own
  token for the id (Activepieces: `{{trigger['body']['object']['id']}}`), the `Authorization` header with the key, and a JSON body example.
  The text is generated per engine from the parsed URL; for an unknown engine the id is described in words.
- a note: "the API changes **drafts** only; a published record answers 409".

### Step 4: test

The wizard saves, then calls the existing *send test event* and waits for the delivery to settle (poll the delivery list, at most 10 s). It
shows one sentence, taken from the status and the last problem, never the engine's answer body (which Whoobe does not store):

| What happened | Sentence |
|---|---|
| delivered | "The flow received the test event." |
| 404 on a test route | "The engine is not listening. In Activepieces click *Test trigger*, then send the test again." |
| 404 on a live route | "The flow is not published, or the URL is wrong." |
| refused host / timeout | "Whoobe could not reach the engine from the Gateway" plus the Docker / `OUTBOUND_ALLOW_HOSTS` hint |
| 401 / 403 | "The engine refused the call (it may need a signature or a key)" |

## 4. How it is built (no backend change)

The dialog is a sequence of calls to **APIs that already exist**, run by the dashboard:

`createEndpoint` (or reuse) → `createRoute` ×1–2 → `createApiClient` (if write back) → `createSubscription` → `sendTestEvent`.

- **Rollback**: every created resource is remembered; if a call fails, the ones created in this run are deleted in reverse order and the error is
  shown in the dialog. A reused endpoint is never deleted.
- **Idempotent on re-run**: the dialog can be reopened on an existing subscription (*Connect a flow* becomes *Edit connection*), which only changes
  what differs.
- **Permissions**: the wizard needs `object_events:manage` and, for the endpoint / route / client steps, `gateway:manage`. Without the second one the
  wizard opens only step 1 and 3 with an existing endpoint to choose, and says why (no hidden failure at the end).
- **Pure logic in `utils/object-events-wizard.ts`** (testable without a browser): `parseWebhookUrl`, `planConnection(answers, existing)` returning the
  list of calls to make, `describeDelivery(delivery, mode)` returning the sentence, `engineSnippet(engine, ...)` for the HTTP-step block.

Why not a new server route that does it all? It would cross two services (core-api and Gateway) and need a new permission; the dashboard already
has the permissions and the calls, and the rollback is a handful of lines. If more clients than the dashboard need it (a CLI, a provisioning
script), a server route can be added later behind the same pure planner.

## 5. Steps (each one a commit; tests before the code)

0. **Baseline**: the object events unit tests (`object-events-ui`) and `vue-tsc` of the dashboard pass.
1. **Pure module** `object-events-wizard.ts` and its unit tests in `scripts/security/unit/`: URL parsing for the three shapes (and malformed input),
   the derived second mode, the plan (reuse of an endpoint, one or two routes, with or without write back), the sentences for every row of the
   table in step 4, the snippet text, rollback order.
2. **The dialog** (`ObjectEventsWizard.vue`) opened from `ObjectEventsView.vue` (*Connect a flow* next to *New subscription*), the Test / Live switch in
   the list row. Looked at in a real browser on a copy of the development database (as for phase 1), including a failure half way through to see the
   rollback.
3. **Docs**: the guide `communication/object-events.md` gets a short "Connect a flow" section and the Activepieces recipe points to it;
   `CHANGES.md`.

## 6. Decisions to make before step 2

The proposal's defaults are in bold.

1. **Scope of write back**: the API scope is per class, not per field, so the field choice would be only a note. **v1 gives the class scope and says so.**
2. **Where the Test / Live switch lives**: **on the subscription row** (a small toggle), not inside the editor, because it is the thing changed most.
3. **Other engines** (n8n, Make, any webhook): **v1 parses Activepieces and n8n and treats the rest as a generic URL.**
4. **Editing a connection created by the wizard**: **the normal editor and the Integrations / API clients screens stay fully usable**; the wizard
   keeps no private state, it only recognises its own naming (`<name> (flow)`, endpoint by base URL).
5. **Signed events** (`signingSecretRef`): **left to *Advanced* in the editor** in v1: the secret lives in the instance's environment, so the wizard
   cannot create it.

## 7. Notes for whoever implements this

- The dev stack runs from the working tree: use a `git worktree` for the branch, and keep the main checkout on `master`.
- A listing fix made on the same day is related: the API clients list showed write scopes as `GET` (fixed, commit `f62238a`); the wizard's summary
  of the created client should use the same wording (`POST/PATCH data /<Class>`).
- Unknown, to be checked in step 2 and not assumed: whether Activepieces' webhook accepts methods other than POST. The wizard never offers them, so
  the question matters only for subscriptions made by hand.
