# Marketing automation: review and implementation plan

*Date: 2026-10-10. Based on `marketing-automation-plan.md` (v1.0.0, October 2026) and on the code of `master` at commit `0e1bd31`.*
*Status: proposal for the owner's decision. Nothing here is implemented. Statements about the code were checked in the
repository on the date above; the ones that were not are marked **(not verified)**.*

---

## 1. Summary

The vision of the source document is sound and fits the product: Whoobe already has the three pieces it builds on (the
Gateway with form bindings, the Brevo/HubSpot presets, XState in `packages/core`) and the Isometric canvas to host a
visual editor. But the document describes four things that are harder than it says, and two that would be unsafe if built
as written:

1. **Unsafe as written**
   - Personalisation driven by a *cookie* decides who sees content. A cookie is chosen by the visitor. It is fine for
     cosmetic variants; it is not an access control.
   - Unlocking protected assets after the vendor says "MQL" lets anyone unlock them by typing someone else's corporate
     e-mail address into a form (no proof that the visitor owns it).
2. **Underestimated**
   - Most Whoobe sites are published as **static exports** (publishing guide, Option C): server-side personalisation in
     `core-api` never runs for them.
   - The "automation orchestrator" is described as a worker but needs durable state, retries, idempotency and an audit
     trail; that is a small product on its own.
   - The visual canvas cannot store its logic inside page content (it is served publicly).
   - The mobile offline container (SQLCipher) does not exist in the repository (only a plain, unencrypted IndexedDB queue in the generated PWA scaffold).

The plan below keeps the phases of the source document in spirit but re-orders and splits them so that each step ships
something usable and the security prerequisites come before the features that depend on them.

---

## 2. What exists today (checked)

| The source document assumes | Reality in the repository |
|---|---|
| Gateway with form bindings and Brevo/HubSpot presets | **Yes.** `apps/gateway/src/submit-handler.ts` forwards a page form to the one endpoint/route pinned to that form at page-save time; only the fields the form has are forwarded (F-029); `apps/gateway/presets/` has brevo, hubspot, mailchimp, stripe, shopify... |
| "Send as Brevo campaign" | **Already built**: `BrevoCampaignModal.vue` renders the snippet/page HTML (Tailwind inlined) and creates a **draft** campaign through a Gateway endpoint. The `brevo-campaign-draft.html` artifact of section 4 is mostly done. |
| XState state machines | **Partly.** `packages/core/src/workflow/workflow-engine.ts` compiles a per-class publish workflow into an XState machine, used **statelessly** (`isTransitionValid`); there is no running actor, no persisted run, no side effects. |
| Isometric canvas as a workflow editor | The canvas exists (just extended with ports on all four sides and arrow heads). Its boxes are **real page containers** and its edges are plain lines `{fromId, toId, sides, style}` stored **in the page content tree**. There are no typed nodes. |
| Zod-validated layout trees, `@whoobe-cms/schema` | **Yes** (`packages/sdk/schema`, zod 3). No `visibilityRules` yet. |
| `core-api` intercepts SDK payload reads | Public reads are `GET /public/page/*`, `/public/pages/:locale/*`, `/public/pages` (`apps/core-api/src/server.ts`), answered with `Cache-Control: public, max-age=0, must-revalidate`. |
| Internal events (`Form_Submitted`, `Asset_Downloaded`) | **None on the server.** `whoobe-one-spike/src/bus.ts` is the editor's front-end bus only. Form submissions are not an event anybody can subscribe to. |
| SQLCipher container, biometrics, offline queue | **SQLCipher and biometrics: not found** (`packages/mobile-app` generates a Capacitor project without them). **A plain offline queue does exist** in the PWA scaffold that `packages/publish/src/cli.ts` generates: `enqueueMutation` / `replayQueue` keep mutations in an **unencrypted IndexedDB** store (`whoobe-offline-queue`) and replay them with `submitForm`. Whether it is wired to the form components, and whether the payload it replays still matches `submitForm`'s current signature, was **not verified**. |
| Edge middleware routing file | Nothing exists. The static export is produced by `packages/publish`. |

---

## 3. Considerations

### 3.1 Security and trust (decide before building)

**S1. A cookie is not an identity.** "Decodes segmentation cookies" lets any visitor set `segment=VIP`. Two classes are needed:

- *Audience* rules (cosmetic: a banner for returning visitors, a different hero). The unsigned cookie is acceptable;
  being wrong costs nothing.
- *Restricted* rules (content or files that must stay private). The segment must come from a **signed, expiring,
  server-issued token** (HMAC with a server secret, `HttpOnly`, `SameSite`, scoped to the instance), never from a value
  the browser can write. These responses are never cached publicly.

