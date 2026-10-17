# No automation engine of our own

## Decision
Whoobe does **not** build a workflow engine (triggers, steps, branches, waits, retries, run log, visual editor). It provides the **points where an
external engine plugs in**: a form or an API client sends a request to a webhook and reads back one validated word, the `outcome`, and the page (or
the caller) acts on it. The engine (Activepieces, n8n, or anything that answers a webhook) is chosen, installed and operated by the organisation.

## Why
- **It is a product, not a feature.** Durable execution, retries, idempotency, dead letters, a run log and a visual editor are what engines are made
  of and what their teams work on full time.
- **The connectors never end.** An engine without integrations is empty, and each service brings its own authentication, limits and changes.
- **Failures are judged harshly.** A silently lost lead or a double e-mail is worse than no automation.
- **Security surface.** An engine that calls third parties with stored credentials on behalf of public submissions is an SSRF and secret-leak target;
  a separate process keeps those credentials out of the CMS.
- **Licence fit.** Whoobe is MIT. n8n's licence prevents bundling it; Activepieces is MIT outside its enterprise folder. Documenting both avoids the issue.

## What it costs
- **Two products to learn and two places to look for a failure** (the gateway log and the engine's run history).
- **A second service to run, update and back up.**
- **The page learns one word.** Richer answers need a different mechanism.
- **Whoobe cannot see inside a flow.** It sends the event and reads the outcome; what happens in between, and why a step failed, is in the engine's own run history. A record change reaches an engine through [object events](../../communication/object-events.md), a signed webhook with a delivery log and a form submission starts a flow the same way. Other triggers (a schedule, an outside event) are the engine's own.

## When to revisit
When customers must run automations with no second service, or a trigger needs the CMS's internal state in a transactional way, or an embeddable
engine with a compatible licence appears.

## Where it shows in the product
[Marketing automation](../../communication/marketing-automation.md), [automations architecture](../../communication/automations-architecture.md),
automations as API client scopes in the [API clients guide](../../communication/api-clients.md); full reasoning in
[`why-no-custom-automation-engine.md`](https://github.com/swina/whoobe_project/blob/master/docs/plans/automations/why-no-custom-automation-engine.md).
