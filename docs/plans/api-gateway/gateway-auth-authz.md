# Gateway auth/authz for published sites

## Context

The user asked how published sites (deployed on a remote host, separate from
the API Gateway) authenticate to the Gateway. Investigation showed they
**don't** — several Gateway routes are reachable by anyone, unauthenticated,
and the worst one lets a caller trigger writes to whatever third-party
service (Brevo, a CRM, ...) an admin has configured, with a payload the
caller fully controls:

- `POST /api/v1/gateway/submit` (`apps/gateway/src/submit-handler.ts`) is
  public by design (comment at line 68), rate-limited only per-IP (10/15min).
  The client supplies `endpointName` + an optional `routePath` + a free-form
  `attributes` body. `submit-handler.ts:116-118` lets the client pick **any
  non-GET route configured on that endpoint** — not necessarily the one the
  form it visited actually uses — and forwards `attributes` upstream
  unvalidated (no check against `gateway_routes.requestBodySchema`).
  `gateway_endpoints`/`gateway_routes` have no per-site scoping
  (`packages/core/src/db/gateway-schema.ts`), so one endpoint is reachable
  from every website on the installation.
- `POST /api/v1/gateway/resolve` (`apps/gateway/src/resolve-handler.ts:12`)
  is the opposite problem: it requires an **admin session**
  (`requirePermission(GATEWAY_MANAGE)`), which a real visitor's SSR request
  from a remotely-deployed site can never present. It's effectively dead for
  production sites today (the renderer's `resolveGatewayBinding()`,
  `packages/sdk/renderer/src/resolve.ts:118-140`, sends no credentials, and
  `walk.ts:230-233` silently swallows the resulting 401 into empty content).
- A dead field, `gateway_endpoints.requiredPermission`
  (`gateway-schema.ts:28`), suggests per-endpoint access control was
  intended but never wired up (zero reads of it anywhere in `apps/gateway`).

Decisions already made with the user:
1. Close `/submit` (and fix `/resolve`) with a **mandatory server-side
   binding**: the client stops choosing `endpointName`/`routePath` freely and
   instead passes an opaque `bindingId` that the server resolves internally
   to a fixed endpoint+route+fieldPath+filters, created when a page is saved.
