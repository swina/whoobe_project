# Why Whoobe does not build its own automation engine

*Date: 2026-10-11. Status: **decided by the owner, 2026-10-11**. Context: [marketing-automation-review-and-plan.md](marketing-automation-review-and-plan.md)
(Phases 4 and 5 propose a custom engine and visual editor; this document argues for replacing them).*

> **Position of 2026-10-16 (owner), which replaces any "first engine" or "n8n excluded" wording below.** Whoobe distributes **no engine** and prefers none.
> Anyone who wants automations or object events needs an engine of their own choice (Activepieces, n8n, Make, a script: anything that takes a
> webhook); installing it, reaching it from the Gateway and respecting its licence are that person's responsibility. Activepieces was used in the tests
> only for convenience, to avoid building another gateway. The Gateway is a pass-through that keeps no state and no runs; whatever engine is used looks
> after its **own runs** (as Activepieces and n8n do), and a plain Node.js service would simply receive, process and reply.

## 1. The decision

Whoobe does **not** build a workflow / automation engine (triggers, steps, branches, waits, retries, run log, visual editor).
It provides the points where an external engine plugs in, and it documents how to plug in a specific one:

- **Forms and the Gateway** send a submission to any HTTP endpoint (a webhook) and read one validated word back, the
  `outcome` ([form-result-event.md](form-result-event.md)).
- **The page** reacts to that outcome with the AlpineJS directives every element already has.
- **The engine** (Activepieces, n8n or anything that answers a webhook) is chosen, installed and operated by the organisation
  that runs the Whoobe instance. Whoobe ships neither; it documents both
  ([activepieces-local-experiment.md](activepieces-local-experiment.md), [n8n-local-experiment.md](n8n-local-experiment.md)).

What stays inside Whoobe is what only Whoobe can know: the form, the page, the visitor's session, the outcome contract, and (later) signed
entitlements and visibility rules (plan Phases 2 and 3).

## 2. Why not build it

**It is a product, not a feature.** The plan's own estimate for Phase 4 is "L" and it needs, before it is useful (plan, A2):
a transactional outbox, a run table with persisted state, idempotency keys per step, retries with backoff, a dead-letter state,
step timeouts, a concurrency cap, a kill switch and a readable run log. Phase 5 adds a visual editor with typed nodes,
validation and version history. That is the core of what Activepieces and n8n are, and each has a team working on it full time.

**The connectors are the larger part, and they never end.** An engine without integrations is empty. HubSpot, Brevo, Google
Sheets, Gmail, Slack and the next hundred services each have their own authentication, pagination, rate limits and API changes.
Today the Gateway has presets for a few vendors; every extra one is a maintenance debt that an existing engine already carries
(Activepieces: several hundred pieces, each an independent npm package).

**Robustness is what users judge it by.** A marketing automation that silently loses a lead, sends an e-mail twice or loops
against a vendor is worse than none. Getting durable, exactly-once-enough execution right takes long and is paid for in
incidents. The existing XState code in `packages/core` is used statelessly (`isTransitionValid`); turning it into a durable
orchestrator is the hard part, not the diagram.

**Security surface.** An engine that calls third-party APIs with stored credentials, on behalf of public form submissions, is an
SSRF, secret-leak and abuse target (plan S7 and the risks table: loops, floods, secrets in logs). Using a separate, purpose-built
process keeps those credentials out of the CMS, its pages and its database.

**Focus.** Whoobe's value is the CMS, the editor, the sites and the DAM. Time spent rebuilding a workflow tool is time not spent there.

## 3. Why this fits Whoobe's licence and deployment model

- Whoobe is **MIT**. A bundled engine must be compatible with that. **n8n** (Sustainable Use License) cannot be bundled into a
  product or resold as a service, so it can only be *documented*. **Activepieces** is MIT outside its `packages/ee/` folder, so the
  core could even be shipped in a sample compose file. Its paid parts (SSO, audit log, embedding the editor inside another
  product) are not needed to call a flow from a form.
- One instance serves **one organisation** (deployment model): the organisation can run its own engine next to Whoobe and own its
  credentials. There is no multi-tenant engine to build or isolate.
- The contract is **vendor neutral**: a webhook in, `{ "outcome": "<key>" }` out. Verified with n8n and with Activepieces without any change to Whoobe. Switching
  engine, or using a vendor's own automation (HubSpot workflows, Brevo automations), does not touch the product.

## 4. What the owner gives up

- **No single screen.** The marketer builds flows in the engine's editor, not inside Whoobe. Two products to learn and two places to look for a failure (Whoobe's Gateway log, the engine's run history).
- **A second service to run, update and back up** (and to secure: HTTPS and a secret on the webhook; see section 6 of each guide).
- **Whoobe cannot see inside a flow.** Triggers other than form submission (asset downloaded, content published) need Whoobe to *emit* a webhook; that is small, but it is work, and it is the right next step if they are wanted.
- **The page only learns one word.** Richer answers (a personalised message, a token) need the signed-entitlement work of plan Phase 2, not the engine.

## 5. When to revisit

Build (or embed) an engine in Whoobe only if one of these becomes true and cannot be met by plugging one in:

1. Customers need to run automations without installing any second service, and the sample compose file is not accepted.
2. A trigger or action needs the CMS's internal state in a way a webhook cannot carry (transactional guarantee with a database write).
3. An embeddable engine with a licence compatible with Whoobe's offer appears (for example Activepieces' embed SDK on acceptable commercial terms).

Until then the cost of the first option is a few hundred lines (webhook emitter, outcome, docs), against months for the second.

## 6. Consequences for the plan

- **Phases 4 and 5** (automation engine, visual editor) are replaced by: a documented integration (done: two guides), a sample compose file with Activepieces (`docker-compose.automation.yml`, MIT core; a convenience for trying things locally, **not** something Whoobe distributes or supports as part of the product) and, when wanted, a webhook **emitter** for non-form events.
- **Phases 1 to 3** are unchanged: form outcomes (prototype done), signed entitlements, visibility rules. They are the parts no external engine can do.
- Section 5 of the plan gains a decision: "Engine: plug in (this document) or build (Phases 4-5)".
