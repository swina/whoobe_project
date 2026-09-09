# AI Images Agent — Image Generation Plan

## Overview

A dedicated image generation system integrated with the DAM. Users can either reuse their text-AI provider with a different model, or configure a completely separate provider/endpoint/API key specifically for images. Generated images are downloaded server-side and saved to the DAM — no ephemeral URLs.

---

## 1. Database Layer

### New table: `ai_image_settings` (separate from `ai_settings`)

Same per-user pattern as `ai_settings`, so image provider config is independent.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `user_id` | `uuid PK` | — | FK → `users(id)` ON DELETE CASCADE |
| `provider` | `text` | `'openai'` | `openai`, `openrouter`, `custom` |
| `model` | `text` | `'dall-e-3'` | Model name (e.g. `dall-e-3`, `stabilityai/stable-diffusion-3.5` for OpenRouter) |
| `endpoint` | `text` | nullable | Base URL override for custom providers |
| `api_key` | `text` | nullable | Server-only; never returned by GET |
| `updated_at` | `timestamp with tz` | `now()` | |

**New files:**
- `packages/core/src/db/ai-image-settings-schema.ts`
- `packages/core/src/db/ai-image-settings-records.ts` — `getAiImageSettings(userId)` + `upsertAiImageSettings(userId, input)`

**Migration:** `packages/core/drizzle/0036_ai_image_settings.sql`

---

## 2. Provider Layer

### `packages/core/src/ai/image-providers.ts` — new file

```typescript
type ImageAiProvider = 'openai' | 'openrouter' | 'custom'

interface AiImageSettings {
  provider: ImageAiProvider
  model: string
  endpoint: string | null
  apiKey: string | null
}

interface AiImageGenerateInput {
  settings: AiImageSettings
  prompt: string
  n?: number          // number of images (default 1, max 4)
  size?: string       // e.g. "1024x1024", "1792x1024"
  quality?: string    // "standard" | "hd" (DALL-E 3)
  style?: string      // "vivid" | "natural" (DALL-E 3)
}

interface AiImageGenerateOutput {
  images: { url: string; revisedPrompt?: string }[]
  rawResponse: unknown
}

function generateImage(input: AiImageGenerateInput): Promise<AiImageGenerateOutput>
```

**Provider dispatch:**

- **OpenAI**: Uses OpenAI SDK `images.generate()`. Default model `dall-e-3`.
- **OpenRouter**: OpenAI-compatible `POST /images/generations` at `https://openrouter.ai/api/v1`. Default model `stabilityai/stable-diffusion-3.5`.
- **Custom**: Any OpenAI-compatible `POST /images/generations` endpoint.

### `packages/core/src/ai/image-dam.ts` — new file

Server-side download + DAM upload:

```typescript
interface AiImageDamInput {
  /** The temp URL from the provider */
  url: string
  /** Target DAM folder path (e.g. "/ai-generated") */
  folderPath: string
  /** Base name for the file (slugified prompt) */
  fileName: string
  /** Optional: the revised prompt for metadata */
  revisedPrompt?: string
}

interface AiImageDamOutput {
  /** Permanent DAM URL */
  damUrl: string
  /** Asset record ID */
  assetId: string
}

async function saveAiImageToDam(input: AiImageDamInput): Promise<AiImageDamOutput>
```

Implementation:
1. `fetch(url)` the temp URL (server-side, binary)
2. Detect MIME type from `Content-Type` header or fall back to `image/png`
3. Generate a unique filename: `{slugified-filename}-{short-uuid}.{ext}`
4. Upload to MinIO via `S3AssetStorageProvider.uploadAsset(filePath, buffer, mimeType)`
5. Create a `folders` + `assets` DB row via `upsertAssetRecord` / folder helpers
6. Resolve the proxy URL via `forwardOrigin()` (same pattern as asset-processor)
7. Return `{ damUrl, assetId }`

---

## 3. API Routes

### `GET /ai/image-settings` (permission: `SETTINGS_MANAGE`)

