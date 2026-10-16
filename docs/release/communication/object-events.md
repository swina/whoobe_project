# Object events: tell another system when a record changes

A **subscription** makes Whoobe send a small message (an *event*) to an external service whenever a Data Object of a class is created, changed,
published, unpublished, moved in its workflow or deleted. The service can be an automation engine (Activepieces, n8n), a back-end of yours or
anything that accepts an HTTPS `POST`. Whoobe does not run the automation: it tells the service that something happened, and the service
decides what to do. For the reasoning see [Why no engine of our own](../architecture/design-decisions/no-automation-engine-of-our-own.md).

Typical uses: a new Contact goes to the CRM flow, a published Blog post triggers a rebuild or a chat message, an order record starts a
fulfilment flow, a deleted record is removed from a search index.

**In the dashboard:** *Data & Communication > Object events*. Only users with the permission **`object_events:manage`** (the `admin` role by default)
see the entry and can use it. It is switched off in the public sandbox.

## 1. What the service receives

An HTTPS `POST` with a JSON body and these headers:

| Header | Meaning |
|---|---|
| `X-Whoobe-Event-Id` | The id of the event. **Use it as an idempotency key**: delivery is *at least once*, so the same event can arrive twice. |
| `X-Whoobe-Event-Type` | e.g. `object.updated` |
| `X-Whoobe-Timestamp` | Seconds since 1970 when the call was made. |
| `X-Whoobe-Signature` | Only when the subscription has a signing key: `sha256=` and the HMAC (see section 4). |

```json
{
  "id": "c1d2…", "type": "object.updated", "occurredAt": "2026-10-16T10:50:12.000Z", "instance": "dashboard.example.com",
  "class":  { "id": "3e7e103d-…", "name": "Contact" },
  "object": { "id": "…", "translationGroupId": "…", "locale": "en", "key": "ada-lovelace", "published": false, "workflowState": null, "updatedAt": "…" },
  "changed": ["company"],
  "actor": { "type": "user", "id": "…" }
}
```

**The event never carries the values of the fields**, only their *names* in `changed` (and the key, path or parent when those changed). A service
that needs the values reads the record through the API with its own [API client](api-clients.md). This keeps personal data from leaving Whoobe
by mistake and keeps the message small. Files travel as references, never as bytes.

| Event type | When | Extra |
|---|---|---|
| `object.created` | a record is inserted | one event per language row (a record in two languages gives two events with the same `translationGroupId`) |
| `object.updated` | its fields, key, path or parent changed | a change that only publishes or unpublishes is *not* an update |
| `object.published` / `object.unpublished` | `published` changed | |
| `object.transitioned` | its workflow state changed | `transition: { "from": …, "to": … }` |
| `object.deleted` | a record was deleted | the object part describes the row as it was |
| `object.bulk` | an import, "Empty data" or a migration | **one** summary: `bulk: { kind, count, firstIds }` (up to 10 ids), never one event per row |

One save can produce several events (for example an update that also publishes): they are sent separately. A save that changes nothing sends nothing.
When a language is added to a record, the other languages' shared (non-localized) fields are brought in line and each of those rows sends its own
`object.updated`, with the actor `system`.

`actor.type` is `user` (someone in the dashboard), `api-client` (an application with a key or token), `import` (a bundle or migration) or
`system` (Whoobe itself, including a public form).

## 2. Create a subscription

1. In **Integrations**, create an *endpoint* for the service (its base URL and credentials) and, under it, a *route* that is **POST, PUT or PATCH** with a
   **fixed path** (no `{parameters}`), for example `/api/v1/webhooks/<flow id>` on Activepieces. The call uses the endpoint's credentials and the
   Gateway's address checks (see [Integrations](integrations.md)).
2. *Object events > New subscription*:
   - **Name**: any label, unique.
   - **Class**: one class, or *Every class*.
   - **Events**: tick what should be sent.
   - **Integrations endpoint and route**: where to send it.
   - **Active**: untick to pause. A paused subscription queues nothing.
3. Use **Send a test event** (the paper-plane button). A synthetic `object.updated` marked `"test": true` is sent to that subscription only,
   whatever its filters; its object id is all zeros. The delivery log shows how it went.

A subscription only receives events from the moment it exists. Changes made before are not replayed.

## 3. The delivery log

