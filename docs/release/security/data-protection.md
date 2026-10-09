# Data protection (privacy) information

For data-protection officers, security officers and customers who have to fill in a record of processing, a DPIA or a
vendor questionnaire. It states **what personal data the product processes, where it is, which third parties can receive
it, how long it is kept and how it can be exported or deleted**. It is a technical description, not legal advice, and
Whoobe CMS is software you operate: **the operator is the controller** (or processor for its own customers); the
product has no telemetry and sends nothing to the project's authors.

## 1. Roles

| Party | Role |
|---|---|
| The organisation running a workspace | controller of its staff accounts and of what visitors submit through its sites |
| A hosting/cloud provider used by the operator (VM, managed PostgreSQL, S3) | processor of the operator |
| The project (Whoobe) | none: self-hosted software, no remote access, no call-home, no analytics |
| Third-party services the operator configures (AI, mail, push, CDN, upstream APIs) | processors/recipients chosen by the operator, see section 4 |

## 2. Personal data processed

| Category | Data subjects | Fields | Where | Purpose |
|---|---|---|---|---|
| Staff accounts | administrators, editors, viewers | name, e-mail, password hash (argon2id), role, active flag, MFA secret (encrypted) and hashed recovery codes | `users`, `user_roles` | access to the CMS |
| Sessions | staff | session id, IP address, user agent, created/last seen/expiry | `sessions` | authentication; **kept after expiry, never purged** (F-056) |
| Staff activity | staff | which user saved which page version, workflow transitions with the acting user | `content_versions`, `workflow_transition_log` | editing history, review workflow |
| **Form submissions** | visitors | whatever the author puts in the form: typically name, e-mail, phone, message, any other field; uploaded files | `data_objects` (draft rows of the target class), asset store | collecting enquiries, registrations |
| **Uploaded files** | visitors | the file, the original file name (as a note), size, type | asset store `private/…`, `form_uploads` | attachments to a submission |
| Outgoing mail | visitors, staff | recipient address, subject, full body, status, error | `mail_log` | delivery diagnostics, resend |
| Push subscriptions | site visitors who opt in | push endpoint, keys, user agent, website | `pwa_subscriptions` | web push notifications |
| Request metadata | everyone | client IP, URL, user agent | nginx access log (host), application logs (login failures name the user id; form/upload warnings carry ids) | operation, security |
| Password-reset requests | staff | e-mail, hashed token | `users` (token hash, expiry) | recovery |
| Content authored by staff | staff, third parties named in content | arbitrary | pages, snippets, objects, assets | the sites themselves |

Special categories (health, beliefs ...) are not collected by the product itself; an author can design a form that
collects them - that is the controller's decision and DPIA.

The services set **one cookie, the staff session cookie `wcms_session`** (strictly necessary); no cookie is set for visitors
(checked in the code of the services, the SDK adapters and the site generator). Published sites carry whatever the author adds
(embedded videos, scripts); the generated sites and the SDK add no tracking.

## 3. Where it goes and how it is protected

- Everything is stored in the operator's own PostgreSQL and S3 store; location = where the operator hosts them.
- In transit: HTTPS at the edge (TLS 1.2/1.3), optional TLS to PostgreSQL, HTTPS to S3 and providers.
- At rest: field-level encryption for credentials and MFA secrets; **personal data in content, submissions, mail logs and files is
  stored unencrypted** (needed for search and filtering) - use disk/volume or managed-database encryption
  ([encryption](../operations/encryption.md)); backups are encrypted by the backup script.
- Access: role-based, workspace-wide; private files need a session; form uploads are private by default; no public listing.
- Integrity and availability: see [backup](../operations/backup-restore-and-dr.md) and [threat model](threat-model.md).

## 4. Recipients and transfers outside the installation

