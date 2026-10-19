# CDN providers: Cloudinary and Cloudflare Images, per website

Follow-up of `assets-cdn.md`. Two problems found when asked "what if the CDN is not Cloudinary":

1. The mirroring code is **hard-wired to Cloudinary's API**: it sends `{ file, upload_preset }` and needs `secure_url` and `public_id` back. The `provider` field is only a label stored with the mirror.
2. The setting is **one per installation** (stored in the first website's `settings`, an arbitrary place), but sites on different domains normally have different CDNs.

## Decisions

- **Providers are adapters in code**, two to begin with: `cloudinary` (as today: the upload goes through a Gateway endpoint and route, plus an unsigned upload preset) and `cloudflare-images`. Each adapter declares the fields its settings form shows, validates them, and does the upload. The preset is a Cloudinary field, not part of the generic setting.
- **Cloudflare Images is called directly, not through the Gateway.** Its upload API takes `multipart/form-data` with the file; the Gateway's route executor sends a JSON body only, so a Gateway route cannot carry the bytes. The adapter calls `api.cloudflare.com` itself through the outbound guard (`safeFetch`), with an API token (permission *Cloudflare Images: Edit*) that is stored **encrypted** (`INTEGRATION_SECRETS_ENCRYPTION_KEY`, like the AI and Figma keys) and never returned. The principle of `assets-cdn.md` ("configuration, not custom code") is kept for Cloudinary and for anything the Gateway can express; a provider that needs another transport gets an adapter.
- **Cloudflare adapter:** config `accountId` (32 hex characters), `variant` (default `public`), secret `apiToken`. The file is uploaded as bytes (a private asset needs no public origin), with the custom image id = the asset's id, so the delivery URL is stable (`https://imagedelivery.net/<hash>/<asset id>/<variant>`, taken from the `variants` of the answer). Re-mirroring an asset deletes the old image and uploads again (Cloudflare refuses a second image with the same id). Limits checked before sending: an image type (png, jpeg, gif, webp, svg, avif), at most 10 MB; Cloudflare's own error message is returned in the detail. The API base can be changed (`CDN_CLOUDFLARE_API_BASE`) for a Cloudflare-compatible gateway or a test.
- **Settings per website, with the installation's default as the fallback.** New table `cdn_mirror_settings` (`website_id` null = the default, unique per website; `provider`, non-secret `config`, encrypted `secrets`), the same shape as `mail_settings`. The default of an installation that already had one is copied from the first website's `settings.cdnMirror` by the migration (backfill; the old key is left in place and no longer read). The effective settings of a website: its own row, else the default, else none.
- **API:** `GET /whoobe-one/settings/cdn-mirror?websiteId=` (the effective settings, never a secret: `secretsSet`, and the legacy `gatewayRouteId` / `uploadPreset` / `provider` keys for the sync script), `PUT` (`{ websiteId?, provider, config, secrets }`; **needs `settings:manage`** now that it holds a credential, it was `objects:write`), `DELETE ?websiteId=` (the website goes back to the default), `POST /whoobe-one/settings/cdn-mirror/test` (Cloudflare: the token and the account are checked with a read call), `GET /whoobe-one/settings/cdn-providers` (the providers and their fields, for the form). Audited as `setting.cdn_mirror_update` / `setting.cdn_mirror_remove` (the token is "changed", never written).
- **The mirror call resolves the settings itself:** `POST /api/v1/dam/assets/:id/mirror-cdn { websiteId? }`. The old body (`gatewayRouteId`, `uploadPreset`, `provider`) still works and means Cloudinary with those values, so existing scripts and clients keep working.
- **Dashboard:** *Settings > DAM > CDN Mirroring* is the default (provider picker, the provider's fields, a test button); *Websites > (a website) > Settings* has the same card for that website with "use the default" ; *Publish > CDN Mirroring* shows which provider and settings apply to the chosen website (own or default) and no longer asks for the route and the preset by hand; the sync command needs only the website. The *Publish to CDN* action in Assets uses the default.
- **Not built:** more providers (a new one is an adapter and a test), signed Cloudinary uploads, deleting a mirror when an asset is deleted, choosing a site in the Assets action.

## Steps

1. Migration 0066, schema, records, the adapters (pure parts: validation, multipart, answer parsing) with unit and integration tests.
2. asset-processor: the mirror endpoint resolves the settings and calls the adapter.
3. core-api: the settings routes, audit, route contract.
4. Dashboard, the sync script, docs.
5. API tests with a mock Cloudflare, browser test.
