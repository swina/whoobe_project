# Experiment: a Whoobe form calling n8n (local)

*Date: 2026-10-10. Context: [marketing-automation-review-and-plan.md](marketing-automation-review-and-plan.md), section 4, Phase 1.*
*Status: tried on the owner's development machine; the form data reached n8n. Nothing in the repository was changed for it: it is only configuration.*

**Goal.** See, with no code, what a "form triggers an automation" flow looks like today, before deciding how much of the
automation plan to build. A page form posts to a Gateway endpoint; the endpoint is a webhook of a self-hosted
[n8n](https://n8n.io); n8n can then do anything (HubSpot, Brevo, a spreadsheet, a message).

**Licence note.** n8n is source-available (Sustainable Use License): free to self-host for your own internal use and for
trying things out, but it **cannot be bundled into a product you sell or resold as a service**. So Whoobe documents how to
call it; it does not ship it.

---

## 1. Run n8n locally

```bash
docker volume create whoobe-n8n-test
docker run -d --name whoobe-n8n-test --restart unless-stopped \
  -p 127.0.0.1:5678:5678 \
  -v whoobe-n8n-test:/home/node/.n8n \
  -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
  -e N8N_PERSONALIZATION_ENABLED=false -e N8N_SECURE_COOKIE=false \
  n8nio/n8n:latest
```

- Bound to `127.0.0.1` only. Tried with n8n 2.42.6; pin a tag if you want a repeatable setup.
- `N8N_SECURE_COOKIE=false` is only for plain `http://localhost`; never use it behind a real hostname.
- The first visit to `http://localhost:5678` asks you to create the local owner account.

## 2. A test workflow

Save as `wf.json` and import it. It has a Webhook node (POST, path `whoobe-form`, answers with the last node) and a Set
node that echoes what it received and adds `handledBy: n8n`:

```json
[{
  "id": "whoobeFormTest1",
  "name": "Whoobe form test",
  "active": false,
  "nodes": [
    {"parameters": {"httpMethod": "POST", "path": "whoobe-form", "responseMode": "lastNode", "options": {}},
     "id": "11111111-1111-4111-8111-111111111111", "name": "Webhook", "type": "n8n-nodes-base.webhook",
     "typeVersion": 2, "position": [0, 0], "webhookId": "whoobe-form-test"},
    {"parameters": {"assignments": {"assignments": [
       {"id": "a1", "name": "received", "value": "={{ $json.body }}", "type": "object"},
       {"id": "a2", "name": "handledBy", "value": "n8n", "type": "string"}]}, "options": {}},
     "id": "22222222-2222-4222-8222-222222222222", "name": "Set", "type": "n8n-nodes-base.set",
     "typeVersion": 3.4, "position": [240, 0]}
  ],
  "connections": {"Webhook": {"main": [[{"node": "Set", "type": "main", "index": 0}]]}},
  "settings": {}, "pinData": {}
}]
```

```bash
docker cp wf.json whoobe-n8n-test:/tmp/wf.json
docker exec whoobe-n8n-test n8n import:workflow --input=/tmp/wf.json
docker exec whoobe-n8n-test n8n publish:workflow --id=whoobeFormTest1
docker restart whoobe-n8n-test        # a published workflow is picked up on restart
curl -s -X POST http://127.0.0.1:5678/webhook/whoobe-form -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"test@example.com"}'
# -> {"received":{"name":"Test","email":"test@example.com"},"handledBy":"n8n"}
```

You can also build the same workflow in the n8n editor. Note the two URLs n8n shows: `/webhook-test/...` works only while
you listen in the editor, `/webhook/...` works once the workflow is published (use this one).

## 3. The Gateway endpoint (admin dashboard, Integrations)

*Add Endpoint*:

| Field | Value |
|---|---|
| Name | `n8n` (the form refers to it by name) |
| Base URL | `http://localhost:5678` |
| Authentication | none (see "Before using it for real" below) |
| Route | `POST /webhook/whoobe-form` |

If the Gateway runs **in a container**, `localhost` is the container itself: use `http://host.docker.internal:5678`, or put n8n on the
same Docker network and use its container name. When the Gateway runs on the host (the usual development setup) `localhost` works.

## 4. The form in the editor

1. Put a Form on a page (inputs need a `name`: only the form's own fields are forwarded to n8n).
2. In the form's advanced panel choose the Gateway target: endpoint `n8n`, route `/webhook/whoobe-form`.
3. **Assign the page to a website** (page settings) **and save it.** The link between a form and its Gateway route (the
   `gatewayBindingId`) is created at save time and only for pages that belong to a website. A page without a website
   saves fine but the form answers *"Save the page to send this form"* however many times you save (this cost us a
   round trip during the experiment).
4. Submit the form from the preview or the published page. The execution appears in n8n under *Executions*.

What reaches n8n is the body `{ "<input name>": "<value>", ... }` (the honeypot field is removed, and only fields the form
really has are forwarded).

## 5. Things to know

- **Reply to the visitor.** The Gateway answers `{ success: true, response: <what n8n returned> }`. The form shows its own
  *success message*. Anything n8n returns is visible to the visitor in the HTTP reply, so do not return secrets or personal
  data from the workflow. (The plan's Phase 1 would replace this with an explicit response mapping.)
- **Timeout.** The Gateway waits 15 seconds for n8n. For slow work, answer immediately (Respond to Webhook node, or
  response mode *Immediately*) and continue in the background.
- **Errors.** A non-2xx reply from n8n becomes a generic *"Upstream rejected the submission"* (502) for the visitor; the
  details are in the Gateway log.
- **Outbound protection.** The Gateway only calls out through the guarded fetch (SSRF protection). In development
  loopback and private addresses are allowed. In production loopback (`localhost`, `127.0.0.1`) is blocked and private
  networks are allowed unless `OUTBOUND_ALLOW_PRIVATE=false`; a specific host is allowed with `OUTBOUND_ALLOW_HOSTS`.

## 6. Before using it for real

- Put n8n behind HTTPS and give the webhook a secret: in n8n, *Header Auth* on the Webhook node; in Whoobe, endpoint
  authentication *API key* (header name and value). A public webhook with no secret accepts anything.
- Rate limits: the Gateway limits submissions per visitor address and per site (10 per 15 minutes per visitor); n8n has none by default.
- Do not run n8n with the owner account's password in a shared place; its credentials store holds the keys of every service it calls.
- Pin the n8n image tag and back up the `whoobe-n8n-test` volume (workflows and credentials live there).

## 7. Reacting to n8n's answer

A workflow can answer `{ "outcome": "qualified" }` and the page can show different blocks for different outcomes, using the
form's `whoobe-form-result` event and AlpineJS directives. See [form-result-event.md](form-result-event.md) (prototype).

## 8. What this experiment did not cover

Verified e-mail before unlocking content, personalised content, retries and a run log (n8n has its own executions list), and the
visual editor inside Whoobe. (The form does not use n8n's answer in this first setup; section 7 is the prototype that does.) These are the parts of the plan that n8n does not give you.

## 9. Clean up

```bash
docker rm -f whoobe-n8n-test && docker volume rm whoobe-n8n-test
```

Then delete the `n8n` endpoint in the Integrations screen and unlink the form.
