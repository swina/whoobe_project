# Marketing automation: forms that start a flow

A form can hand its submission to an **automation engine** (Activepieces, n8n, or anything that answers a webhook), and the page
can react to the engine's answer: show a "thank you" block, another one for a visitor who does not qualify, a message for an error.
Whoobe does **not** run automations itself. It connects the form to the engine, keeps a list of where each connection is, and
leaves building the flow (send an e-mail, create a contact in HubSpot or Brevo, decide who qualifies) to the engine's own editor.

For where this sits in the architecture (boundaries, state, failure behaviour, deployment of the engine) see
[`architecture/automations.md`](../architecture/automations.md).

## 1. How it works

1. The visitor submits a form. Its target is a **Gateway endpoint**: the request goes to the Gateway (`POST /api/v1/gateway/submit`),
   which calls the engine's webhook with the form's own fields. The credentials of the engine stay on the server.
2. The flow runs. Its last step answers the webhook with JSON. If the reply contains `"outcome": "<key>"`, the Gateway checks the
   key and passes it on.
3. The form tells the page how the submission ended with a browser event, **`whoobe-form-result`**, sent on the `<form>`
   element. It bubbles, so any element above the form can listen to it. Its `detail` is `{ ok, outcome }`:
   - `ok`: `true` if the submission succeeded; `false` if it failed (network, the engine refused, a file was refused).
   - `outcome`: the key the engine answered, or `null` (no key, an invalid key, a failure, or a form that does not go through the Gateway).
4. Elements that listen to the event with AlpineJS directives change their state and the page updates.

The event is sent by the editor preview and by the published sites (Vue/Nuxt, React/Next and Svelte).

## 2. Set it up

### 2.1 The engine and the endpoint

Run an engine (section 4). In the dashboard, **Integrations > Add Endpoint**: base URL of the engine and, in **Routes**, a `POST`
route to the flow's webhook (Activepieces: `/api/v1/webhooks/<flow id>`; n8n: `/webhook/<path>`). Give the webhook a secret
(section 5) and set the same on the endpoint (authentication *API key*: header name and value).

### 2.2 The form

In the editor, select the form, **Advanced > Form settings**:

| Setting | What it does |
|---|---|
| **Handle submissions** | turns the form on. A form without it is not an automation |
| **Automation name** (optional) | the name shown in the Automations list (otherwise the page or snippet title) |
| **Target > Gateway endpoint**, endpoint and route | where the submission goes. The lists are read again each time the window opens |
| **Show the message popup** | the built-in success / error message. Turn it **off** when the page shows its own blocks |

Save the page: the Gateway binding of the form is resolved on save.

### 2.3 The engine's answer

The flow's last step returns the key, for example `{ "outcome": "qualified" }`:

