# Recipe: object events to Activepieces (phase 0)

*Date: 2026-10-16. Tried and working with the Contact class and the local Activepieces of
[activepieces-local-experiment.md](activepieces-local-experiment.md). Part of
[object-events-phase0.md](../datamodel/object-events-phase0.md), step 7; the administrators' page comes in phase 1.*

What this does: when a data object of a class is created, updated or deleted, Whoobe sends a small signed-or-plain JSON event to a flow
of Activepieces (or any webhook). The event carries ids and the **names** of the changed fields, never their values.

> The dashboard now does sections 1 and 2 for you: *Object events > Connect a flow* (see the administrators' guide, section 2). What follows is the manual way and the details.

## 1. In Activepieces

1. New flow, trigger **Catch Webhook**; action **Return Response**, status `200`. Publish it.
2. Copy the **live** URL: `http://localhost:8090/api/v1/webhooks/<flow id>` (not the one ending in `/test`).

## 2. In Whoobe (all through the API; the dashboard UI follows in phase 1)

All calls are made by an administrator (`object_events:manage`). `GW` is the Gateway, `CORE` the core-api.

```bash
# a Gateway endpoint for the engine and a fixed-path POST route
POST $GW/api/v1/gateway/endpoints                {"name":"activepieces","baseUrl":"http://localhost:8090","authType":"none"}
POST $GW/api/v1/gateway/endpoints/<endpoint>/routes   {"path":"/api/v1/webhooks/<flow id>","method":"POST"}

# the subscription: which class, which events, where
POST $CORE/object-event-subscriptions
     {"name":"contact-events","classId":"<Contact class id>",
      "events":["object.created","object.updated","object.deleted"],
      "endpointId":"<endpoint>","routeId":"<route>"}

# look at what happened
POST $CORE/object-event-subscriptions/<id>/test          # a synthetic event marked "test": true
GET  $CORE/object-event-subscriptions/<id>/deliveries    # status, attempts, last error; never the content
POST $CORE/object-event-deliveries/<delivery>/retry      # only for a "dead" one
```

Optional: `"signingSecretRef":"OBJECT_EVENTS_SECRET_ACTIVEPIECES"` and that variable set on the Gateway's environment (the name must start with
`OBJECT_EVENTS_SECRET_`). The call then carries `X-Whoobe-Timestamp` and `X-Whoobe-Signature: sha256=` (HMAC of `timestamp.body`).
`ignoreActors: ["<id of the API client the flow writes back with>"]` keeps the flow from triggering itself.

## 3. What the flow receives

Headers `X-Whoobe-Event-Id` (use it as the idempotency key: delivery is at-least-once), `X-Whoobe-Event-Type`, `X-Whoobe-Timestamp`.

```json
{ "id": "…", "type": "object.updated", "occurredAt": "2026-10-16T10:50:12.000Z",
  "class":  { "id": "3e7e103d-…", "name": "Contact" },
  "object": { "id": "…", "translationGroupId": "…", "locale": "en", "key": "events-try-ap", "published": false, "workflowState": null, "updatedAt": "…" },
  "changed": ["company"], "actor": { "type": "user", "id": "…" }, "instance": "…" }
```

To get the values the flow reads the record with an API client key (`GET /client/v1/data/<class>/<id>`); the event is deliberately minimal.

## 4. Rules to know

- **Fixed path**: a route with `{parameters}` cannot be used. The route must be POST, PUT or PATCH.
- **Outbound checks** are the Gateway's. In development a loopback engine is allowed; in production loopback is refused: set
  `OUTBOUND_ALLOW_HOSTS=<engine host name>` (exempts that one host). Private ranges are open unless `OUTBOUND_ALLOW_PRIVATE=false`.
- **Retries**: a non-2xx answer or a network error retries after 1 min, 5 min, 30 min, 2 h, 12 h, then the delivery is `dead` (visible, retryable).
  The consumer's answer body is never stored.
- **Switch off**: pause the subscription (`"enabled": false`), or `OBJECT_EVENTS_ENABLED=0` on the instance (no events, no worker).
- **Not in the public sandbox.**

## 5. What was tried (2026-10-16)

A copy of the development database (class Contact), core-api and gateway of the branch on other ports, the local Activepieces flow above:
a Contact created, updated and deleted through the API, plus "send test event": 4 events, all `delivered` on the first attempt. The same
chain with a plain HTTP receiver showed the payload carries the changed field names and the actor and no attribute value.