Returns the user's image AI settings (never the API key). When no image-specific settings exist, returns `usingFallback: true` with settings mirrored from `ai_settings`.

### `PUT /ai/image-settings` (permission: `SETTINGS_MANAGE`)

Same pattern as `PUT /ai/settings`. Blank `apiKey` keeps existing.

### `POST /ai/generate-image` (permission: `OBJECTS_WRITE`)

The single endpoint that **generates + downloads + uploads to DAM** in one call.

Body:
```json
{
  "prompt": "A red sports car on a mountain road at sunset",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard",
  "style": "vivid",
  "folderPath": "/ai-generated"
}
```

Flow:
1. Look up `ai_image_settings` for `req.user.id`
2. If no image settings exist, fall back to `ai_settings` (API key) with `openai` + `dall-e-3`
3. Call `generateImage()` — returns temp URLs
4. For each generated image:
   a. `fetch()` the temp URL (server-side)
   b. Upload to MinIO via `saveAiImageToDam()` at the requested `folderPath`
   c. Generate a slug from: `{prompt-words}-{short-random}` e.g. `red-sports-car-mountain-sunset-a3f2`
5. Log to `whoobe_ai_generated` with kind `'image'` (store the DAM asset IDs)
6. Return permanent DAM URLs

Response:
```json
{
  "images": [
    {
      "damUrl": "/dam-asset/ai-generated/red-sports-car-sunset-a3f2.webp",
      "assetId": "uuid-...",
      "revisedPrompt": "A red sports car...",
      "width": 1024,
      "height": 1024
    }
  ]
}
```

**Why server-side download?** OpenAI's temp URLs expire in ~1 hour. The server downloads them immediately so the user never sees a broken image. The DAM holds the permanent copy.

### Error handling

- Download failure: the temp URL might be slow to serve — 30s timeout, retry once.
- `429` rate limits: same 3-attempt retry as text generation.
- Content policy violations → 422 with the provider's error message.
- MinIO upload failure → 500 with message; the temp URL is also returned so the user can retry.

---

## 4. Admin Dashboard — Settings UI

### `AiImageSettingsCard.vue`

Path: `apps/admin-dashboard/src/components/settings/AiImageSettingsCard.vue`

Same pattern as `AiSettingsCard.vue`:

- **Provider dropdown**: OpenAI, OpenRouter, Custom
- **Model text input**: Placeholder examples per provider
- **Endpoint input**: Required for Custom, optional for OpenRouter
- **API Key password field**: "Leave blank to keep current"
- **Fallback indicator**: When no image-specific settings exist, show a notice linking to the AI settings
- **Default folder**: Optional text input for the default DAM folder path (e.g. `/ai-generated`), used as default in the generation modal

### Tabs store and settings view

- Add `'ai-image'` to `SettingsSubSection` in `tabsStore.ts`
- Add sidebar entry in `DashboardLayout.vue`
- Add sub-tab in `SettingsView.vue`

### API client

Add to `apps/admin-dashboard/src/utils/ai-settings-api.ts`:

```typescript
fetchAiImageSettings(baseUrl): Promise<{ settings: AiImageSettingsRecord; usingFallback: boolean }>
saveAiImageSettings(baseUrl, input): Promise<AiImageSettingsRecord>
```

---

## 5. Whoobe-One-Spike — Image Generation Modal

### `AiImageGenerateModal.vue`

A modal with three steps:

**Step 1 — Generate:**
- Prompt textarea (required)
- Size selector: 256×256, 512×512, 1024×1024, 1792×1024
- Style toggle: Vivid / Natural (DALL-E 3)
- Number of images: 1–4 (DALL-E 3 limited to 1)
- Generate button → spinner + "Generating..."

**Step 2 — Preview:**
- Grid of generated image thumbnails
- Each shows a "Save to DAM" button
- Folder picker (tree of DAM folders, fetched from the asset-processor API)
- Default folder from settings pre-filled
- "Save selected" or "Save all" action