**S2. Variant content swapped at the edge or in the browser is not confidential.** In the model of
`segmentation-routing-rules.json` (swap `node-12` for `node-14` in a static page) both variants are in the HTML that
every visitor downloads. This is fine for A/B tests, not for private content. State it in the documentation; restricted
content must be removed on the server (S1), not hidden in the page.

**S3. "MQL unlocks private areas" needs proof of ownership.** The vendor classifies a *claimed* e-mail address. Without
verification, typing `ceo@bigcorp.com` unlocks the whitepaper for anyone. The entitlement must be issued only after a
**verification step** (a link sent to the address, double opt-in) or after the vendor's own verified-contact signal.
The entitlement itself is a signed token with an explicit scope (list of asset folders / docs areas) and a short
lifetime, enforced where the content is served: the DAM proxy (`DAM_ENFORCE_ASSET_VISIBILITY`, F-024) and the docs-site
auth (`apps/gateway/src/site-auth.ts`).

**S4. The submit route returns the vendor's body to the anonymous visitor.** Today `submit-handler.ts` answers
`{ success: true, response: result.body }`. For HubSpot that body can contain the contact record, lead score or
internal ids. Phase 1 ("parse vendor responses in the SDK") must not mean "forward more"; it means an explicit
**response mapping** configured per route (which fields of the vendor reply become an *outcome* such as
`qualified` / `not_qualified` / `needs_verification`), and everything else is dropped on the server. `gateway-result-filters.ts`
already exists for the resolve routes and is the place to start **(not verified for submit)**.

**S5. Rules must be data, not code.** The example `"if": "cookie.segment == 'VIP'"` is a string expression; evaluating
it invites `eval` or a mini-interpreter with its own bugs. Use a structured predicate, for example
`{ "all": [ { "field": "segment", "op": "in", "value": ["VIP", "partner"] } ] }`, validated by Zod, evaluated by one pure function in
`packages/core` with a closed set of operators. Same for automation conditions.

**S6. Privacy.** Segments computed from analytics or a CRM are personal data. Personalisation before consent is a
GDPR problem. The plan must include a consent gate (no segment is read or set before the visitor accepted the relevant
category) and a documented list of what is stored where (only the signed token in a cookie; nothing in Postgres).

**S7. Automations call third parties with the instance's credentials.** Reuse what already protects the Gateway: SSRF
guard (`safeFetch`, F-026/F-027), credentials encrypted at rest (F-055), per-route allowlists. Add: a per-automation
rate limit and a run budget (an automation that triggers an automation must not loop), and function-level permissions
(`automations:view`, `automations:manage`) in the same style as F-058.

### 3.2 Architecture

**A1. Static sites versus server-side personalisation.** The source document's ISR section admits that CDN-cached pages
cannot be personalised, but still makes `core-api` the primary mechanism. For Whoobe the realistic split is:

- *Dynamic reads* (preview, Nuxt/Next SSR sites that call `/public/page/*` per request): personalisation in `core-api`,
  with the cache headers set to `private` (or `Vary` on the token) for any page that has rules. A page with rules served
  with `public` cache headers would leak one visitor's variant to the next one.
- *Static exports*: variants are shipped in the HTML and chosen in the browser or at the edge (S2). Only audience rules.

Say this plainly in the documentation; do not promise "no layout shift, SEO-safe, restricted" for the static case.

**A2. The orchestrator needs durable execution, not just XState.** XState describes the machine; it does not give you
persistence, retries or exactly-once effects. Minimum design:

- *Transactional outbox*: a Postgres table written in the same transaction as the thing that happened (form submitted,
  asset downloaded). The worker reads it. No in-memory event bus: events must survive a restart.
- *Run table*: one row per automation run with the persisted machine state, the input snapshot, status, attempt count and
  next-attempt time. Resuming a run = rehydrating the machine from the stored state (the `compileWorkflowMachine`
  pattern already in `packages/core`).
- *Idempotency*: every action call carries a key `run id + step`; actions that are not idempotent upstream are marked and
  never retried automatically.
- *Retries with backoff, a dead-letter state, step timeouts, a global concurrency cap*, and a **run log** the editor can
  display (this is what makes automations debuggable by non-technical users).
- One instance serves one organisation (deployment model), so there is no tenant isolation problem inside the worker, but
  there must be a kill switch (setting) to pause all automations.

Start the worker as a module of the Gateway process (single instance, Postgres advisory lock so a second replica does
not double-run) and promote it to its own container only if load requires it. A new service from day one is more
moving parts than the first two phases justify.

**A3. Where the automation definition lives.** Not in the Isometric canvas element. Page content is served publicly
(`/public/page/*`): endpoints, mappings or conditions stored in a page would be exposed to every visitor. An
`automations` table (definition JSON validated by Zod, versioned, `draft` / `active`) is the source of truth; the editor
view is a separate screen that **reuses the canvas interaction code** (the new `isometric-ports.ts` geometry, drag, cables)
but with typed nodes: trigger, condition, action, wait, end. A page can reference an automation by id; it never contains one.

