# Form result event (prototype)

*Date: 2026-10-10. Part of [marketing-automation-review-and-plan.md](marketing-automation-review-and-plan.md), Phase 1.*
*Status: implemented as a prototype on branch `feat/form-result-event`; unit-tested, **not yet tried in a browser** (the checks in section 7 are the ones to do).*

A form tells the page how a submission ended, and the page decides what to do: show a block, hide another, redirect, open a
dialog. The "what to do" is written with the AlpineJS directives every element already has (**Advanced > AlpineJS**); no new
screen is needed. For a form wired to a service through the Gateway (for example an n8n workflow) the service can add one
word to its reply, the **outcome**, so that different answers lead to different things on the page.

## 1. How it works

1. The visitor submits the form. For a Gateway form the request goes to the Gateway, which calls the service (n8n).
2. The service replies with JSON. If it contains `"outcome": "<key>"`, the Gateway checks the key and passes it on.
3. When the submission ends, the form dispatches a DOM event **`whoobe-form-result`** on its `<form>` element. The event
   bubbles, so any ancestor can listen for it. Its `detail` is `{ ok, outcome }`:
   - `ok`: `true` if the submission succeeded, `false` if it failed (network error, the service refused, a file was refused).
   - `outcome`: the key the service answered, or `null` (no key in the reply, an invalid key, a failed submission, or a form that does not go through the Gateway).
4. Elements listening with Alpine change their state and the page updates.

The event is dispatched by every form runtime: the editor and its preview, and the published sites (Vue/Nuxt, React/Next, Svelte).

## 2. The outcome key

A plain key: 1 to 32 characters, letters, digits, `_` or `-` (`qualified`, `not_qualified`, `needs_verification`).
Anything else is dropped (the outcome becomes `null`): spaces, dots, markup, longer strings, numbers, objects.

This is deliberate. The key is the **only** part of the service's reply the page acts on, and it can never be text or
markup, so nothing a third party sends can end up in the visitor's page. Messages and content are written by the editor
inside the page, not by the service. The check is made twice: by the Gateway (`apps/gateway/src/submit-outcome.ts`) and again in the
visitor's browser (`sanitizeOutcome` in `@whoobe-cms/renderer`).

## 3. What the service must reply (n8n)

In the workflow, the last node (the one the Webhook node answers with) returns the key:

```json
{ "outcome": "qualified" }
```

In the n8n experiment workflow ([n8n-local-experiment.md](n8n-local-experiment.md)), add a field to the *Set* node:

| Name | Type | Value |
|---|---|---|
| `outcome` | String | `={{ $json.body.email.endsWith('@example.com') ? 'qualified' : 'not_qualified' }}` |

(Any logic works: an *IF* node before the reply, a call to HubSpot and a decision on its answer, and so on. The reply may carry other
fields; they are not used, see section 6.)

## 4. Reacting in the page (AlpineJS)

Put the listener on an element that **contains** the form (a container around it) and the blocks that change inside the same
container. In **Advanced > AlpineJS** of the container add:

| Directive | Value |
|---|---|
| `x-data` | `{ done: false, ok: false, outcome: null }` |
| `@whoobe-form-result` | `done = true; ok = $event.detail.ok; outcome = $event.detail.outcome` |

and on each block that depends on the result (also a container, with its content):

| Block | Directive | Value |
|---|---|---|
| "Thanks, you are qualified" | `x-show` | `outcome === 'qualified'` |
| "Thanks, we will get back to you" | `x-show` | `outcome === 'not_qualified'` |
| "Something went wrong" | `x-show` | `done && !ok` |
| The form itself (to hide it after sending) | `x-show` | `!done \|\| !ok` |

Give the blocks that start hidden an inline style `display:none`: Alpine removes it when the block must show, and it avoids a
flash before Alpine starts. (Alpine's own `x-cloak` needs a CSS rule `[x-cloak]{display:none}` on the page; check that your template has it.)

The directives work on the preview and on published sites, **not on the editor canvas** (Alpine does not run there).

Other things the same event can do: `@whoobe-form-result="if ($event.detail.outcome === 'qualified') window.location = '/thank-you'"`
(redirect depending on the outcome; the form's own *Redirect URL* is the same thing without an outcome), or toggling a dialog.

## 5. Turn the popup off

By default the form still shows its success / error message in a popup. If the page shows its own blocks, turn the popup
off: form settings, **Show the message popup** (checkbox at the end of the *On error* box). Saved as `formConfig.showResultMessage`
(absent means *on*, so forms saved before keep their behaviour). In the editor preview the redirect URLs of the form still work and the event is dispatched before the redirect; the published-site runtimes do not apply the form's redirect URLs (they never did).

## 6. Limits and things to know

- **The Gateway still passes the whole reply on** (`response: <body of the service>`) in its answer, next to `outcome`: this
  prototype did not change it. The renderer client ignores everything but the outcome, but the HTTP reply is visible to the
  visitor, so the service must not return secrets or personal data. Removing `response` is a behaviour change of a public
  route and is listed as a decision in the plan (section 5, point 5).
- **Hidden is not secret.** Blocks hidden with `x-show` are in the page HTML. This is for the visitor's experience, not for
  restricted content (plan, S2).
- **Alpine needs script evaluation.** Alpine's standard build evaluates its expressions with `new Function`; a Content-Security-Policy that
  forbids `unsafe-eval` on the published site would stop it. Not checked for the generated sites.
- **No canvas preview.** The editor canvas does not run Alpine: test in the preview.
- **The offline queue** of the generated PWA replays form data without a page: the outcome is not used there.
- **Failures** always report `{ ok: false, outcome: null }`: the service cannot choose the failure message.

## 7. Still to check in a browser

1. The preview: submit the experiment form, the right block shows for `qualified` and for `not_qualified`.
2. A published Nuxt site (and a React or Svelte one if used): the same.
3. The popup off / on; a form without any listener behaves as before; a form that fails (stop n8n) reports `ok: false`.
4. The outcome with a bad value (n8n replying `"outcome": "<b>x</b>"`) leaves `outcome` null.

## 8. What changed (files)

| Where | Change |
|---|---|
| `packages/sdk/renderer/src/form-result.ts` (new) | event name, `sanitizeOutcome`, `dispatchFormResult`, `showsResultMessage` |
| `packages/sdk/renderer/src/api-client.ts` | a Gateway `submitForm` returns `{ success, outcome? }` (only the checked key) |
| `apps/gateway/src/submit-outcome.ts` (new), `submit-handler.ts` | `extractOutcome`; the reply carries `outcome` |
| `packages/sdk/vue`, `react`, `svelte` (`defaults`, `useForm`/hooks, `WhoobeForm.svelte`) | dispatch the event on success and failure; honour `showResultMessage` |
| `apps/whoobe-one-spike/src/scripts/form-actions.ts`, `form-result.ts` (new) | the same for the editor preview |
| `packages/sdk/schema` (`node.ts`, `validators.ts`), `ElementsClass.d.ts` | optional `formConfig.showResultMessage` |
| `FormConfigControl.vue` | the *Show the message popup* checkbox |
| tests | `form-result.test.ts`, `api-client.test.ts` (renderer); `scripts/security/unit/form-result-event.test.ts` |

## 9. Where this could go next

- A small **outcome map** in the form settings ("qualified" -> message / redirect) for editors who do not want to write directives; it would use this same event.
- Stop returning the service's whole reply (plan, Phase 1).
- A preset in **Advanced > AlpineJS > Presets** with the directives of section 4.
