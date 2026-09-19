# API GATEWAY SCHEMA PROBLEM

I am trying the hubspot gateway but for example the contacts route result is

```
{
  "results": [
    {
      "id": "871348108500",
      "properties": {
        "createdate": "2026-09-19T05:12:11.080Z",
        "email": "bh@hubspot.com",
        "firstname": "Brian",
        "hs_object_id": "871348108500",
        "lastmodifieddate": "2026-09-19T05:27:13.225Z",
        "lastname": "Halligan (Sample Contact)"
      },
      "createdAt": "2026-09-19T05:12:11.080Z",
      "updatedAt": "2026-09-19T05:27:13.225Z",
      "archived": false,
      "url": "https://app-eu1.hubspot.com/contacts/149367504/record/0-1/871348108500"
    },
    {
      "id": "871351423202",
      "properties": {
        "createdate": "2026-09-19T05:12:10.572Z",
        "email": "emailmaria@hubspot.com",
        "firstname": "Maria",
        "hs_object_id": "871351423202",
        "lastmodifieddate": "2026-09-19T05:27:13.223Z",
        "lastname": "Johnson (Sample Contact)"
      },
      "createdAt": "2026-09-19T05:12:10.572Z",
      "updatedAt": "2026-09-19T05:27:13.223Z",
      "archived": false,
      "url": "https://app-eu1.hubspot.com/contacts/149367504/record/0-1/871351423202"
    }
  ]
}
```

The schema viewer gives me:

```
{
  "type": "object",
  "fields": [
    {
      "key": "status",
      "type": "string",
      "sample": "error",
      "nullable": false
    },
    {
      "key": "message",
      "type": "string",
      "sample": "The OAuth token used to make this call expired 20715 day(s) ago.",
      "nullable": false
    },
    {
      "key": "correlationId",
      "type": "string",
      "sample": "01a0b821-d9d8-7835-893c-34cd013c8d12",
      "nullable": false
    },
    {
      "key": "category",
      "type": "string",
      "sample": "EXPIRED_AUTHENTICATION",
      "nullable": false
    },
    {
      "key": "context",
      "type": "object",
      "fields": [
        {
          "key": "expire time",
          "type": "array",
          "items": {
            "type": "string",
            "sample": "1970-01-01T00:00:00Z",
            "nullable": false
          },
          "sample": [
            "1970-01-01T00:00:00Z"
          ],
          "nullable": false
        }
      ],
      "sample": {
        "expire time": [
          "1970-01-01T00:00:00Z"
        ]
      },
      "nullable": false
    }
  ]
}
```

Schema doesn't look to match 

## Fix

● Root cause found and fixed

  Your file's mismatch was caused by a real bug: apps/gateway/src/admin-routes.ts's /test and /refresh-schema
  handlers always ran inferSchema() on whatever the upstream returned — including error responses. When you
  first tested the HubSpot contacts route with the invalid token, HubSpot's {status, message, correlationId,
  category, context} error JSON got permanently saved as the route's schema. After you fixed the token,
  HubSpot started returning real contact data, but nothing re-triggered a schema save, so the schema viewer
  kept showing the old error shape.

  Fix: both handlers now check the upstream status — a non-2xx response is reported back as an error and the
  stored schema is left untouched, instead of overwriting it.

  - apps/gateway/src/admin-routes.ts — added the 2xx guard in /routes/:id/test and
    /routes/:id/refresh-schema.
  - apps/admin-dashboard/src/utils/gateway-api.ts, GatewayEndpointsView.vue, stores/gatewayStore.ts — client
    side now surfaces that error instead of rendering it as if it were the real schema.

  I also refreshed your HubSpot contacts route's stored schema directly (calling it live with your working
  token) — it now correctly shows results: [{ id, properties: {...}, createdAt, updatedAt, archived, url }],
  matching the sample in your file. Typecheck passes for both apps/gateway and apps/admin-dashboard.