**A4. Segment sources.** The document says Whoobe "reads aggregated segmentation tokens" from PostHog/HubSpot but not how. Define one
inbound path: a signed-token issuer (S1), fed by (a) a Gateway call at form time (the MQL reply), (b) a verified webhook from the
vendor (signature checked, replay window), or (c) a static rule (UTM/campaign parameter, audience class only). Anything
else is out of scope until one of these is built.

**A5. `marketing-presets.json` versus what exists.** Gateway presets and workspace export/import already carry
integration configurations. A new file format duplicates them. Prefer extending presets with an optional `outcomes`
(response mapping) and `automations` section, and let the existing export/import move them between workspaces.

### 3.3 Scope and product

- **Offline SQLCipher container**: not present (only the unencrypted IndexedDB queue above), depends on a native plugin and biometric unlocking, and an offline queue
  of form submissions raises its own questions (replay, duplicate leads, server-side validation of stale payloads). Move to
  a separate plan; do not let it block the rest.
- **Email delivery stays out of scope** (the source document is right); the existing draft-campaign flow is the model.
  Extending it to other presets (Mailchimp) is cheap and independent.
- **Limits of the source document worth keeping verbatim**: no clickstream storage in Postgres, no SMTP/SMS workers.
- **Wording**: the claims of "zero-trust" and "absolute data security" should be removed from technical documents; the
  guarantees are the specific ones in S1-S7. Phase 1's task sentence ("Harder the client-side SDK...") needs rewriting; the
  phases have no acceptance criteria or sizes. This plan adds them.

---

## 4. Plan

Sizes are rough: **S** about 1-3 days, **M** about 1-2 weeks, **L** more than 2 weeks, for one developer who knows the code.
Every phase ends with: unit/API tests in `scripts/security`, the documentation page, the `CHANGES.md` entry, and (when it touches a
public route) a row in the route contract and an authorisation test.

### Phase 0: decisions and spikes (S)

- Decide the open questions in section 5.
- Spike 1: what the SDK adapters (`packages/sdk/react|vue|svelte|nuxt|next`) do today with the submit reply **(not verified)**.
- Spike 2: how the Nuxt static export and an SSR site read pages, to confirm which sites could use server-side rules (A1).
- Write the threat model addendum (S1-S7) in `docs/release/security/threat-model.md` as "planned".

### Phase 1: form outcomes (M)

*Goal: after a form submit, the page reacts to what the vendor said, without leaking the vendor's reply.*

