# CMS Forms

whoobe-one-editor can create forms using the elements available but the form has no real action to submit.
Forms can have different scopes:
- registration
- contact form
- general request

The ideal should be a system to create a form processor in order to execute defined processes.

## Plan

### Context

The page-builder editor (`apps/whoobe-one-spike`) can already place a `Form` container with input/textarea/select/submit elements on a page, but nothing happens when a visitor submits one — there's no client-side handler and no backend endpoint.

Research turned up two hard infrastructure gaps: no email-sending code exists anywhere in the backend (zero matches for nodemailer/smtp/mailer - only an unused local `mailhog` container), and no user-registration endpoint exists (only `/auth/login`, `/auth/mfa/*`, `/auth/logout`, `/auth/me`). Building all three scopes (registration, contact form, general request) at once means designing email infra and a new user-creation flow blind, before anything is actually running end to end.

Decided: submissions are stored as Data Objects of an admin-chosen Data Class - reusing the existing `data_objects`/`data_classes` system (which already gives submissions a list view, filters, and CSV export for free) rather than a new dedicated table - and this plan covers only **Phase 1**: a generic "submission → Data Object" processor, the client-side submit handling, and the public endpoint. Email notifications, a registration processor, and a webhook processor are sketched at the end for later phases, once Phase 1 is live and the email/auth gaps can be tackled deliberately.

This mirrors the existing extensibility pattern already in this editor for `element.alpine` (arbitrary directive map) and `element.gsap` (animation config): a plain-object field on the Element model, a dedicated sidebar panel control, and a mount function applied only in the `*Preview.vue` render tree (never the editing canvas) - see `docs/plans/cms/whoobe-one-spike-missing-features.md` for how that pattern was ported.

### 1. Element model

`apps/whoobe-one-spike/src/scripts/ElementsClass.js`, `Form()` (line 563) gains one new field:

```js
this.formConfig = {
  enabled: false,
  targetClassId: '',   // Data Class id - createDataObject's classId
  successMessage: '',
  errorMessage: '',
  successRedirectUrl: '',   // optional; empty = show successMessage inline instead
  errorRedirectUrl: '',     // optional; empty = show errorMessage inline instead
}
```

Field mapping is implicit, not a second config surface: each input's existing `data.attributes.name` (already required by every `inputElement()`) is used directly as the target Data Class's field name. The admin's job is just "name your inputs the same as your Data Class fields."

The existing-but-dead `Form()` fields `success`/`error`/`action` are dropped in favor of `formConfig.successMessage`/`errorMessage` (one clear owner instead of two overlapping ones); `data.attributes.action`/`method` stay untouched since a real HTML form-post fallback isn't in scope.

`InputSubmit()` (line 656) bug fix: it currently sets `this.type = 'button'`, and nothing renders `element.type` as a DOM attribute anyway - so a Submit button doesn't actually submit. Fix by adding `type: 'submit'` into `InputSubmit()`'s own `data.attributes` (the field that already flows through to the DOM via `customAttrs()`/`extraAttrs`), not by touching `element.type`.

### 2. Editor UI

New accordion section in the existing "Advanced" sidebar tab (`AdvancedPanel.vue`), not a new tab or a `FloatingToolbar.vue` popover - a form's submit config is exactly as structural as its `alpine`/`gsap` config, and `FloatingToolbar.vue` is built for single-element quick actions, the wrong altitude for a container-level setting.

- `AdvancedPanel.vue`'s `sections` (currently a plain const array, line 42) becomes a `computed` that includes a `{ key: 'form', label: 'Form', component: FormConfigControl }` entry only when `editor.current?.tag === 'form'` - every other section stays unconditional.
- New `apps/whoobe-one-spike/src/components/advanced/FormConfigControl.vue`: enable toggle, a Data Class `<select>` populated via `listDataClasses()` (`data-objects-api.ts:91`, same call `DataObjectPicker.vue:492` already makes), success-message textarea, redirect-URL input, error-message textarea - all bound directly to `editor.current.formConfig` (same direct-mutate convention as `AlpineControl.vue`).

### 3. Client-side submit handling

New `apps/whoobe-one-spike/src/scripts/form-actions.ts`, shaped like `gsap-actions.ts`'s `mountAnimation(element, el)`: exports `mountFormSubmit(doc: WhoobeElement, formEl: HTMLFormElement, onResult: (result: {ok: boolean; message: string} | null) => void): () => void`.

