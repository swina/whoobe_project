# More events: assets and pages

Release 0.2, block A2 ("Orchestrate"). The plan row: *`asset.*` and `page.published` through the same events table, delivery and loop guard as object events. Done when: tests like `object-events-loop-guard.integration.test.ts` for each new type; the object events guide lists them.*

## What exists

Object events (`docs/release/communication/object-events.md`): a write to a data object stores an event and one delivery per matching subscription in the same transaction; a worker in the gateway sends it through a Gateway endpoint and route, signed, with retries (6 attempts), a delivery log, and a loop guard (`X-Whoobe-Flow: stop`, per-actor and per-subscription counters). The envelope never carries attribute values.

## Decisions

- **Same machinery, not a second one.** The same `object_events` / `object_event_subscriptions` / `object_event_deliveries` tables, worker, signature headers, retries, kill switch (`OBJECT_EVENTS_ENABLED=0`), delivery log, subscription screens and permission (`object_events:manage`). An administrator who has connected an engine to objects adds asset or page types to a subscription.
- **Event types:**
  - `asset.created` - a file was uploaded to a path that had none (the library, a form upload attached to a submission, an AI image).
  - `asset.updated` - a new version was uploaded to an existing path. (A metadata edit is not an event: the extracted metadata is written automatically after each upload and would double every one.)
  - `asset.moved` - the file went to another folder or name (one event, with the old path in `from`, not a delete and a create).
  - `asset.deleted` - one file was deleted.
  - `asset.bulk` - a whole folder was deleted: ONE summary with the count and the first ids, never one event per file (the same rule as `object.bulk`).
  - `page.published` and `page.unpublished` - the page's `published` flag changed (the flag that makes it visible to the public API and to a site generation). Creating, editing and deleting a page are not events yet; a publish job's end is not either (a separate thing: it is a site, not a page).
- **Envelopes, like objects, never carry contents:**
  - asset: `asset: { id, path, folder, filename, mimeType, fileType, sizeBytes, isPublic, version }`, plus `from: { path }` for a move; never the bytes, never the extracted metadata.
  - page: `page: { id, websiteId, slug, locale, translationGroupId, published, publishedAt }`; never the content, the title or the SEO fields.
  - Both have `actor` (`user`, `api-client`, `system`, `import`) and, when the write said so, `endOfFlow`.
- **Storage.** `object_events.class_id` becomes nullable (an asset or a page has no class) and a column `subject_type` ('object' default, 'asset', 'page') says what `object_id` holds, so the existing index, the loop guard counters and the delivery log work unchanged on the subject's id. Migration 0065, expand only.
- **Who matches.** A subscription for one class receives object events of that class only; a subscription for every class (`classId` null) receives any type it lists. An event without a class (asset, page) is therefore matched only by subscriptions with no class, and the validation refuses a subscription that names a class and lists an asset or page type (it could never fire).
- **Atomic with the write, like objects.** The event is stored in the same transaction as the asset row or the page row, so there is no event for a write that did not happen and no write without its event.
- **Loop guard applies unchanged**, by construction: only an API client can loop (people, the system and imports are never counted); the counters are per actor and subject id within the window; an event carrying `endOfFlow` starts nothing. Today only staff sessions and the service token write files and pages (API clients write data objects), so the asset service and core-api do not read `X-Whoobe-Flow`; if a client surface for files is added, it passes the header into the same options.
- **A folder** of up to 10 files gives one `asset.deleted` each, a bigger one ONE `asset.bulk`. A log file the service uploads (service token, no person) is a silent write.
- **Not emitted:** thumbnails and variants, a CDN mirror update, a page's own edits, the Pimcore migration tool's assets (it runs silent), the staging bytes of a form upload before it is attached. The delivery of a form upload is `asset.created` with actor `system` and the id `form-upload`.
- **Dashboard:** the subscription wizard and the editor list the new types in groups (Files, Pages); the class picker is disabled when only those are chosen.

## Steps

1. Migration 0065; the pure part (types, builders, validation) and `insertEvent` generalised; core unit and integration tests, including the loop guard on an asset subject.
2. Emission: `upsertAssetRecord`, `deleteAssetRecord`, `updateAssetMetadata`, folder deletion, the move; `updateWhoobePage`'s published flag; the callers pass the actor and the end-of-flow header.
3. API tests: a subscription to each type, a delivery per write in the log with the right envelope; the loop guard and `X-Whoobe-Flow: stop`; a class-pinned subscription gets none; refusal of the impossible subscription.
4. Dashboard and docs (the object events guide, the Node-RED page if it lists types, the API reference through the generator, audit unaffected), CHANGES.
