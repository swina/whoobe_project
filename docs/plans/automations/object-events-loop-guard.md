# Object events: stopping a flow that feeds itself ("end of flow")

*Date: 2026-10-17. Status: **plan, nothing built**. Follows [object-events-phase0.md](../datamodel/object-events-phase0.md), the guide `docs/release/communication/object-events.md` (section 5, "two flows on one class") and [object-events-connect-wizard.md](object-events-connect-wizard.md). Engine-neutral on purpose: Whoobe knows nothing about Node-RED, Activepieces or any other engine (the engine is the operator's choice, not part of Whoobe).*

## 1. What happened (2026-10-16, Node-RED)

A flow receives `object.updated` and writes a field back through an API client. The only protection today is the subscription's list **ignore changes made by**: when the write-back client is in it, the flow is not started by its own writes. On the owner's test the list was emptied (to try a call from outside), and:

| t | Event | `changed` | What the flow did |
|---|---|---|---|
| 0 s | the owner patches the record | `phone` | wrote `notes = "--phone-- updated"` |
| 2 s | `object.updated` by the flow's client | `notes` | wrote `notes = "--notes-- updated"` (a different value) |
| 4 s | `object.updated` by the flow's client | `notes` | wrote `"--notes-- updated"` again: same value, **no event**, the chain stops |

It stopped only because the value converged. With a flow that writes a changing value (a timestamp, a counter, an id from an external service) it would never stop. Whoobe has no limit on its own.

## 2. The realistic case (owner, same day)

Not only a typo in a flow:

1. a person edits a record;
2. the flow calls an **external service** with the edited data;
3. waits for the answer;
4. writes a field of the record with that answer.

Step 4 is a legitimate write that, without the ignore list, starts step 2 again. The flow should either stop by itself or there should be a way to say **"end of flow"**: *this write is the result of the flow, do not start anything because of it*.

## 3. Proposal: three layers, each useful alone

### A. A circuit breaker that needs nothing from the flow (do first)
Whoobe counts the events **caused by one actor on one record** in a sliding window. Over a limit (starting point: **5 events by the same API client on the same record in 60 s**, both numbers in environment variables `OBJECT_EVENTS_LOOP_MAX` / `OBJECT_EVENTS_LOOP_WINDOW_SECONDS`):
- the event is still **recorded** (the audit trail stays complete) but **not delivered**: its delivery is marked `stopped` with the reason *loop guard: 6th event by this client on this record within 60 s*;
- the Delivery Log shows it in its own colour, and the subscription gets a visible badge *loop guard fired* (with the time) until an administrator clears it;
- a line in the Gateway/core log at `warn`, once per record and window, not per event.
Works with any engine and any flow, including ones that never heard of this plan. It is a safety net, not a design tool: a legitimate burst (an import by one client) has to be excluded: a client with the scope used for imports, or a per-client switch *exempt from the loop guard*.

### B. "End of flow": the write says it is the last one (the owner's request)
An API client may mark a write as **the result of a flow**, in one of two equivalent ways (to decide which in section 6):
- header `X-Whoobe-Flow: end` on the `POST` / `PATCH`;
- or a **per-client setting** *Writes of this client do not start flows* (what the ignore list does, but once, on the client, so it cannot be forgotten on a new subscription).
Effect: the change is recorded in the audit trail with the actor and the flag `endOfFlow: true`, and **no subscription is started by it**. Other consumers that are not flows (the audit view, a future search index) still see it. Needs a scope or a client flag so that a browser-side token cannot silence the events of others: only the clients that already have `data:write:<Class>` may send it, and the flag is logged with the actor.

### C. Correlation: the flow echoes the event id (needs the flow's help)
The delivery already carries an event `id`. The flow may send it back in `X-Whoobe-Cause: <event id>` on its writes. Whoobe stores `cause` and `depth` (= depth of the cause + 1) in the new event and the payload shows them. Then:
- a subscription gets a *maximum chain depth* (default 3; 0 = unlimited as today);
- past the limit the delivery is `stopped` (same marking as layer A);
- the Delivery Log can show the whole chain of an event (who caused what), which also answers "why did this fire?" without reading logs.
Optional: it is a convention the engine's authors have to follow; the example flows and the Node-RED function snippet of the wizard would send it. Layers A and B do not depend on it.

## 4. What the wizard does meanwhile (no backend change)
- Step 3 already puts the write-back client in *ignore changes made by*. Add a **warning in the subscription form** when that list is empty and the class can be written by a client that has a flow route: *a flow that writes back can start itself*.
- Say so in the guide's section 5 with this example (the table above is a good one).
- The Node-RED example flow writes a fixed text (no loop on its own) and its README says why.

## 5. Steps (each one a commit; tests before the code)
1. **Layer A**: pure function `loopVerdict(recentEvents, now, limits)` in `packages/core/src/db/object-events.ts` with tests (burst, slow trickle, two clients, two records, exempt client); the check at planning time of the deliveries (`planDeliveries`); new delivery status `stopped` + `reason`; Delivery Log and badge; environment variables documented; `docs/release/communication/object-events.md`.
2. **Layer B**: the client flag (and/or the header), its scope, audit field, documentation in `api-clients.md`, wizard step 3 option *This write ends the flow*.
3. **Layer C**: `cause` / `depth` columns, header, maximum depth on the subscription, chain view in the Delivery Log, snippets updated.
4. Release notes / threat model: a runaway flow is now bounded; what an API client holding `data:write` can do with the flag (silence events of its own writes only).

## 6. Decisions to make
- **B**: header per write, client setting, or both? (The setting is harder to forget; the header lets one flow do both kinds of write.)
- **A**: the numbers (5 per 60 s?) and whether the counter is per actor + record or per subscription + record. Per subscription + record catches a loop made of two clients (flow A writes, flow B reacts and writes back).
- Does `stopped` count as a failure for the retry rules? Proposal: no, never retried.
- Should a human edit count? Proposal: only API clients and the system are counted; a person cannot loop.

## 7. Not in this plan
- A flow-level timeout or "run" concept: Whoobe has no runs (the engine owns them). Everything above is about **events**, the only thing Whoobe sees.
- Detecting loops through an external service that writes into Whoobe with its own key: covered by layer A (the key is an API client like any other).
