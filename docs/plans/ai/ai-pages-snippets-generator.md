# AI Pages, Snippets generator

Pages are created using the Whoobe One composer (whoobe-one-spike).

Features:

- Settings
    - AI agent (provider + model)
    - AI endpoint
    - AI API KEY

- Whoobe One Spike
    - AI Generate Snippet
    - AI Generate Page

The generated result is saved in a custom Postgres table `whoobe_ai_generated`.

---

## Plan (implemented 2026-08-14, branch: dev/08-14/various-features)

### Context

No AI code existed anywhere in the monorepo before this plan (no LLM SDKs,
no API-key storage, no `/ai/*` routes). Established patterns reused instead
of inventing new ones:

- **Settings storage**: the single-global-row `mail_settings` table +
  GET/PUT endpoints that never return the secret (only `hasApiKey`) -
  `apps/core-api/src/server.ts:2040-2081`, `packages/core/src/db/mail-settings-*`.
- **Drizzle schema registration**: new tables are `pgTable()` files listed in
  `packages/core/drizzle.config.ts`, migrated via `pnpm --filter @whoobe-cms/core db:generate` (auto-run at core-api boot).
- **Auth**: session-cookie (`wcms_session`) + `requirePermission`; whoobe-one-spike
  has no login flow of its own and relies on the admin-dashboard session for
  the same hostname - the AI endpoints work the same way.
- **Editor insertion**: `cloneWithFreshIds()` (editor-actions.ts), `clean()`
  and `applyImagePlaceholder()` (helpers.ts), and `onNew()`'s document-swap
  pattern (BlockEditor.vue) are the existing hooks an AI-generated Element
  tree slots into.