**Step 3 — Insert:**
- After save, the permanent DAM URL is available
- For FloatingToolbar: "Replace image" sets `image.url`
- For BlockEditor: "Insert as block" creates an `<img>` element

### Integration points

**FloatingToolbar.vue** — Image popover:
- Add "AI Generate" tab alongside "Browse assets" and "URL"
- Opens AiImageGenerateModal
- On save+insert, sets the element's `image.url` to the DAM URL

**BlockEditor.vue** — Toolbar:
- Add "AI Image" button next to "AI Page"
- Opens AiImageGenerateModal
- On save+insert, creates a new `<img>` block with the DAM URL

### API client

Add to `apps/whoobe-one-spike/src/ai-api.ts`:

```typescript
generateImage(prompt: string, options: {
  n?: number; size?: string; quality?: string; style?: string; folderPath: string
}): Promise<{ images: { damUrl: string; assetId: string; revisedPrompt?: string; width?: number; height?: number }[] }>
```

---

## 6. Provider-Specific Notes

### OpenAI (DALL-E 3 / DALL-E 2)

| Feature | DALL-E 3 | DALL-E 2 |
|---------|----------|----------|
| Max images per call | 1 | 10 |
| Sizes | `1024x1024`, `1792x1024`, `1024x1792` | `256x256`, `512x512`, `1024x1024` |
| Quality | `standard`, `hd` | — |
| Style | `vivid`, `natural` | — |

### OpenRouter

OpenAI-compatible format. Compatible models:
- `stabilityai/stable-diffusion-3.5`
- `black-forest-labs/flux-schnell`
- `black-forest-labs/flux-pro`
- `openai/dall-e-3`

### Custom

Any OpenAI-compatible `POST /images/generations` endpoint.

---

## 7. Files to Create/Modify

### New files

| File | Purpose |
|------|---------|
| `packages/core/src/db/ai-image-settings-schema.ts` | DB schema |
| `packages/core/src/db/ai-image-settings-records.ts` | CRUD |
| `packages/core/src/ai/image-providers.ts` | Image generation layer |
| `packages/core/src/ai/image-dam.ts` | Server-side download + DAM upload |
| `packages/core/drizzle/0036_ai_image_settings.sql` | Migration |
| `apps/admin-dashboard/src/components/settings/AiImageSettingsCard.vue` | Settings UI |
| `apps/whoobe-one-spike/src/components/AiImageGenerateModal.vue` | 3-step generation/preview/save modal |

### Modified files

| File | Change |
|------|--------|
| `packages/core/src/server.ts` | Export new modules |
| `apps/core-api/src/server.ts` | Add 3 new routes + import S3 storage provider |
| `apps/admin-dashboard/src/utils/ai-settings-api.ts` | Add AI image settings API |
| `apps/admin-dashboard/src/stores/tabsStore.ts` | Add `'ai-image'` subsection |
| `apps/admin-dashboard/src/views/SettingsView.vue` | Add AI Image sub-tab |
| `apps/admin-dashboard/src/layouts/DashboardLayout.vue` | Add sidebar item |
| `apps/whoobe-one-spike/src/ai-api.ts` | Add `generateImage()` |
| `apps/whoobe-one-spike/src/components/FloatingToolbar.vue` | "AI Generate" tab in image popover |
| `apps/whoobe-one-spike/src/components/BlockEditor.vue` | "AI Image" toolbar button |

---

## 8. End-to-End User Flow

```
User clicks "AI Generate" in FloatingToolbar
  → Modal: Step 1 (prompt + options + generate)
  → POST /ai/generate-image { prompt, size, folderPath }
  → Server: generate via provider → download temp URL → upload to MinIO → create DB record
  → Returns { images: [{ damUrl, assetId }] }
  → Modal: Step 2 (preview thumbs with DAM URLs)
  → User clicks "Use this image"
  → Modal closes, element's image.url = damUrl
  → Page saved, image is permanent
```

No future phase needed for DAM integration — it's built in from day one. The only future phases are additional providers (Stability AI, local SD) and advanced controls (negative prompt, inpainting, seed control).