- Activepieces: action **Return Response** (Webhook piece), JSON body. To decide, add a **Branch** before it with a Return Response per branch.
- n8n: the Webhook node answers with the last node; set the field `outcome` in it (and the Webhook node's *Respond* option to match).

The key is 1 to 32 letters, digits, `_` or `-` (`qualified`, `not_qualified`, `needs_verification`). Anything else is dropped and the
outcome becomes `null`: the key is the only part of the reply the page acts on, and it can never be text or markup, so nothing a
third party sends ends up in the visitor's page. The check is made twice, in the Gateway and in the visitor's browser.

### 2.4 The page

Put the listener on an element that **contains** the form, and the blocks that change inside the same element. In **Advanced > AlpineJS**
of the container:

| Directive | Value |
|---|---|
| `x-data` | `{ done: false, ok: false, outcome: null }` |
| `@whoobe-form-result` | `done = true; ok = $event.detail.ok; outcome = $event.detail.outcome` |

On each block that depends on the answer:

| Block | Directive | Value |
|---|---|---|
| "Thanks, you are qualified" | `x-show` | `outcome === 'qualified'` |
| "Thanks, we will get back to you" | `x-show` | `outcome === 'not_qualified'` |
| "Something went wrong" | `x-show` | `done && !ok` |
| The form itself, to hide it after sending | `x-show` | `!done \|\| !ok` |

Give the blocks that start hidden the inline style `display:none` so they do not flash before Alpine starts. To redirect instead:
`@whoobe-form-result="if ($event.detail.outcome === 'qualified') window.location = '/thank-you'"`.

The directives work in the **preview** and on published sites, **not on the editor canvas** (Alpine does not run there).

## 3. The list of automations

Every form with **Handle submissions** on, in every page and snippet, is listed in two places:

- **Dashboard > Data & Communication > Automations**: a table with the name, where it is (page or snippet), the website, endpoint and
  route, and whether the page reacts to the answer (an AlpineJS `@whoobe-form-result` on the form or on an element above it). Search,
  endpoint and website filters. **Open** (or a click on the row) opens the page or snippet with the form selected; the link icon opens the engine.
- **Editor > Automations** (the tool bar on the right): the same list inside the editor; **Open** uses a new browser tab so the work in
  progress is not replaced.

The list is built from the saved pages and snippets each time it is opened. It shows what is **saved**, it cannot tell whether the
flow exists or is published in the engine, and a form inside a snippet used on several pages appears once.

## 4. Choosing an engine

| | Licence | Notes |
|---|---|---|
| **Activepieces** | MIT, except the `ee` folders of its repository (commercial: SSO, audit log, advanced permissions, embedding its editor in another product) | The core is enough to call a flow from a form. Product name and logo are its trademarks. Needs PostgreSQL and Redis for real use (a single-container trial mode exists) |
| **n8n** | Sustainable Use License (source-available, not open source) | Free to self-host for your own internal use; it cannot be bundled into a product you sell or resold as a service, so Whoobe documents it and does not ship it |

Re-read the licence of the version you install. Both were tried with a form of Whoobe (an e-mail through a fake SMTP server and the
`outcome` reaching the page); nothing in Whoobe depends on the choice, since the contract is "a webhook in, an optional `outcome` out".

To try one locally: [`docker-compose.automation.yml`](../../../docker-compose.automation.yml) runs Activepieces with PostgreSQL and
Redis (the three secrets it needs are read from the environment; keep the same values, the encryption key decrypts the stored
connections), bound to `127.0.0.1`; [`scripts/automation-test.sh`](../../../scripts/automation-test.sh) starts or stops a single-container
Activepieces (or n8n with the argument `n8n`) next to a development stack. Step-by-step: [`docs/plans/automations/activepieces-local-experiment.md`](../../plans/automations/activepieces-local-experiment.md)
and [`n8n-local-experiment.md`](../../plans/automations/n8n-local-experiment.md).

The SMTP piece of Activepieces only offers the ports 25, 465, 587 and 2525; for a test server on another port (Mailhog 1025) forward one of them to it.

## 5. Security

- **Secret on the webhook.** A public webhook accepts anything. Use *Header Auth* (n8n) or a header check in the flow, and the same
  header as the endpoint's *API key* in Whoobe. Put the engine behind HTTPS.
- **Rate limits.** The Gateway limits submissions to 10 per 15 minutes per visitor address and 300 per 15 minutes per website; the
  engine has no such limit by default.
- **The whole reply is passed on.** Besides `outcome`, the Gateway still returns the engine's whole reply (`response`) to the
  browser. The flow must not answer with secrets or personal data.
- **Hidden is not secret.** Blocks hidden with `x-show` are in the page's HTML. This is for the visitor's experience, not for
  restricted content.
- **Alpine needs script evaluation.** Its standard build evaluates expressions with `new Function`; a Content-Security-Policy that
  forbids `unsafe-eval` on a published site would stop it. Not checked for the generated sites.
- **The engine holds the keys** of every service it calls (HubSpot, Brevo, a mail account). Keep its owner account private, back up its volume and its secrets, and update it.

## 6. Limits

- A form submission is the only trigger. Other events (an asset downloaded, a page published) do not start a flow.
- Whoobe shows no run history: use the engine's own executions list.
- A failed submission always reports `{ ok: false, outcome: null }`; the engine cannot choose the error message.
- The offline queue of a generated PWA replays form data without a page, so the outcome is not used there.
- A **verified** e-mail address, access to private content after a form, and showing content by visitor are not provided: the page only reacts to a word, and anything hidden is still in the HTML.
- A form that sends to an endpoint does not take file uploads ([`form-uploads.md`](form-uploads.md)).

Why Whoobe does not build its own engine: [`docs/plans/automations/why-no-custom-automation-engine.md`](../../plans/automations/why-no-custom-automation-engine.md).