- Gateway: a per-route **response mapping** (extend `preset-types.ts` and the route model): `outcomes: [{ when: <structured predicate on the vendor body>, outcome: 'qualified' | ... , message?: string }]`. The submit reply becomes
  `{ success, outcome, message }`; the raw body is no longer returned (**behaviour change**: check what the SDK adapters and the editor's preview read from `response`).
- Form binding: recorded at page-save time like the field allowlist, so a visitor cannot choose outcomes.
- SDK adapters and editor form element: loading state, per-outcome success overlay / inline message / redirect (the form already has `successMessage` and redirect fields).
- Admin UI: the mapping editor on the route (Integrations), with a "test with this sample reply" box.
- Security: predicate evaluator is the S5 pure function; tests for no-leak (a reply containing sensitive keys never reaches the visitor), mass-assignment regression (F-029) and rate limits (F-028) unchanged.
- *Acceptance*: a HubSpot form returns `qualified` / `not_qualified` and the page shows the matching block; a test proves the vendor's contact record is not in the HTTP reply.

### Phase 2: signed entitlements (M)  *(prerequisite of every "unlock" feature)*

*Goal: a verified visitor receives a scoped, expiring right to see restricted content.*

- Token service in `packages/core` (HMAC, secret in the existing encrypted settings, rotation, `kid`), cookie helper (`HttpOnly`, `Secure`, `SameSite=Lax`, scoped path).
- Verification step: the form outcome `needs_verification` sends a link (via the Gateway's mail route, no new mail infrastructure); clicking it issues the token. Without it no entitlement is issued (S3).
- Enforcement points: DAM proxy (restricted folders accept a valid entitlement besides a session), docs-sites auth (`site-auth.ts`). A new "audience" notion on folders / doc areas in the existing visibility rules.
- Consent gate (S6): the cookie is set only with the consent signal the site already collects **(not verified: is there a consent element?)**; if not, define one.
- Tests: forged / expired / wrong-scope token rejected, replay of a verification link rejected, restricted asset never cacheable publicly, tokens not accepted from query strings.
- *Acceptance*: unverified submit of a corporate address unlocks nothing; verified one unlocks exactly the scoped folder for the lifetime of the token.

### Phase 3: visibility rules and personalisation (M-L)

- `@whoobe-cms/schema`: optional `visibilityRules` on a node: `{ class: 'audience' | 'restricted', when: <predicate> }`.
- Evaluator: one pure function in `packages/core`, shared by core-api, the preview and the SDK renderer (so the editor's "preview as segment" shows what production shows).
- `core-api`: apply on the dynamic public reads (`/public/page*`) by recursively removing non-matching nodes; **pages with any rule are answered `Cache-Control: private` / `Vary`** (A1); restricted rules read only the signed token (Phase 2).
- Editor: a Visibility section in the advanced panel (class, rule builder from the structured predicate, "preview as" selector); a badge on nodes that have rules.
- Static export (`packages/publish`): audience rules only, variants shipped and selected in the browser; restricted rules are **removed at publish time** (restricted content never goes into a static file) with a visible warning in the publish dialog.
- Tests: rule evaluation matrix, cache headers, restricted node absent from the response body for a visitor without the token (grep the body), publish refuses a restricted node in a public static export.
- *Acceptance*: same page, two visitors, two different trees; the restricted block is not in the bytes sent to the second visitor.

### Phase 4: automation engine (L)

- Schema: `automations` (definition, version, status), `automation_runs`, `automation_outbox` (A2). Definition = Zod-validated JSON: trigger, steps `condition | action(gateway route) | wait | set_segment | end`.
- Producers: form submit (Gateway), later asset download (opt-in, sampled: a DAM proxy request is high volume) and manual trigger.
- Worker in the Gateway process with advisory lock; retries, dead-letter, kill switch; actions call existing Gateway routes through `proxyFetch` only (S7).
- API: `automations:view` / `automations:manage` permissions, CRUD, "run with sample payload" (dry-run: actions are logged, not sent), run history.
- Admin UI: list, status, last runs, run log with each step's input / output (secrets redacted).
- Security tests: loop detection, run budget, permission matrix, SSRF through an action, secrets never in the run log.
- *Acceptance*: "Form submit -> Brevo contact -> if MQL then set segment" runs unattended, survives a core restart in the middle, and its log explains every step.

### Phase 5: visual editor (M-L)

- Dedicated screen (A3), typed nodes, node inspector (the same fields as the JSON), validation (one trigger, no dangling nodes, no cycles without a wait), save as draft / activate, version history.
- Reuse the canvas code: factor drag / ports / cable drawing out of `BlockIsometric.vue` into shared composables so the page canvas and the automation editor do not diverge.
- Compile definition -> XState machine with the same function as the worker, so the editor can *simulate* a path.
- *Acceptance*: a marketer builds the Phase 4 flow without touching JSON; a test round-trips editor -> JSON -> worker.

### Phase 6 (optional, separate plans)

- Edge routing export (`segmentation-routing-rules.json`), audience class only (S2).
- Other campaign drafts (Mailchimp, HubSpot) following the Brevo modal.
- Offline mobile queue with encrypted storage (needs its own plan: plugin choice, key handling, replay and conflict rules).

### Order and dependencies

```
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3
                  \-> Phase 4 -> Phase 5
```

Phases 3 and 4 are independent of each other once Phase 2 exists; Phase 4 can start after Phase 1 if "unlock" is not
in its first flows. The smallest release that already delivers value: Phases 0-2 (forms that react and unlock safely).

---

## 5. Decisions needed from the owner

1. **Static or dynamic?** Which kind of sites do the first marketing users run: static exports (Nuxt/Next generated) or SSR reading the public API? It decides whether Phase 3's server side is used at all (A1).
2. **Verification step**: is double opt-in acceptable in the flows you have in mind? Without it the "unlock" feature should not ship (S3).
3. **Consent**: is there, or should there be, a consent element in the editor that the cookie logic can rely on (S6)?
4. **Where the first automation runs**: inside the Gateway process (recommended) or a separate container from the start?
5. **Response change in Phase 1**: removing `response: <vendor body>` from the submit reply changes an existing public API; acceptable for 0.1.x or does it need a compatibility flag?
6. **Scope of the mobile offline container**: confirm it moves to its own plan.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Restricted content leaks through caching | Phase 3 cache-header rule + a test per public route that serves rules |
| Fake e-mail unlocks content | Phase 2 verification before any entitlement |
| Vendor reply leaks personal data | Phase 1 response mapping, reply body dropped |
| Automations loop or flood a vendor | run budget, per-automation rate limit, kill switch, dead-letter |
| Automation config exposed by page content | definitions live in `automations`, never in page trees (A3) |
| Scope creep into analytics / mail delivery | keep the two limits of the source document, reviewed at each phase |
