# Asset CDN Mirroring — Implementation Plan

## Overview

Whoobe's DAM stores the authoritative master of every asset in a private S3/MinIO bucket, resolved on demand through asset-processor's `/dam-asset/*` proxy (see `packages/core/src/mail/mail-image-urls.ts`'s own header comment). That's correct for an install that's reachable from wherever the asset is consumed — but Whoobe can also run entirely inside a locked-down internal network (VPN-only, zero public exposure), used purely as an authoring/design tool. In that mode, nothing outside the network — a recipient's mail client, an ESP's servers, a public CDN edge — can ever resolve a `/dam-asset/*` URL.

This surfaced concretely in the Brevo email-campaign integration (see `CHANGES.md`, 2026-09-19): the workaround was to base64-embed a resized copy of every image directly into the email body. It works, but it's a compromise on every axis — larger payloads (Brevo/Gmail already warn past ~102KB), a forced resize/re-encode (quality loss), and it has to be redone on every single render since nothing is cached anywhere external.

**This plan adds a real fix**: let an asset be *mirrored* to an external image CDN (Cloudinary first). Once mirrored, the asset carries a stable, permanent, public delivery URL that any consumer — a Brevo campaign, a published page, anything — can use directly instead of falling back to base64 or a local-only URL. Mirroring goes through the existing Gateway, exactly like every other third-party integration in this codebase (Shopify/Stripe/HubSpot/Brevo): a preset + a configured endpoint/route, executed via the already-generic, already-authenticated `POST /routes/:id/execute`. No Cloudinary-specific server code beyond the small orchestration step described below — swapping in a different provider (imgix, Bunny, ImageKit, a plain S3+CloudFront bucket with its own upload API) means adding a preset, not writing code. This is the same "**Configuration, not custom code**" principle the Gateway itself is already built on.

Two trigger points, per the conversation that scoped this:
1. **Manual, from the Asset Manager** — a "Publish to CDN" bulk action in the multi-select toolbar, next to Move/Download/Delete (Phase 1, this plan).
2. **Automatic, on first publish** of a page/object that references the asset (later phase — see "Future Phases" below).

Resolving a DAM reference to *prefer* the mirrored CDN URL (in email rendering, in public page rendering) is also a later phase, deliberately deferred — Phase 1 only gets an asset mirrored and its URL stored; nothing consumes it automatically yet.

---

## Architecture

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│   admin-dashboard        │        │   Settings → DAM              │
│   AssetsView.vue          │        │   CdnMirrorSettingsCard.vue    │
│   multi-select toolbar    │        │   (pick default Gateway        │
│   "Publish to CDN" button │        │    endpoint + upload route)    │
└────────────┬─────────────┘        └───────────────┬────────────────┘
             │ POST .../assets/:id/mirror-cdn        │ reads/writes
             ▼                                       ▼
┌───────────────────────────────────────────────────────────────────┐
│                        asset-processor                             │
│  POST /api/v1/dam/assets/:id/mirror-cdn                            │
│   1. Load the asset record (S3 key, mimeType)                      │
│   2. Read the configured CDN Gateway endpoint/route (Postgres,     │
│      website_settings — same pattern as Mail settings)             │
│   3. Build the provider's upload payload (Cloudinary: file as a    │
│      public /dam-asset/* URL, OR base64 data: URI if the DAM has   │
│      no public origin configured — same fork as                    │
│      resolveMailImageUrls() vs resolveMailImageDataUris())         │
│   4. Call the GATEWAY's POST /api/v1/gateway/routes/:id/execute    │
│   5. Store the returned URL on the asset record                    │
└───────────────────────────────┬─────────────────────────────────────┘
                                 │ POST /api/v1/gateway/routes/:id/execute
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│                             gateway                                 │
│   existing, generic route executor (proxyFetch + buildAuthHeaders) │
│   Cloudinary endpoint/route configured like any other vendor        │
└───────────────────────────────┬─────────────────────────────────────┘
                                 ▼
                     ┌───────────────────────┐
                     │   Cloudinary API       │
                     │   (or another CDN,     │
                     │    same mechanism)     │
                     └───────────────────────┘
```

`asset-processor` is the orchestrator (it already owns all asset CRUD/state and has direct S3 access to build the source URL or fetch bytes); `gateway` stays a dumb, generic proxy that never needs to know anything Cloudinary-specific beyond the endpoint config an admin enters.

---

## Data Model

New column on `assets` (`packages/core/src/db/dam-schema.ts`). **Not** reusing the existing `metadata: jsonb` column — that one is strongly typed to `ExtractedAssetMetadata` (EXIF/camera/GPS/rights, extracted *from the file itself*), and mirror bookkeeping is a different kind of fact (system state about where else this asset lives), so it gets its own column rather than an awkward type-widening of `metadata`.

```ts
// dam-schema.ts
cdnMirrors: jsonb('cdn_mirrors').$type<Record<string, CdnMirrorRecord>>().default({}),
```

```ts
// A new shared type, e.g. packages/core/src/dam/cdn-mirror.ts
export interface CdnMirrorRecord {
  provider: string          // matches the Gateway preset id, e.g. 'cloudinary'
  url: string                // stable, permanent delivery URL - safe to use anywhere, no expiry
  providerAssetId?: string   // Cloudinary's public_id (or equivalent) - needed to delete/replace it later
  mirroredAt: string         // ISO timestamp
  bytesSent: number          // size of what was actually uploaded (post-resize, if any)
}
```

Keyed by provider id (not a single `cdnUrl` field) so an asset mirrored to more than one provider over time keeps its history instead of overwriting silently.

- **Migration**: `packages/core/drizzle/0041_asset_cdn_mirrors.sql`, generated via `pnpm --filter @whoobe-cms/core db:generate` after the schema edit (matching how every prior migration in this repo was produced — `0038_gateway.sql` etc.).
- **`packages/core/src/db/asset-records.ts`**: extend `AssetRecord` with `cdnMirrors: Record<string, CdnMirrorRecord>`, and add `updateAssetCdnMirror(id: string, provider: string, mirror: CdnMirrorRecord): Promise<AssetRecord>` (merges into the existing map, doesn't replace it) alongside the existing `getAssetById`/`upsertAssetRecord`.
- **`apps/admin-dashboard/src/utils/dam-api.ts`**: `DamAssetRecord` gains the same `cdnMirrors` field so the UI can show mirror status without a second round-trip.

---

## Gateway: Cloudinary preset

**`apps/admin-dashboard/src/utils/gateway-presets.ts`** — new entry, same shape as the existing Shopify/Stripe/HubSpot/Brevo ones:

```ts
{
  id: 'cloudinary',
  label: 'Cloudinary',
  description: 'Image/video CDN - mirrors DAM assets to a public, stable delivery URL.',
  baseUrl: 'https://api.cloudinary.com/v1_1/{cloud_name}',
  authType: 'none',
  authConfigFields: [],
  starterRoutes: [
    { method: 'POST', path: 'image/upload', description: 'Upload/mirror an image' },
  ],
}
```

**Important technical detail — auth**: Cloudinary's primary upload API needs a per-request HMAC-SHA1 signature (`api_key` + `timestamp` + everything else, signed with `api_secret`) — that's a request-shape the Gateway's existing `authType` model (`none`/`api-key`/`bearer`/`basic`/`oauth2`, all static-header schemes) can't produce. Rather than adding a whole new "computed signature" auth type to the Gateway for this one case, this plan uses Cloudinary's **unsigned upload** mode instead: an *upload preset* configured once in the Cloudinary dashboard (marked "unsigned"), then every upload just POSTs `file` + `upload_preset=<name>` with **no signature and no secret in the request at all** — `authType: 'none'` on the Gateway endpoint is correct, and the preset name becomes one more field in the request body the admin fills in (stored as a plain Gateway route default, or entered per-mirror-action — TBD in implementation, leaning towards storing it in the new Settings card described below).

**Risk to validate early in Phase 1** (flagged honestly, not verified live): the Gateway's `proxyFetch` (`apps/gateway/src/proxy-engine.ts`) always sends `JSON.stringify(body)` with `Content-Type: application/json` — Cloudinary's upload endpoint is documented/typically integrated as `multipart/form-data` or `application/x-www-form-urlencoded`. Whether it accepts a plain JSON body for the (non-binary) "`file` is a URL or a `data:` URI" case is not something I've been able to verify in this environment (no live Cloudinary credentials). If it turns out JSON is rejected, the fix is small and has precedent already in this codebase: `apps/gateway/src/gateway-auth-headers.ts`'s own `refreshOAuthToken()` already builds a `URLSearchParams` + `x-www-form-urlencoded` request for a different reason (RFC 6749 token requests) — `proxyFetch` would need a route-level "body encoding" option (`json` | `form`) rather than always assuming JSON. This is called out explicitly as the first thing to confirm once real Cloudinary credentials are available, before considering Phase 1 fully done.

---

## New endpoint: `apps/asset-processor/src/server.ts`

```
POST /api/v1/dam/assets/:id/mirror-cdn
  Permission: PERMISSIONS.ASSETS_UPLOAD (same class of action as /assets/move)
  Body: { gatewayRouteId: string, uploadPreset?: string }   // or read the default from Settings if body omits them
```

One asset per call — matches the existing convention (`/assets/move`, `deleteSelectedAssets()`'s client-side loop for bulk delete) rather than inventing a new batch-endpoint shape; the Asset Manager's bulk button loops over `selectedAssetIds` the same way `deleteSelectedAssets()`/`downloadSelectedAssets()` already do.

Logic:
1. `getAssetById(id)` — 404 if missing.
2. Resolve the image source to hand Cloudinary:
   - If `S3_PUBLIC_BASE_URL` is configured **and looks like a genuinely public origin** (`isPubliclyReachableUrl()`, `apps/asset-processor/src/server.ts`): build the existing `/dam-asset/*` proxy URL and let Cloudinary fetch it remotely (`file: <proxy-url>`) — lightweight, no bytes pass through our own services twice.
     - **Found live**: a dev/local install commonly sets `S3_PUBLIC_BASE_URL` to `http://localhost:3002/dam-asset` (or a bare Docker service name) - that's set, but not actually reachable from Cloudinary's own servers. Handing it over anyway didn't fail cleanly: Cloudinary reported back a plain `400` with `"Error in loading http://localhost:.../... - 403 Forbidden"`, easy to misread as a permissions problem on *our* side rather than "the URL was never reachable from outside to begin with." `isPubliclyReachableUrl()` rejects `localhost`/loopback/private-IP-range/bare-hostname values so the base64 fallback kicks in automatically instead - a heuristic on the hostname's shape, not an actual reachability probe.
   - Otherwise (fully private/VPN-only install, or a local one caught by the check above): fetch the asset's own bytes and re-encode/resize for delivery the same way `reencodeForEmail()` (`packages/core/src/mail/mail-image-urls.ts`) already does, then send as a base64 `data:` URI (`file: "data:image/jpeg;base64,..."`). This reuses that function directly rather than duplicating resize logic — extract it to a shared, non-mail-specific location (e.g. `packages/core/src/dam/image-reencode.ts`) since it's no longer email-specific once a second caller needs it.
3. `executeRoute`-equivalent call to the Gateway's `POST /api/v1/gateway/routes/:id/execute` with the built body.
4. On success, Cloudinary's response includes `secure_url` and `public_id` — call `updateAssetCdnMirror(id, 'cloudinary', { provider: 'cloudinary', url: secure_url, providerAssetId: public_id, mirroredAt: now, bytesSent })`.
5. Return the updated asset record (same `{ asset: {...} }` shape as other asset-processor endpoints).

---

## Settings: choosing the default CDN endpoint/route

New card, **`apps/admin-dashboard/src/components/dam/CdnMirrorSettingsCard.vue`**, rendered alongside the existing `DamConfigManager.vue` under Settings → DAM (no new `SettingsSubSection` needed — this is squarely a DAM-delivery concern, same tab). Mirrors `MailSettingsCard.vue`'s "configure once, reuse everywhere" pattern:

- Gateway endpoint picker (reuses `listEndpoints()`/`listRoutes()` from `gateway-api.ts`, same as `BrevoCampaignModal.vue`) — auto-detects a route matching the Cloudinary preset's starter route (`POST image/upload`).
- Cloudinary `upload_preset` name field (the unsigned-upload preset configured on Cloudinary's own dashboard).
- Persisted the same way other global one-off config lives today — check `websites-records.ts`'s settings-blob pattern (used for autosave/logging/strip-html-comments toggles) and add a `cdnMirror: { gatewayRouteId, uploadPreset }` key there, with matching `GET`/`PUT /whoobe-one/settings/cdn-mirror` endpoints on core-api.

---

## Asset Manager UI

**`apps/admin-dashboard/src/views/AssetsView.vue`**: new button in the multi-select bulk-action bar (next to "Move Selected" / "Download Selected" / "Delete Selected"):

```html
<button @click="publishSelectedToCdn" :disabled="isPublishingToCdn" ...>
  <CloudUpload class="w-3.5 h-3.5" />
  <span>{{ isPublishingToCdn ? 'Publishing…' : 'Publish to CDN' }}</span>
</button>
```

`publishSelectedToCdn()` loops `selectedAssetIds` calling the new `mirrorAssetToCdn()` client function (new, in `dam-api.ts`), same loop/toast/error-tally shape as `handleDeleteSelected()` (`SnippetsView.vue`) already uses for a per-item bulk action. Disabled (with a tooltip) when Settings → DAM has no CDN endpoint configured yet, so the button doesn't silently no-op.

Each asset row/card (grid and list view) also gets a small badge when `cdnMirrors` is non-empty (e.g. a cloud icon with the provider name), so it's visible at a glance which assets are already mirrored — avoids accidentally re-mirroring (the action should be idempotent/cheap to re-run regardless, but the badge is a genuinely useful affordance either way).

---

## Phase 1 (this plan's scope)

1. **Data model**: `dam-schema.ts` column + migration, `asset-records.ts` additions, `dam-api.ts` type update.
2. **Gateway preset**: add Cloudinary to `gateway-presets.ts`.
3. **Shared re-encode helper**: extract `reencodeForEmail()`'s resize/JPEG logic out of `mail-image-urls.ts` into a shared, non-mail-specific home (`packages/core/src/dam/image-reencode.ts`), used by both the mail pipeline and the new mirror endpoint.
4. **Mirror endpoint**: `POST /api/v1/dam/assets/:id/mirror-cdn` in `asset-processor`.
5. **Settings UI**: `CdnMirrorSettingsCard.vue` + the small `GET`/`PUT /whoobe-one/settings/cdn-mirror` pair on core-api.
6. **Asset Manager UI**: "Publish to CDN" bulk button + per-asset mirrored badge.
7. ~~Verify end-to-end against a real Cloudinary account~~ **Done** — confirmed working live. Two real issues surfaced and were fixed along the way (not in the original plan text, recorded here for continuity):
   - The JSON-vs-form-encoding risk flagged above turned out to be a non-issue for the URL/base64 `file` field (Cloudinary accepted the Gateway's plain JSON POST) — the actual first failure was `isPubliclyReachableUrl()`'s underlying problem (see below), not encoding.
   - **`S3_PUBLIC_BASE_URL` pointing at `localhost`**: a local/dev install's public-base-URL env var commonly isn't actually reachable from Cloudinary's own servers (it's `http://localhost:3002/dam-asset` or similar). Handing that URL to Cloudinary anyway didn't fail cleanly - it came back as a plain `400` with `"Error in loading http://localhost:.../... - 403 Forbidden"`, which reads like a permissions problem rather than "never reachable to begin with." Added `isPubliclyReachableUrl()` (`apps/asset-processor/src/server.ts`) - rejects `localhost`/loopback/private-IP-range/bare-hostname values - so the base64 fallback engages automatically instead of attempting a doomed remote fetch.
   - **Mirror quality**: the base64 fallback originally ran the mirrored image through the same resize/re-encode cap built for email (1200px/JPEG 82) - defeats the point of a CDN mirror (Cloudinary should get the quality source of truth to transform on demand, not a pre-degraded copy) and would have meant re-mirroring the same asset with different caps for different consumers. Removed re-encoding from the mirror endpoint entirely (both the public-URL and base64 paths now send the true original); the email-only cap moved into `resolveMailImageDataUris()`'s own call, passed as explicit options rather than `reencodeImage()`'s defaults.

## Phase 2 — prefer the CDN URL when resolving a DAM reference

**Done for email** (`packages/core/src/mail/mail-image-urls.ts`): `resolveMailImageUrls()`/`resolveMailImageDataUris()` now check `cdnMirrors` first for every image reference - mirroring an asset already is the opt-in signal, so there's no separate "use CDN" setting to also check. A mirrored reference resolves straight to its stable CDN URL (skipping base64 entirely, since a mirror is already publicly reachable on its own); everything else keeps falling back to the local proxy URL or the base64/resize path exactly as before. This is what actually removes the base64/resize trade-off from Brevo campaigns once an asset has been mirrored.

**Not done - deferred, larger scope**: the equivalent for published pages (`packages/sdk/renderer`'s `resolveImageUrl()` in `url.ts`). Structurally different problem: the mail pipeline runs server-side in `packages/core` with direct Postgres access, so checking `cdnMirrors` is a plain DB read; the renderer package is the client-facing SDK (React/Vue/Svelte adapters, potentially edge/serverless), with no DB access of its own - it resolves references synchronously from data already in hand. Making it CDN-aware means threading `cdnMirrors` data through the public page-serving API response and the resolve call signature across all three framework adapters, not a same-shaped change to one file. Worth doing for production site performance, but a distinct piece of work - flagged here rather than assumed done.

## Future Phases (not this plan's scope — noted for continuity)

- **Phase 2b — published pages**: the `packages/sdk/renderer` half of Phase 2, described above.
- **Phase 3 — automatic mirror on publish**: hook into the page/object publish transition (`PATCH /whoobe-one/pages/:id` with `published: true`, and the object publish workflow) to walk the content tree for DAM image references and mirror any that aren't mirrored yet, before the publish completes.
- **Phase 4 — multi-provider**: once a second provider (imgix/Bunny/ImageKit/S3+CloudFront) is actually needed, confirm the preset+Settings-card approach generalizes cleanly (it should, by construction) rather than assuming it in the abstract. `pickCdnMirrorUrl()` (`mail-image-urls.ts`) also just takes whichever mirror comes first today - worth a real preference order once more than one provider is actually configured at once.
