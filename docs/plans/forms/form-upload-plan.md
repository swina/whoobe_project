# Form file upload (plan)

Status: plan, nothing built yet. Branch for the plan: `feat/download-element` (the download element is done, see CHANGES.md).

## Decisions taken
- **Two steps** (option B): the file is uploaded first, the form submission only carries a reference to it.
- **Limits are set per website** (formats, size per file, number of files, daily quota).
- **Target location**: a folder of the asset library, **private by default**; public only if the website allows it.
- **Content checks** on every file (see "Checks").

## One thing to decide: how the bytes travel (B or B')
Whoobe's S3 is internal; the browser never talks to it (the asset-processor proxies, which avoids CORS and expiring URLs).

| | B (pre-signed S3 URL) | B' (signed token, bytes through our own endpoint) |
|---|---|---|
| Step 1 | gateway returns a pre-signed `PUT` URL | gateway returns a short-lived signed token |
| Step 2 | browser `PUT`s to S3 | browser `PUT`s the raw body to `asset-processor /public/uploads/<token>` |
| Needs | S3 reachable from visitors + CORS on the bucket | nothing new on the network |
| Size limit | enforced by S3 only loosely (a pre-signed PUT cannot cap the length reliably) | enforced **while streaming**: the request is cut at the cap |
| Content check | after the upload, from the bucket | on the first bytes, **before** anything is stored |
| Memory | none | none (streamed to S3, not buffered) |

**Recommendation: B'.** It is the same two-step flow, but we can refuse a wrong or oversize file before it reaches storage, and S3 stays private. Plain B stays possible later for installs that expose S3.

## Flow (B')
1. The form element has an **Upload** field (`input type=file`) with `{ accept?, maxFiles?, targetFolder? }`, validated against the website's limits at publish time and again at the server.
2. On choosing a file the page asks `POST /public/uploads/intent` (gateway or core-api) with `{ formRef, filename, size, contentType }`. The server checks the form is a real authored form (same mechanism as the form notify blocks), the website's limits, the rate limit, and returns `{ uploadId, token, expiresIn }`. The token is an HMAC over `uploadId, websiteId, formRef, maxBytes, allowed types, expiry`.
3. The browser sends the bytes: `PUT /public/uploads/<token>`. The endpoint verifies the token, streams the body with a hard cap, checks the first bytes (see Checks), writes the object to a **staging** key `private/_uploads/<websiteId>/<uploadId>` and records `{ status: 'staged' }`.
4. The form is submitted with `attributes.<field> = { uploadId }` (never a path or URL). On submit the server resolves the ids it issued for that form, moves each object to the target folder under a **generated name** (`<uuid>.<ext>`, original name kept only as metadata), links the asset to the submission, and marks it `attached`.
5. A periodic job deletes `staged` uploads older than a few hours that were never attached.

## Checks (all of them, every file)
- **Allow-list** of extensions per website, plus the **sniffed type must match**: magic bytes for the common formats (pdf, png, jpg, gif, webp, zip, docx/xlsx/pptx as zip containers, mp3, mp4, txt/csv checked as valid UTF-8 without control bytes). A mismatch is refused. Not the browser's `Content-Type`.
- **Never allowed** whatever the website says: html, htm, svg, xml, js, mjs, php, exe, dll, sh, bat, jar, msi, and double extensions (`a.pdf.exe`); images are re-encoded through sharp (as the DAM already does for thumbnails) with the pixel limit, which drops payloads hidden in metadata.
- **Size**: cap while streaming (413); declared size in the intent must agree.
- **Names**: generated, never trusted; original name sanitized for display only.
- **Rate and quota**: per IP and per website (daily bytes and count), same style as the form submit limit.
- **Origin of the intent**: only forms authored in the website, the same lookup as `authoredFormNotify`.
- **Serving**: the files are private (`private/…`, session needed), always `Content-Disposition: attachment`, `nosniff`, CSP `sandbox` (already in `hardenAssetResponse`). Public target folder only when the website allows it, and then only for images.
- **Antivirus hook** (phase 2): a scan step between `staged` and `attached` (ClamAV container, optional); until then nothing is served from `staged`.
- **Logging**: each refusal logged with the reason, without the file content.

## Data
- `form_uploads` table: `id, website_id, form_ref, status (staged|attached|rejected), size, sniffed_type, original_name, s3_key, asset_id, submission_id, created_at, attached_at`.
- Website `settings.uploads`: `{ enabled, allowedExtensions[], maxFileBytes, maxFiles, dailyBytes, targetFolder, allowPublicFolder }`, edited in the website settings.

## Where the work is
- `packages/core`: limits and type sniffing (pure, unit-tested), `form_uploads`, token sign/verify.
- `apps/asset-processor`: `PUT /public/uploads/:token` (streaming, caps, staging, re-encode), the periodic cleanup.
- `apps/core-api` and the gateway: intent, attaching on submit (both submit paths).
- `apps/whoobe-one-spike`: the Upload element and its settings (accept, max files, target folder) in the form editor; published sites via the SDK adapters (Vue, React, Svelte) and the generated forms.
- Dashboard: the website's upload limits; the uploads in the submissions list (download via the DAM, private).
- Tests: unit (sniffing, limits, token), API (every refusal: type, size, expired/forged token, wrong form, over quota), browser (upload then submit, then the file is in the private folder and not public), and the nightly security stack.

## Phases
1. Core: limits, sniffing, token, table, migration + unit tests.
2. Endpoints (intent, PUT, attach on submit, cleanup) + API tests.
3. Editor element + website settings + SDK/published forms + browser tests.
4. Antivirus hook, public-folder option, uploads view in the dashboard.