| Feature | Receives | When | Notes |
|---|---|---|---|
| **Google Fonts** (`fonts.googleapis.com`) | the visitor's/editor's IP address and user agent | whenever a page, the dashboard, the editor or a generated site/mail that references fonts is loaded in a browser | used by the admin dashboard, the editor, `packages/publish` output and mail documents. For EU-strict deployments self-host the fonts or remove the font list (`VITE_FONT_FAMILIES`) and the theme fonts |
| Outgoing mail (SMTP, OneSignal or another HTTP provider) | recipient, subject, body of every mail sent | form notifications, password resets, templates | per website; the operator chooses the provider |
| AI providers (OpenAI-compatible, custom endpoints) | the prompt and the content sent for generation or translation | only when a staff user uses an AI function | keys are per user; disable the feature by not configuring a key (sandbox profile disables it) |
| Figma | file ids and tokens when importing designs | staff action | |
| Push providers (self-hosted VAPID or OneSignal) | subscription endpoints and notification text | when a site sends a push | |
| Gateway upstream APIs | the data an author binds or forwards (form fields, query values) | when a page with a binding or gateway form is used | defined by the author per endpoint |
| CDN mirror (optional, Cloudinary preset) | copies of selected assets | when mirroring is switched on | |
| YouTube / Vimeo embeds | the visitor's IP etc. | when the page with the embed loads | author's choice |

There is no analytics, error-reporting or licence-check service in the product.

## 5. Data subject rights - how to do them today

| Request | How | Gap |
|---|---|---|
| **Access / portability** (visitor) | query the submissions of the data class in the dashboard (Objects), export; files are assets in the private folder | no per-person search across classes, mail log and sessions; the operator searches by e-mail in each |
| **Rectification** | edit the data object | |
| **Erasure** (visitor) | delete the data object (and its uploaded asset in the DAM); delete matching rows of the mail log (Settings > Mail > Log, by filter); push subscription rows by database statement | the file uploaded through a form is **not deleted when its submission is deleted**: delete the asset separately; backups keep the data until they expire; logs keep addresses |
| **Erasure** (staff user) | delete or deactivate the user; sessions of the user can be removed by SQL | page versions and workflow log keep the user id |
| **Restriction / objection** | unpublish, or delete | |
| Retention | no automatic deletion anywhere: sessions, mail log, submissions, form-upload rows, rotated logs and content versions stay until the operator removes them ([data and storage](../architecture/data-and-storage.md) section 5) | the operator must define and run a retention routine; a data-subject export/erase tool is not provided |

## 6. Security measures (Art. 32 summary)

Pseudonymisation is not applied. Measures: access control with role permissions and MFA option; encryption in transit and
selective encryption at rest; private-by-default storage of uploaded files with content checks; rate limiting and
lockout; secure-by-default configuration and secrets generation; vulnerability management (static, dynamic and image
scans on every release, [supply chain](supply-chain.md)); backup with encryption; separation per workspace. Not
provided: audit log of administrative actions, SSO, DLP, malware scanning of uploads, automated retention.

## 7. Breach handling

The product does not detect or notify breaches. The operator should: preserve the logs, revoke sessions and rotate secrets
([secrets and keys](../operations/secrets-and-keys.md) section 6), identify affected tables from the list in section 2, and
use the 72-hour notification process of their organisation. Data exposed by a database or backup leak includes
**unhashed session ids (F-056)** and, on installations without `INTEGRATION_SECRETS_ENCRYPTION_KEY`, **clear-text AI/Figma/push credentials (F-055)** in addition to the personal data above.

## 8. Checklist for a DPIA / record of processing

1. List the forms of the site, the fields they collect and the target classes; decide retention for each.
2. Decide whether Google Fonts, embeds and the mail/AI providers are acceptable; document the transfer tools.
3. Switch on form uploads only where needed, keep the folder private, define who opens the files.
4. Configure disk or database encryption and the encrypted backup with offsite copy.
5. Define the retention job (sessions, mail log, submissions, uploads, logs) and the erase procedure.
6. Decide whether MFA is required for staff (it cannot be enforced by the product; do it by policy).
7. Keep this document and [`findings.md`](findings.md) with the DPIA: open items F-056 and F-058 are relevant.