Called from `BlockContainerPreview.vue`'s existing `onMounted()` (line 304-305, alongside the existing `mountAnimation()` call), gated on `doc.tag === 'form' && doc.formConfig?.enabled`, only in the preview tree (editing canvas stays inert, same as Alpine/GSAP).

Behavior: attaches a `submit` listener that calls `preventDefault()`, reads `new FormData(formEl)` (native serialization by each input's `name` - no manual DOM walk needed), POSTs JSON (`{ attributes: Object.fromEntries(formData) }`, honeypot value included) to the new endpoint, and on response either calls `window.location.href = redirectUrl` (when set) or invokes `onResult()` so `BlockContainerPreview.vue` can render `formConfig.successMessage`/`errorMessage` inline. A honeypot input (`name="_hp"`, absolutely positioned off-screen, `tabindex="-1"`, `autocomplete="off"`) is injected into `formEl` by `mountFormSubmit()` itself at mount time - no new field type, not visible or removable via the visual editor.

### 4. Backend

New route in `apps/core-api/src/server.ts`, right after the existing `/public/data-objects/query` handler (~line 1907): `POST /public/forms/:classId/submit`. No `requireAuth`/`requirePermission`, matching the existing public-route precedent.

1. **Rate limit**: a new small in-memory fixed-window counter (own `Map<string, {count: number; windowStart: number}>`, own constants e.g. `FORM_SUBMIT_MAX = 10` per `FORM_SUBMIT_WINDOW_MS = 15 * 60 * 1000`, keyed by `req.ip`) - same "process-memory, not distributed" caveat already called out above the existing `loginAttempts` map (line 148), but a fresh map rather than reusing `loginAttempts`/`recordFailedAttempt`, since that one models failure-triggered lockout, not a request-volume window. 429 with no body detail on exceeding.
2. **Honeypot**: `if (req.body?.attributes?._hp) return res.status(204).end();` - looks like success, doesn't reveal the trap. Strip `_hp` before validation either way.
3. **Load the Data Class**: `getDataClass(classId)` (already imported in `server.ts`, same one `/data-objects` routes use) - 404 if missing.
4. **Validate**: `compileDynamicSchema({ id: dataClass.id, name: dataClass.name, fields: dataClass.fields })` (`packages/core/src/schema/dynamic.ts:226`, re-exported via `packages/core/src/index.ts:6`) against `req.body.attributes` - 400 with Zod's issues on failure.
5. **Create**: `createDataObject({ classId, key: \`sub-${randomUUID()}\`, attributes: parsed })` (`data-objects-records.ts:332`, same function `/data-objects` already calls). `locale` defaults to `'en'` when omitted; `published` isn't set, so it lands using the schema's own default (unpublished) - a deliberate, useful side effect: submissions land as drafts an admin has to actively review/publish, not auto-visible in any public list.
6. **Respond**: `201 { success: true }` on success; generic `500 { error: 'Failed to submit form' }` on unexpected failure (no internals about which fields exist beyond what Zod's own validation message already reveals).

### 5. Data flow end to end

Admin creates a Data Class "Contact Submission" with fields `name`/`email`/`message` (existing Data Class UI, unchanged) → in the page editor, builds a `Form` whose inputs' `name` attributes match those exact field names, opens Advanced → Form, picks that class, sets success/error text → visitor loads the public page (`PublicPage.vue` → `BlockContainerPreview.vue`) → `mountFormSubmit()` wires the listener and injects the honeypot → visitor submits → `FormData` collected by `name` → `POST /public/forms/:classId/submit` → server rate-limits, honeypot-checks, validates via `compileDynamicSchema`, calls `createDataObject` → the submission appears in the existing admin Object View like any other Data Object, in draft/unpublished state pending review.

### 6. File summary

New: `apps/whoobe-one-spike/src/scripts/form-actions.ts`, `apps/whoobe-one-spike/src/components/advanced/FormConfigControl.vue`.

Modified: `ElementsClass.js` (`formConfig` field, `InputSubmit()` fix), `AdvancedPanel.vue` (conditional Form section), `BlockContainerPreview.vue` (mount call + inline result rendering), `apps/core-api/src/server.ts` (new route + rate-limit helper).

### 7. Verification

- `pnpm turbo typecheck` / `pnpm turbo build` (or per-package `pnpm --filter whoobe-one-spike`/`--filter core-api`) - clean.
- `curl -X POST localhost:3003/public/forms/<classId>/submit -H 'Content-Type: application/json' -d '{"attributes":{"name":"a","email":"b@x.com","message":"hi"}}'` → expect `201`; repeat with a bogus `classId` → expect `404`; repeat with `_hp` set → expect `204` and no new row.
- Direct DB check (`select id, class_id, published, attributes from data_objects where class_id = '<id>' order by created_at desc limit 1;`) confirms the row landed unpublished with the right attributes.
- If a browser session is available: build a real form in the editor, open the public page, submit it, confirm the inline success message and the new draft object in Object View.

## Resolved (2026-08-13)

Phase 1 implemented per the plan above: `Form()`'s `formConfig` field (`ElementsClass.js`/`.d.ts`, replacing the dead `success`/`error`/`action` fields), the `InputSubmit()`/`InputReset()`/`Button()` `type` attribute fix (a plain `Button()` no longer silently submits a form it's dropped into), the "Form" section in `AdvancedPanel.vue`'s Advanced tab (`FormConfigControl.vue`, only shown for `tag === 'form'`), client-side submit handling (`form-actions.ts`'s `mountFormSubmit()`, wired into `BlockContainerPreview.vue`'s `onMounted()` + an inline success/error message), and the public `POST /public/forms/:classId/submit` endpoint (`apps/core-api/src/server.ts`) with honeypot rejection, a per-IP fixed-window rate limit, and `compileDynamicSchema`-based validation against the target Data Class.

`npm run build`/typecheck pass clean in both `whoobe-one-spike` and `core-api`. End-to-end verified directly against the endpoint (temp Data Class created via `createDataClass`, cleaned up after): a valid submission returns `201` and lands as an unpublished Data Object with the right attributes; a missing mandatory field returns `400` with the Zod validation message; a filled honeypot returns `204` and creates no row; an unknown `classId` returns `404`.

Two follow-up fixes landed the same day: (1) `successRedirectUrl`/`errorRedirectUrl` (renamed from the single `redirectUrl`) so a failed submission can redirect too, not just a successful one; (2) the editing canvas (`BlockElement.vue`'s `onClick`, `BlockContainer.vue`'s root `@submit.prevent`) now suppresses every native click/submit action - the same `data.attributes.type="submit"` that makes a real Submit button work in preview would otherwise have actually submitted/navigated the *editor* away when clicked while customizing it. Buttons only ever act in preview/published rendering, never while editing, matching every other interactive feature (Alpine, GSAP) in this editor.

Not verified in a browser this pass (no browser tooling in this session) - building an actual form in the editor, configuring its Form section, and submitting it from a real rendered page hasn't been exercised end to end. Worth an interactive pass before considering Phase 1 fully done.

## Phase 2: Email notification

### Context

Phase 1 only creates a Data Object; nothing tells anyone a submission arrived. This phase adds an optional notification email per Form, sent on top of (not instead of) the Data Object write.

Three sub-problems, each resolved by reusing something that already exists rather than inventing new infrastructure:

1. **Where does the SMTP config live?** No global settings mechanism exists yet (`SettingsView.vue`'s "General" tab is UI-only, nothing persists), and `websites.settings` (the one real precedent for flexible jsonb config) is per-website - but nothing in this app currently threads a page's `websiteId` down to the client at render time, so resolving "which website is this form on" would be new plumbing on its own. Simplest correct scope: **one global mail config**, a new singleton-row table, configured from a new "Mail" tab in Settings. Per-website mail config is a natural follow-up once `websiteId` is available client-side for other reasons.
2. **What is "a template that's like a page"?** Literally a page: `whoobe_pages` already stores an Element/block-tree per page (`content`, jsonb) with a full authoring UI (the same page-builder editor) and existing CRUD (`getWhoobePage`/`listWhoobePages` server-side, `getPage`/`listPages` client-side). A mail template is just a `whoobe_pages` row the Form's config points to by id - no new table, no new editor, no new list view. It doesn't need a routable path to be usable as a template (an admin simply never gives it one).
3. **How does that JSON tree become an email's HTML?** Nothing renders it to HTML outside a live Vue+Alpine browser tree today (`BlockContainerPreview.vue`/`BlockElementPreview.vue`), which can't run inside a server-side mail send. This needs a real new piece: a plain Node/TS function that walks the same Element tree and emits a static HTML string. Deliberately scoped down from the full editor feature set - an email has no JS runtime, so Alpine directives, GSAP animations, sliders, iframes, and nested Dynamic Query repeaters are all skipped (rendered as their static content only, or omitted). Text/heading/paragraph/span/link/image/div/section-like containers are supported, with data binding resolved as a **relative** binding against the one submission object (no `objectId` - the same mechanism already used for a Dynamic Query repeater's children, just resolved directly against a plain object instead of a live Pinia store), reusing `field-transforms.ts`'s `applyTransform()`/`escapeHtml()` as-is since those are already framework-agnostic pure functions.

### 1. Mail settings

New `packages/core/src/db/mail-settings-schema.ts`: a `mail_settings` table, one row (`id`, `host`, `port`, `secure` boolean, `user`, `password`, `fromAddress`, `fromName`, `updatedAt`). Records module: `getMailSettings()` (returns the single row or `null`), `upsertMailSettings(input)` (updates the row if it exists, inserts it otherwise - true upsert, not requiring the caller to know if setup has happened before).

### 2. Mailer

New `packages/core/src/mail/mailer.ts`: `sendMail({ to, subject, html }): Promise<void>`, using `nodemailer` (new dependency) with a transport built from `getMailSettings()` on each call (settings can change at runtime; no long-lived cached transport). Throws if no settings are configured yet - the caller (the form-submit route) catches this and logs a warning rather than failing the submission.

### 3. Server-side renderer

New `packages/core/src/mail/render-mail-template.ts`: `renderMailTemplate(pageContent: unknown, submission: Record<string, unknown>): string`. Recursively walks the Element tree (same shape `whoobe_pages.content`/`apps/whoobe-one-spike/src/scripts/ElementsClass.js` already define, duck-typed here since the Element class itself is a frontend-only module):
- Container nodes (`type === 'container'`) render their `semantic` tag (or `div`), with `css.css`/`css.container` joined into a `class` attribute and `style`/`font` into a `style` attribute (same computation `BlockContainerPreview.vue`'s `classe`/`stile` already do), recursing into `blocks`.
- Leaf nodes render their own tag (`heading`→`h1`-`h6`, `paragraph`→`p`, etc.) the same way, with content resolved via a **relative-only** port of `resolveFieldValue`/`getFieldValueClientSide` (`data-resolver.ts`): if the node has a `dataBinding` with a `field` and no `objectId`, look up `submission[field]` directly (no HTTP call - the submission is already the plain object this function was called with) and run it through `applyTransform()`; otherwise fall back to the node's own static `content`.
- Anything with `tag === 'slider'`, `tag === 'youtube'/'vimeo'`, `tag === 'form'`, or a `dataBinding` with no `field` (collection/whole-object binding) is skipped entirely (renders nothing) - none of those make sense in a static email and supporting them is out of scope for this phase.
- Images: only plain string URLs are resolved (used as-is in `src`); asset-reference values (`{ assetId }`) are skipped for now (documented gap, not silently broken - just omits the `<img>`) since resolving those needs the DAM's async URL-signing flow this synchronous renderer doesn't have.

### 4. Backend wiring

`formConfig` gains a `notify` sub-object:

```js
this.formConfig.notify = {
  enabled: false,
  templatePageId: '',   // a whoobe_pages id
  recipientEmail: '',
  subject: '',
}
```

New admin routes in `apps/core-api/src/server.ts`, both `requirePermission(PERMISSIONS.SETTINGS_WRITE)` (or the nearest existing permission if that one doesn't exist yet - check `PERMISSIONS` in `packages/core/src/auth/permissions.ts` first): `GET /mail-settings` (password omitted/masked in the response), `PUT /mail-settings`.

In `POST /public/forms/:classId/submit`, after the existing `createDataObject()` call: if `req.body.formConfig?.notify?.enabled` (the client includes the Form's own `notify` config in the submit payload, the same way it already implicitly trusts `targetClassId` via the URL - no separate lookup needed since the editor already has this config in hand at submit time) and a `templatePageId`/`recipientEmail` are set, `getWhoobePage(templatePageId)` → `renderMailTemplate(page.content, parsed)` → `sendMail({ to: recipientEmail, subject, html })`. Wrapped in its own `try/catch` **separate** from the main handler's - a failed/misconfigured mailer must never turn a successful Data Object write into a `500` for the visitor; log and continue to the normal `201` response either way.

### 5. Editor UI

`FormConfigControl.vue` gains an "Email notification" section (same enable-toggle-then-reveal-fields pattern as the existing success/error blocks): enable checkbox, a template page `<select>` populated via `listPages()` (`pages-api.ts:75`, already used elsewhere in this app), recipient email input, subject input.

### 6. Settings UI

`apps/admin-dashboard`: new `components/settings/MailSettingsCard.vue` (host/port/secure checkbox/user/password/from-address/from-name fields + Save button, same card shape as `WebsiteSettingsCard.vue`), wired into `SettingsView.vue` as a new "Mail" sub-tab (`subTabs`/`sectionTitles`/`SettingsSubSection` type in `stores/tabsStore.ts`), calling the new `GET`/`PUT /mail-settings` routes via a small new API client (or added to an existing generic one).

### 7. File summary

New: `packages/core/src/db/mail-settings-schema.ts` + records module, `packages/core/src/mail/mailer.ts`, `packages/core/src/mail/render-mail-template.ts`, `apps/admin-dashboard/src/components/settings/MailSettingsCard.vue`.

Modified: `ElementsClass.js`/`.d.ts` (`formConfig.notify`), `FormConfigControl.vue` (notify UI), `apps/core-api/src/server.ts` (mail-settings routes + notify wiring in the submit route), `packages/core/package.json` (`nodemailer` dependency), `apps/admin-dashboard/src/views/SettingsView.vue` + `stores/tabsStore.ts` (Mail sub-tab).

### 8. Verification

- Typecheck/build clean across `packages/core`, `core-api`, `whoobe-one-spike`, `admin-dashboard`.
- Configure mail settings pointing at the local `mailhog` container (`host: localhost` or the docker-compose service name, `port: 1025`, no auth).
- Build a real template page (a heading + a paragraph data-bound to the submission's `message` field, relative binding, no `objectId`), wire a test Form's `notify` config to it, submit via `curl` the same way Phase 1 was verified, then check mailhog's web UI (`:8025`) for the message and confirm the bound field's value actually appears in the rendered body.
- Confirm a submission still succeeds (`201`, Data Object created) even when mail settings are entirely unconfigured or the SMTP send fails - the notify failure must not surface as a `500` to the visitor.

## Resolved (2026-08-14)

Phase 2 implemented per the plan above: `mail_settings` (schema/records/migration 0018), `packages/core/src/mail/mailer.ts` (`sendMail()` via `nodemailer`, a fresh transport per call), `packages/core/src/mail/render-mail-template.ts` (walks a `whoobe_pages.content` tree to static HTML, resolving relative-only data bindings against the submission object via a server-side port of `field-transforms.ts`'s `applyTransform()`/`escapeHtml()` - ported rather than imported, same cross-boundary-duplication precedent `data-resolver.ts` already sets, since `packages/core` can't depend on the frontend app that itself depends on `packages/core`), `GET`/`PUT /mail-settings` (permission-gated on `PERMISSIONS.SETTINGS_MANAGE`, password masked in every response, replaced with a `hasPassword` boolean), the `formConfig.notify` wiring in `POST /public/forms/:classId/submit` (its own try/catch, never turns a mail failure into a `500`), `FormConfigControl.vue`'s "Email notification" section, and `admin-dashboard`'s new "Mail" settings tab (`MailSettingsCard.vue`).

One deviation from the original sketch, found while wiring the renderer: text/link values resolved from the submission are HTML-escaped before being injected into the mail body, unlike the client-side preview's own `displayContent` (which trusts already-admin-authored Data Object values and skips escaping for non-link text). A mail template's bound field value is public, visitor-submitted input, so leaving it unescaped would let a form submission inject arbitrary HTML into the notification email.

`npm run build`/typecheck pass clean across all 7 workspace packages (`pnpm turbo typecheck`). End-to-end verified directly against the running dev API (temp Data Class + temp `whoobe_pages` template row created via `createDataClass`/`createWhoobePage`, cleaned up after): mail settings pointed at the local `mailhog` container, a real submission with `formConfig.notify` enabled returned `201` and the notification email arrived in mailhog with the bound `message` field's value correctly substituted into the template's paragraph and the nested `tag: 'form'` subtree correctly omitted; a second submission with mail settings pointed at an unreachable port still returned `201` (Data Object created), confirming a mailer failure never surfaces as an error to the visitor.

Not verified in a browser this pass (no browser tooling in this session) - building a real mail template page and a real Form's notify config through the actual editor UI, then submitting from a rendered page, hasn't been exercised end to end. Worth an interactive pass before considering Phase 2 fully done.

## Phase 3+ (sketch only, not designed in detail)

Registration and webhook processors both extend `formConfig` with a `processorType` discriminant, same as Phase 2's `notify` sub-object pattern:
- **Registration**: needs a new exported user-creation function in `packages/core` (password hashing already available via `argon2`, already a dependency) plus a decision on email verification (can reuse Phase 2's mailer once it exists).
- **Webhook**: POST the submission JSON to an admin-configured URL - needs outbound-request timeout/allowlisting so a misconfigured or malicious URL can't be used to probe internal infrastructure.
