# Data and storage

What is stored, where, in which form, how the schema evolves and what is kept forever. Read together with
[encryption](../operations/encryption.md) (what is encrypted), [backup, restore and recovery](../operations/backup-restore-and-dr.md)
and [data protection](../security/data-protection.md).

## 1. Two stores

| Store | Holds | Access path |
|---|---|---|
| **PostgreSQL 16** | every record of the CMS: accounts, content, configuration, asset *records*, gateway definitions, logs of mail and workflow | core-api, asset-processor and gateway connect directly (same schema, same credentials); nothing else should |
| **S3-compatible object store** | the *bytes*: asset originals, generated thumbnails, form-upload staging copies, rotated application log files | asset-processor and core-api with the operator's S3 credentials; browsers get bytes only through `/dam-asset/*` on asset-processor, never an S3 URL |

There is no other persistent state. Containers are stateless apart from two volumes in the default compose file
(`pgdata`, `garagedata`) and the log directory (`LOG_DIR`, default `./logs`, inside the container unless mounted).

## 2. Database content by area

The schema is defined in `packages/core/src/db/*-schema.ts` and created by 53 SQL migrations in
`packages/core/drizzle/` (journal `meta/_journal.json`). 42 tables:

| Area | Tables |
|---|---|
| Accounts and access | `users`, `sessions`, `roles`, `permissions`, `role_permissions`, `user_roles` |
| Websites and pages | `websites`, `website_templates`, `website_paths` (the menus; renamed from `menus` in migration 0017), `whoobe_pages`, `whoobe_pages_staging`, `whoobe_one_templates`, `themes`, `content_versions` |
| Reusable authoring | `whoobe_one_snippets` (with a `locked` flag, and the block of the Generate Website Wizard it stands for, `wizard_block`, with its name `wizard_label`), `custom_fonts` (the woff2 files of the DAM registered as faces of a font family, one row per weight and style, shared by the websites of the workspace), `wizard_palettes` (the palettes of the wizard made by a person: name and eight colours), `whoobe_one_kits`, `cms_snippets`, `cms_documents`, `data_components` |
| Structured data | `data_classes`, `data_objects`, `data_object_preview_tokens`, `class_workflow_definitions`, `workflow_transition_log`, `search_documents` |
| Assets | `assets`, `folders` |
| Forms and mail | `form_uploads`, `mail_settings`, `mail_templates`, `mail_log`, `pwa_subscriptions` |
| Gateway | `gateway_endpoints`, `gateway_routes`, `gateway_schemas`, `gateway_bindings` |
| Settings and integrations | `ai_settings`, `ai_image_settings`, `ai_translate_settings`, `figma_settings`, `migration_sources`, `whoobe_ai_generated`, `ai_usage`, `ai_usage_monthly` |

Per-website settings (themes catalog, upload limits `settings.uploads`, documentation-site settings, domains) are JSON in
`websites.settings`.

### What is stored in clear and what is not