2. Add an **optional, per-site static API key** as a second layer (site
   scoping, per-site rate limiting/kill switch), *and* make it a real secret
   rather than a visible-to-everyone one: add a small server-side proxy route
   inside the generated Next.js/Nuxt sites for the one call that genuinely
   happens from the visitor's browser (form submit); the read path
   (`/resolve`) already runs inside the site's own server process during SSR
   (`walk.ts` executes server-side in both templates' page generators), so it
   can carry the key directly with no new proxy needed.
3. Scope: fix `/submit` + fix `/resolve`'s broken auth in the same pass.
   (Mail-relay `notify` abuse on `/public/forms/:classId/submit` is a
   separate, later task - not in scope here.)

## Approach

### 1. New `gateway_bindings` table

`packages/core/src/db/gateway-schema.ts`: add a table alongside
`gatewayEndpoints`/`gatewayRoutes`:

```
gatewayBindings: id (uuid pk), endpointId (fk), routeId (fk),
  websiteId (fk -> websites.id), kind ('resolve'|'submit'),
  fieldPath (text, nullable - resolve only),
  paramKeys (text[] - allowed placeholder names, resolve only),
  filters (jsonb, nullable - resolve only, fixed at creation),
  configHash (text, unique per websiteId - for find-or-create dedup),
  createdAt/updatedAt
```

Enforce at creation: `kind='resolve'` requires `route.method === 'GET'`;
`kind='submit'` requires `route.method !== 'GET'`. This is also what fixes
the "resolve can accidentally invoke a POST route" edge case in the current
`resolve-handler.ts:44-46`.

Add DB functions in `packages/core/src/db/gateway-records.ts` following the
existing `getGatewayEndpointByName`/`listGatewayRoutes` patterns:
`findOrCreateGatewayBinding(...)`, `getGatewayBindingById(id)`. New drizzle
migration after `0045_website_template_locale.sql`.

### 2. Resolve bindings at page-save time (core-api)

In `apps/core-api/src/server.ts`, the page create/update handlers
(`POST /whoobe-one/pages` ~1671, `PATCH /whoobe-one/pages/:id` ~1706)
currently persist `content` verbatim (`packages/core/src/db/
whoobe-pages-records.ts`, `content: jsonb` untyped). Add a step before
persisting that walks the element tree and, for every node carrying
`formConfig.gatewayEndpointName` or `node.gatewayBinding`, resolves/creates
the matching `gateway_bindings` row (via `findOrCreateGatewayBinding`) and
sets `formConfig.gatewayBindingId` / `gatewayBinding.bindingId` on that node.
Keep `gatewayEndpointName`/`gatewayRoutePath`/`filters` in the **stored**
content too (the editor UI - `FormConfigControl.vue`, `GatewayBindingPicker.
vue`, `GatewayPanel.vue` - still needs them to show the current selection
and to preview against the always-admin-authenticated resolve path, see #5).

Add this as a small new module, e.g. `packages/core/src/gateway/
bind-page-content.ts`, since it needs to run from core-api and is pure
tree-walking + DB calls (no Express dependency) - mirrors the shape of
`packages/sdk/renderer/src/walk.ts` but only touches `formConfig`/
`gatewayBinding` fields, ignoring everything else.

Also close the "no Zod validation" gap: add a `gatewayBindingSchema` to
`packages/sdk/schema/src/validators.ts` (there's a `formConfigSchema` at
lines 39-49 to model it on) and reference it from `whoobeElementSchema`
instead of relying on `.passthrough()` (line 202).

### 3. Public serialization strips raw identifiers

The `/public/pages/*`/`/public/page/*` handlers
(`apps/core-api/src/server.ts:2436`, `:2624`) currently return the DB row's
`content` unmodified (confirmed: no `toPublicPage`/sanitizer exists anywhere
in the repo). Add one, applied before `res.json(body)` at `server.ts:2610-
2614`, that walks the tree once more and strips `gatewayEndpointName`/
`gatewayRoutePath`/`filters`/endpoint-identifying fields from what's sent to
the public, keeping only `gatewayBindingId`, `fieldPath` (used locally by
`walk.ts:224` against an already-fetched record, not resent to the gateway),
and the *param key names* (values get filled in per-request from the
visitor's own URL, same as today's `substituteGatewayParams`).

### 4. Gateway route changes

- `apps/gateway/src/submit-handler.ts`: request body becomes
  `{ bindingId, attributes }`. Look up the binding, require
  `kind === 'submit'`, load endpoint+route by the binding's stored ids (not
  by client-supplied name/path), keep the existing Brevo-contact-nesting
  logic (`nestBrevoContactAttributes`, unchanged - keyed off `endpoint.
  baseUrl`/`route.path`, both now server-resolved) and `proxyFetch` call.
  Add the site-key check (#6) and switch/extend the rate limiter to key on
  site id (falling back to IP when no key is presented) so IP-rotation
  doesn't bypass it.
- `apps/gateway/src/resolve-handler.ts`: split in two -
  - Keep the **existing** admin-authenticated free-form behavior
    (`requirePermission(GATEWAY_MANAGE)`, raw `endpointName`/`routePath`/
    `fieldPath`/`params`/`filters`) but move/rename it under
    `apps/gateway/src/admin-routes.ts` as `POST /api/v1/gateway/
    preview-resolve`, so the editor's live preview
    (`GatewayBindingPicker.vue:292-324`, `GatewayPanel.vue`) keeps working
    unchanged for authenticated admins editing an unsaved binding - just
    repoint those two callers at the new path.
  - The route mounted at `/api/v1/gateway/resolve` in `router.ts:114`
    becomes the **new public, bound, keyed** endpoint: body
    `{ bindingId, params }`, no admin session required. It loads the
    binding (`kind === 'resolve'`), pulls `fieldPath`/`filters` from the
    binding row (never from the client), intersects client-sent `params`
    keys against `binding.paramKeys` (dropping anything else), calls
    `proxyFetch` with the route's real configured method (now always
    correct, since the binding pinned it), and applies the site-key check
    (#6). Add the same fixed-window rate limiter `submit-handler.ts` already
    has (today `resolve-handler.ts` has none at all).

### 5. Editor preview stays on the admin-authenticated path

No behavior change needed for the *authoring* experience: `GatewayBindingPicker.vue`/`GatewayPanel.vue` call `preview-resolve` (admin
session, free-form) so live preview works for bindings that aren't saved
yet. `form-actions.ts` (editor's own live-preview form submit) should switch
to reading `config.gatewayBindingId` when present (post-save) and otherwise
show a clear "save the page to test this form" message rather than silently
posting a stale/nonexistent binding - a minor, acceptable UX change flagged
to the user, not a blocker.

### 6. Per-site API key (`websites` table)

`packages/core/src/db/websites-schema.ts`: add
`gatewayApiKeyHash: text('gateway_api_key_hash')` (nullable) and
`gatewayApiKeyPrefix: text('gateway_api_key_prefix')` (for display, e.g.
`whb_site_ab12…`, without ever decrypting). New crypto helper
`packages/core/src/db/site-key-crypto.ts` alongside `gateway-auth-crypto.ts`:
`generateSiteApiKey()` (random token) and `hashSiteApiKey(plaintext)` using
`createHash('sha256')` + a pepper from a new env var `SITE_API_KEY_PEPPER`
(added next to `GATEWAY_AUTH_ENCRYPTION_KEY` in `.env.example`/`.env.aura`) -
sha256, not argon2 (`packages/core/src/auth/password.ts`), because this gets
checked on every public gateway request, not just login.
`websites-records.ts`: add `setWebsiteGatewayApiKey(id)` (generates + stores
+ returns plaintext once) and `verifyWebsiteGatewayApiKey(id, plaintext)`
(hash + `timingSafeEqual` compare).

New admin-only core-api route (same `requireAuth`/permission pattern as
other website settings routes in `server.ts`):
`POST /api/websites/:id/gateway-api-key/regenerate`.

Gateway-side: new `apps/gateway/src/site-auth.ts` middleware,
`requireSiteKey`, reading `X-Whoobe-Site-Id` + `X-Whoobe-Site-Key` headers,
verifying via `verifyWebsiteGatewayApiKey`, and cross-checking the resolved
site id against the binding's own `websiteId` (defense in depth - a leaked
`bindingId` from site A can't be replayed under site B's key or vice versa).
Applied inside `submit-handler.ts` and the new public `resolve-handler.ts`
path. The key is **optional per the earlier decision** - if a website has no
key configured (`gatewayApiKeyHash` is null), the binding-based checks alone
still apply; if it does, the header must match.

### 7. Admin UI (`WebsitePublishModal.vue`)

Add a "Site API Key" block: a "Generate/Rotate" button calling the new
regenerate endpoint (pattern to reuse: `fetchCdnMirrorSettings` at line 202
for the fetch-on-open flow, `copyScript` at 271-286 for the copy-to-
clipboard UX), showing the plaintext once with a "won't be shown again"
warning, and threading `--site-api-key`/`--site-id` into the generated
`pnpm publish:site` command (site-generation step, lines 239-252) alongside
the existing `--website-id`.

### 8. Publish CLI env wiring (`packages/publish/src/cli.ts`)

- Next.js: add non-public `CMS_SITE_API_KEY` to `scaffoldEnv()`'s
  `.env.local` write (~1069-1071), deliberately **excluded** from
  `scaffoldDockerfile`'s `NEXT_PUBLIC_*` build-arg block (501-510, 585-593)
  so it never reaches the client bundle.
- Nuxt: introduce the framework's **first private** `runtimeConfig` key
  (today `defineNuxtConfig`'s `runtimeConfig` at 1345-1370 only has
  `public`): add a top-level `cmsSiteApiKey`, sourced from a non-
  `NUXT_PUBLIC_`-prefixed `CMS_SITE_API_KEY` written by `nuxtEnv()`
  (1774-1787), readable only server-side via `useRuntimeConfig(event)`
  (never through `.public`).

### 9. Server-side submit proxy in generated sites

Confirmed: `submitForm()` (`packages/sdk/renderer/src/api-client.ts:144-177`)
is invoked from `useForm` in both `packages/sdk/react/src/hooks.ts:126-152`
and the Vue equivalent - both are client components, so this call happens in
the visitor's browser today. `resolveGatewayBinding` (`walk.ts:164-183,
205-234`), by contrast, runs inside the page generators' `getPageData()`
call, which both frameworks' generated pages call as an `async` Server
Component / server route (confirmed server-only env var usage at
`cli.ts:794-982` for Next; equivalent for Nuxt) - so the resolve path can
just attach the site-key headers directly from server-only env vars with no
new proxy, by extending `resolveGatewayBinding()`'s signature to accept an
optional `siteAuth: { siteId, siteKey }` and threading it through
`RenderOptions`/`walkTree` from the two frameworks' page-generation code
(`packages/sdk/next`, `packages/sdk/vue` or wherever `getPageData()` builds
`RenderOptions`).

For submit, add a new generated route per framework, both doing the same
thing - read `bindingId`+`attributes` from the request, attach
`X-Whoobe-Site-Id`/`X-Whoobe-Site-Key` from server-only env, forward to the
real gateway, relay the response:
- Next.js: `app/api/whoobe-gateway-submit/route.ts` (new template, scaffolded
  by `cli.ts` alongside the existing `scaffoldApi()`).
- Nuxt: `server/api/whoobe-gateway-submit.post.ts` (new Nitro route).

`ApiClient.submitForm()` (`api-client.ts:144-177`) gets a constructor option
(e.g. `gatewaySubmitProxyPath`) - when set, POST to that same-origin
relative path instead of `${gatewayUrl}/api/v1/gateway/submit` directly.
`createWhoobeApi()` in `packages/sdk/react/src/components.tsx` and the Vue
equivalent pass the fixed, non-secret path constant
(`/api/whoobe-gateway-submit`) when constructing the client for a published
site. The **editor's own** preview code (`form-actions.ts`) is untouched -
it isn't built from this SDK path and keeps calling the gateway directly
under the admin's own session context.

## Verification

- Unit-level: exercise `submit-handler.ts`/`resolve-handler.ts` (no existing
  tests today) with a valid `bindingId` for site A + site A's key (succeeds),
  a valid `bindingId` for site A + no key when the site has one configured
  (rejected), site A's `bindingId` + site B's key (rejected), and a
  `kind='resolve'` binding used against `/submit` or vice versa (rejected).
- Confirm the dead `gateway_endpoints.requiredPermission` field's replacement
  (the new binding+site-key model) actually gates a Brevo-configured
  endpoint end-to-end: create a website with a gateway-submit Form, publish
  it via `WebsitePublishModal`, deploy locally with Docker per the existing
  self-contained flow, and confirm from a plain `curl` (no cookies) that (a)
  submitting through the real published form succeeds, (b) POSTing a
  fabricated `bindingId`/guessed `endpointName` directly to `/api/v1/gateway/
  submit` fails.
- Confirm `resolve-handler.ts`'s fix actually un-breaks gateway-bound
  container content on a real published site (was silently swallowed into
  empty content before - `walk.ts:230-233`) by rendering a page with a
  gateway-bound repeater/field end-to-end.
- Run the existing `packages/sdk/renderer/src/walk.test.ts` suite (mocked
  API) plus add binding-focused cases there for the new `bindingId` fields.
- Update `CHANGES.md` per `AGENTS.md`'s standing instruction, describing the
  binding/site-key model and which files changed, once implementation is
  done.