Decisions (confirmed with the user): provider-specific SDKs (`openai`,
`@anthropic-ai/sdk`, `@google/generative-ai`; "custom" reuses the OpenAI SDK
pointed at a user-supplied OpenAI-compatible base URL), and non-streaming
request/response generation (nothing in the repo uses SSE today).
`zen` (OpenCode Zen, https://opencode.ai/zen/v1) was added later as a named
option - it is the "custom" OpenAI-compatible path with the Zen gateway URL
as default endpoint and `deepseek-v4-flash-free` as suggested model.
`openrouter` (OpenRouter, https://openrouter.ai/api/v1) followed the same
pattern with `deepseek/deepseek-chat` as suggested model.

### Phase 0 - DB (packages/core)

- `src/db/ai-settings-schema.ts` - `ai_settings` single global row:
  `provider` (openai | anthropic | google | custom), `model` (the "AI agent"),
  `endpoint` (base URL, required for `custom`), `apiKey`, `updatedAt`.
- `src/db/ai-settings-records.ts` - `getAiSettings()` / `upsertAiSettings()`
  (true upsert, mirroring mail-settings-records.ts).
- `src/db/ai-generated-schema.ts` - `whoobe_ai_generated` audit/log table:
  `id`, `kind` (snippet | page), `prompt`, `provider`, `model`, `payload`
  (jsonb Element tree), `rawResponse` (jsonb raw model output), `status`
  (success | error), `error`, `createdBy` (nullable user id), `createdAt`.
- `src/db/ai-generated-records.ts` - `listAiGenerated(limit)` / `createAiGenerated()`.
- Registered both schemas in `drizzle.config.ts`; migrations `drizzle/0019_overrated_ken_ellis.sql` + `0020_stiff_the_spike.sql` (`raw_response` changed to `text` - jsonb rejected fence-wrapped raw replies and would 500 the request after a successful generation); both exported from `src/server.ts`.

### Phase 1 - LLM layer (packages/core)

- New deps: `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`.
- `src/ai/providers.ts` - `generateAiJson({ settings, systemPrompt, userPrompt })`
  dispatches per provider (non-streaming, 120s timeout, `max_tokens: 4096`),
  returns `{ json, rawText }` so the audit table can keep the raw model reply.
  Providers: `openai` / `anthropic` / `google` SDKs, `custom` (OpenAI SDK at a
  user-supplied base URL), `zen` (OpenCode Zen gateway -
  `https://opencode.ai/zen/v1` default endpoint, `deepseek-v4-flash-free`
  suggested model) and `openrouter` (OpenRouter gateway -
  `https://openrouter.ai/api/v1` default endpoint, `deepseek/deepseek-chat`
  suggested model). `parseJsonText()` strips markdown fences and extracts the
  JSON value. `AiGenerationError` carries an HTTP-ish status; 401/429/404/parse
  failures are mapped to actionable messages (used verbatim in the
  dashboard/spike UIs). 429s are retried 3 attempts total with
  `Retry-After`-aware backoff (SDK-internal retries disabled), except for
  OpenCode Zen's `FreeUsageLimitError` (the `*-free` models' account quota
  is spent, not throttled - detected via the SDK error body and answered
  with an actionable "switch to a paid model" message instead of retries).
- `src/ai/prompts.ts` - `buildSystemPrompt()` teaches the Element-tree JSON
  contract (id/type/tag/blocks/css/content/style/image/editable, document root
  conventions, "output ONLY JSON" rule); `buildUserPrompt(context)` tailors
  kind + selected-tag (snippet) or page title/category (page).
  `validateElementTree()` does shallow structural validation (root object,
  unique ids, known HTML tags, blocks array, ≤200 nodes) before anything is
  persisted or returned to the client. The contract requires `type:
  "container"/"element"` and a concrete `element` HTML tag on every node -
  the renderer dispatches on exactly those (see helpers.ts's
  `normalizeGeneratedTree()` comment for the bug this prevents: early
  generations used builder names for `type` and omitted `element`, so they
  rendered as an invisible canvas). The contract also mandates
  `https://picsum.photos/seed/<node-id>/1200/800` for img URLs (models
  hallucinate unsplash.com photo IDs that 404); `sanitizeGeneratedImages()`
  enforces that server-side after validation, and the spike's
  `normalizeGeneratedTree()` re-applies it defensively on import.
  Transient failures: 429 (rate limit) and 502/503/504 (gateway upstream
  unavailable - Zen free models flap) are retried up to 3 attempts total
  with Retry-After-aware backoff; `FreeUsageLimitError` is detected and
  never retried (account quota, not transient).

### Phase 2 - core-api routes (apps/core-api/src/server.ts)

- `GET /ai/settings` (`SETTINGS_MANAGE`) - returns `{ provider, model,
  endpoint, hasApiKey }`; the key is never sent back (mirrors mail-settings).
- `PUT /ai/settings` (`SETTINGS_MANAGE`) - upsert; a blank/omitted `apiKey`
  keeps the existing one.
- `POST /ai/generate` (`OBJECTS_WRITE`) - body `{ kind, prompt, context? }`
  (kind snippet|page, context: `selectedTag` / `pageTitle` / `pageCategory`).
  Reads the stored settings (400 if unconfigured), builds the prompts, calls
  the provider, structurally validates the tree (422 + error row on
  rejection), inserts a `whoobe_ai_generated` row for every outcome
  (success *and* failure, with `createdBy` from the session), returns
  `{ payload }`.
- `GET /ai/generated` (`OBJECTS_READ`) - recent generation history (50).

### Phase 3 - admin-dashboard settings UI

- `stores/tabsStore.ts` - `'ai'` added to `SettingsSubSection`.
- `layouts/DashboardLayout.vue` - sidebar submenu item + label (Sparkles icon).
- `views/SettingsView.vue` - sub-tab, section title/description, and
  `<AiSettingsCard>` render slot.
- `components/settings/AiSettingsCard.vue` (new) - modeled on
  MailSettingsCard.vue: provider select, model input, endpoint input,
  API-key password field ("leave blank to keep current" when `hasApiKey`).
- `utils/ai-settings-api.ts` (new) - `fetchAiSettings` / `saveAiSettings`
  against `/ai/settings`, `credentials: 'include'`.

### Phase 4 - whoobe-one-spike generation UI

- `src/ai-api.ts` (new) - `generateAi(kind, prompt, context)` → POST
  `/ai/generate`; `AiApiError` carries the HTTP status so the modal can
  distinguish a 401 ("log into the admin dashboard") from real failures.
- `src/components/AiGenerateModal.vue` (new) - shared prompt modal
  (prompt textarea, kind label, spinner, error banner), the standard
  fixed-inset modal pattern; emits `generated` with the payload. Shows the
  configured AI agent (provider + model, fetched via `fetchAiInfo()` from
  GET /ai/settings on mount) so the user knows which model will generate;
  shows a "not configured" hint when no API key is stored.
- **AI Generate Snippet** - `FloatingToolbar.vue`: Wand2 button next to
  "Save as snippet" (gated on a selection); the generated tree is inserted
  with `cloneWithFreshIds()` + `clean()` + `applyImagePlaceholder()` using
  the same placement as paste (into the selected container, else as a
  sibling right after it, else appended at the document root), then selected.
- **AI Generate Page** - `BlockEditor.vue`: "AI Page" top-bar button (visible
  in embedded mode too, unlike Templates); the generated tree replaces the
  document via the `onNew()` pattern (root coerced to tag `document`,
  fresh `Block` page, keeping the open page's id/name/category).
- **AI history re-import** - `AiGeneratedPanel.vue` (new "AI generations"
  sidebar tab in `BlockEditor.vue`, Sparkles icon): lists recent records
  with a valid payload (`listAiGenerations()` on GET /ai/generated,
  filtering out failed/rejected calls). Clicking one re-imports it the same
  way a fresh generation would be - pages replace the document, snippets
  insert at the current selection via the shared
  `insertGeneratedSnippet()` (extracted from FloatingToolbar into
  `editor-actions.ts`). Recovery path for generations whose payload was
  persisted server-side but never landed in the canvas (network drop, tab
  closed, a provider error after the reply was saved).

### File summary

New: `packages/core/src/db/ai-settings-schema.ts`, `ai-settings-records.ts`,
`ai-generated-schema.ts`, `ai-generated-records.ts`, `src/ai/providers.ts`,
`src/ai/prompts.ts`, `drizzle/0019_overrated_ken_ellis.sql`, `drizzle/0020_stiff_the_spike.sql`,
`apps/admin-dashboard/src/components/settings/AiSettingsCard.vue`,
`apps/admin-dashboard/src/utils/ai-settings-api.ts`,
`apps/whoobe-one-spike/src/ai-api.ts`, `apps/whoobe-one-spike/src/components/AiGenerateModal.vue`,
`apps/whoobe-one-spike/src/components/AiGeneratedPanel.vue`.

Modified: `packages/core/drizzle.config.ts`, `packages/core/src/server.ts`,
`packages/core/package.json` (SDK deps), `apps/core-api/src/server.ts` (4 routes),
`apps/admin-dashboard/src/stores/tabsStore.ts`, `layouts/DashboardLayout.vue`,
`views/SettingsView.vue`, `apps/whoobe-one-spike/src/components/FloatingToolbar.vue`,
`src/components/BlockEditor.vue`, `src/scripts/editor-actions.ts`
(`insertGeneratedSnippet()`).

### Verification

- `pnpm --filter @whoobe-cms/core db:generate` produced the migration;
  `db:migrate` applied it against a fresh Postgres (`ai_settings`,
  `whoobe_ai_generated` tables exist).
- All four apps typecheck (`@whoobe-cms/core`, `core-api`, `admin-dashboard`,
  `whoobe-one-spike`); admin-dashboard + spike production builds pass.
- Authenticated curl round-trip against the running dev server: GET
  `/ai/settings` → `null`; PUT persists (key never echoed, `hasApiKey: true`);
  PUT with blank key keeps the existing key; POST `/ai/generate` with an
  invalid key fails with the mapped 401 message **and** writes an error row
  to `whoobe_ai_generated` (with `createdBy`); bad `kind` → 400; GET
  `/ai/generated` lists the row.
- Pure-logic spot checks (node against the built dist): system/user prompt
  building, markdown-fence JSON parsing, and `validateElementTree()` happy/
  duplicate-id/bad-tag cases.
- A full happy-path generation needs a real provider key + reachable
  endpoint - not exercisable in CI/dev without one.

### Follow-ups (not in scope)

- Streaming (SSE) generation with token-level feedback in the modal.
- Per-website AI settings (the `mail_settings`-style "why global" argument
  applies identically here).
- AI generation history UI in the admin dashboard (the `GET /ai/generated`
  endpoint already returns the data).
- Persisting "AI generated" flags/attribution on saved pages.