| Data | Form |
|---|---|
| Passwords | argon2id hash (`argon2`, library defaults) |
| Session identifier | random 32 bytes as hex in the cookie; `sessions.id` holds its SHA-256, so a database read or backup does not yield usable cookies (F-056) |
| Password-reset tokens | hashed |
| TOTP secrets | AES-256-GCM (`TOTP_ENCRYPTION_KEY`) |
| Gateway upstream credentials, migration source credentials | AES-256-GCM (`GATEWAY_AUTH_ENCRYPTION_KEY`, `MIGRATION_SOURCE_ENCRYPTION_KEY`) |
| SMTP password, mail-provider API keys | AES-256-GCM (`MAIL_SETTINGS_ENCRYPTION_KEY`) |
| Per-website gateway API keys | hashed with a pepper (`SITE_API_KEY_PEPPER`) |
| AI provider API keys (`ai_settings`, `ai_image_settings`, `ai_translate_settings`, one row per user), Figma access token (`figma_settings`), push-notification provider API key (OneSignal, inside the website's `pwa` configuration) | AES-256-GCM, `enc:v1:` (`INTEGRATION_SECRETS_ENCRYPTION_KEY`, F-055); **clear text on an installation that has not set the key**. The API never returns them (the push key used to be returned, F-059: records now carry only `onesignalApiKeySet`) |
| Everything else (content, e-mail addresses of users and of form submitters, IP and user agent of sessions, mail log bodies) | clear text in the database |

## 3. Object storage layout

Keys are the asset's path (`formatS3ObjectKey(pimcorePath, keyPrefix)`), optionally behind `S3_KEY_PREFIX`.

| Key prefix | Content | Visibility |
|---|---|---|
| anything under `public/` | public assets (built-in rule `/public/**`; more rules in the DAM settings) | readable without a session |
| other paths | assets recorded as not public | session required (`DAM_ENFORCE_ASSET_VISIBILITY`, on by default) |
| `private/…` | the system area, always session-only | session required |
| `private/logs/<app>/<yyyy-mm>/` | rotated application logs uploaded by the logger | session required; also readable by core-api with the service token |
| `private/_uploads/<websiteId>/<uploadId>.<ext>` | form uploads waiting for their form to be submitted; **no asset record**; deleted when attached or after 2 hours | session required |
| `private/<website upload folder>/<uuid>.<ext>` | form uploads after the form was submitted (default `private/forms`) | session required |
| `.thumbnails/…` | generated thumbnails | follows the original |

Bucket policy: when the store supports policies, the provider writes a public-read policy for `.thumbnails/*` and for the
folders of the public visibility rules; everything else is reachable only through the asset-processor proxy, which
enforces the visibility rules. With an external S3, check that the bucket itself is not public.

## 4. Schema evolution

- Migrations are **plain SQL files applied in journal order by core-api at start** (`bootstrap.ts`, drizzle `migrate`).
  Several migrations are hand-written because `drizzle-kit generate` cannot load every schema file.
- Policy in use (see the comments of the recent migrations): **expand only** — new tables, new nullable or defaulted
  columns, `IF NOT EXISTS`. A column that stops being used is left in place and dropped by a later migration once every
  environment has been through the backfill (example: the old plaintext `mail_settings.password`).
- Consequences: an old version of the code keeps working against a newer schema for one step (useful for a rollback of
  the application), but **a database restore is the only way back from a migration**.
- There is **no migration lock**: if two core-api processes start together against an empty or older database, both try
  to migrate. Start one instance first (the compose file does this: asset-processor and gateway wait for core-api to be
  healthy).
- Data backfills run at start and are idempotent (for example the encryption of old TOTP secrets and SMTP passwords).

## 5. Lifecycle and retention

| Data | Kept | Removed by |
|---|---|---|
| Sessions | 7 days from login (fixed, not extended by activity); revoked on logout and on password change or reset | expired and revoked rows are deleted a week later (core-api, at start and every six hours) |
| `mail_log` | forever unless a number is set in Security > Data Subject Requests (`mailLogRetentionDays`) | the retention job (daily), or an administrator from Settings > Mail > Log (by filter), or a data subject request |
| `workflow_transition_log`, `content_versions` | forever | with the object or page |
| Form submissions | as data objects (unpublished drafts) until deleted; **per class** `retentionDays` can be set | an editor; the retention job (daily); a data subject request. The files the visitor sent are deleted from the library with the object |
| Form-upload rows | `form_uploads` rows stay (status `attached`, `rejected`, `expired`) | the row of an attached file goes with its object (erasure, retention); the others have no purge |
| Form-upload staging bytes | until the form is submitted, at most about 2 hours | asset-processor timer every 30 minutes |
| Application log files | rotated daily or at 10 MB (`pino-roll`) | not removed; uploaded to the DAM log folder; no retention limit is enforced |
| Page and snippet history | `content_versions`, no purge job | not removed automatically |
| Deleted website | pages must be deleted first (F-044: deleting a website that has pages can answer 500) | |

Retention is the operator's decision: the jobs exist and are **off until a number is set** ([data subject requests](../operations/data-subject-requests.md)); see [data protection](../security/data-protection.md) for what each store holds.

## 6. Size drivers

Assets dominate (up to `ASSET_MAX_FILE_BYTES`, default 50 MB per file; `ASSET_MAX_COUNT` optional); the database stays
small by comparison (JSON page trees, a few kilobytes to a few hundred kilobytes per page). Rows that grow without bound
unless someone trims them: `mail_log`, `form_uploads`, `content_versions` (`sessions` is purged automatically).