Open it with the checklist button. Each row is one event for this subscription:

| Status | Meaning |
|---|---|
| *waiting* | queued, not tried yet (a few seconds at most) |
| *delivered* | the service answered with a `2xx` status |
| *retrying* | the last try failed (network error, timeout of 10 seconds, or a non-`2xx` answer); the next try is shown |
| *gave up* | six tries failed. Use **Retry** to start again from zero |

The waits between tries are **1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours**. The log shows the last problem as a short text (for example
`the consumer answered HTTP 503`). **It never shows the content of the event or the service's answer**: the answer is read and discarded.

If a service is down for a long time, deliveries pile up as *retrying* and become *gave up* one by one; nothing is lost silently, and each can be
retried. Deleting the subscription deletes its log and cancels what was waiting.

## 4. Signature (optional)

To let the service check that a call really comes from your Whoobe, give the subscription a **signing key name** (*Advanced*): the **name of an
environment variable of the Gateway**, which must start with `OBJECT_EVENTS_SECRET_` (for example `OBJECT_EVENTS_SECRET_CRM`). Put the secret itself in that
variable (the server environment or `.env`, never in the dashboard) and restart the Gateway. If the variable is missing the delivery fails with a clear
message and nothing is sent, so a typo cannot send unsigned calls.

The service computes `HMAC-SHA256(secret, timestamp + "." + body)` with the **exact body text** it received, compares it with the header (in constant time)
and refuses a timestamp older than 5 minutes.

## 5. Stop a loop

If the automation writes back into Whoobe (for example it sets a field to `synced`), that write is itself a change and would start the automation again.
Give the automation its own [API client](api-clients.md) and list that client's id under **Ignore changes made by**: changes made by an actor in that list are not sent
to this subscription. Two more safety nets: pause the subscription, or set `OBJECT_EVENTS_ENABLED=0` for the whole instance.

## 6. Good to know

- **At least once, not exactly once.** Make the service idempotent on `X-Whoobe-Event-Id`. For a payment-like step use a service built for it.
- **Order** is not guaranteed across records; for one record, compare `occurredAt` and the object's `updatedAt`.
- **Large imports** send one `object.bulk`, not one event per row. A flow that needs each record reads the class through the API after it.
- **A service on the same machine or network**: the Gateway refuses loopback addresses in production. Set `OUTBOUND_ALLOW_HOSTS=<host name of the service>`
  for that one host (see [Integrations](integrations.md)). Private ranges are open unless `OUTBOUND_ALLOW_PRIVATE=false`.
- **Worker settings** (Gateway environment): `OBJECT_EVENTS_ENABLED=0` stops the delivery worker and the creation of events; `OBJECT_EVENTS_CONCURRENCY`
  (default 5) is how many calls are made at once.
- **Transactions**: the event is stored in the same database transaction as the change. If the change is rolled back there is no event; if the event
  cannot be stored the change is not saved.
- **Any engine, your choice.** Whoobe sends an HTTP call and nothing more, so it does not prefer or exclude any automation engine (Activepieces,
  n8n, Make, a script of yours). The engine is **not part of Whoobe**: choosing it, installing it, making it reachable from the Gateway and
  respecting its licence are the operator's own responsibility. The examples use Activepieces only because it is what the documentation was tried with.
- **No code runs inside Whoobe**: a subscription chooses what is sent and where, nothing else. Anything that must run your own code belongs in your own
  service, which receives the event and calls Whoobe back with an API client.

## 7. Example: Activepieces

1. A flow with the trigger **Catch Webhook** and an action **Return Response** (status 200); publish it and copy the *live* URL
   (`http://localhost:8090/api/v1/webhooks/<flow id>`).
2. In Integrations: endpoint `activepieces` with base URL `http://localhost:8090`, route `POST /api/v1/webhooks/<flow id>`.
3. A subscription on the class, events *Created* and *Updated*, that endpoint and route; **Send a test event**; the flow shows a run.

The same steps can be done through the API (section 8).

## 8. For developers: the API

All routes need `object_events:manage`. See the [API reference](../api/api-reference.md) for the list;
a subscription is `{ name, enabled, classId | null, events[], endpointId, routeId, ignoreActors[], signingSecretRef | null }` and the payload mode is
`minimal` (no attribute values).
