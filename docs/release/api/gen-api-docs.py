#!/usr/bin/env python3
"""Generates docs/release/api/api-reference.md's route tables AND docs/release/api/openapi.yaml
from one shared route table, so the two can't drift apart from each other.
Run: python3 gen-api-docs.py
"""
import re

# (method, path, summary) - grouped into named sections in file order.
# path uses :param (Express) - converted to {param} (OpenAPI) automatically.
CORE_API_SECTIONS = [
("Auth", [
  ("POST", "/auth/login", "Log in with email/password. Sets the session cookie, or returns `{ mfaRequired: true, mfaToken }` if 2FA is enabled, or `{ mfaEnrolmentRequired: true, enrolToken }` (no session) if the user's role requires 2FA and none is set up yet. With single sign-on set to \"administrators only\" it answers 403 to everybody else."),
  ("POST", "/auth/mfa/challenge", "Step 2 of a 2FA login: verify a TOTP code (or a recovery code) against a pending mfaToken and complete the session."),
  ("POST", "/auth/mfa/enrol/setup", "Forced enrolment, step 1: with the `enrolToken` of the login, returns a TOTP secret + QR code. Public (the token stands in for the session; ten minutes, five wrong codes spend it)."),
  ("POST", "/auth/mfa/enrol/verify", "Forced enrolment, step 2: a TOTP code with the `enrolToken` enables the factor, returns the recovery codes once and opens the session."),
  ("GET", "/auth/mfa/status", "Whether the current user has 2FA enabled."),
  ("POST", "/auth/mfa/setup", "Start 2FA enrollment; returns a TOTP secret + QR code."),
  ("POST", "/auth/mfa/verify-setup", "Confirm a TOTP code to finish enrollment; returns one-time recovery codes."),
  ("POST", "/auth/mfa/disable", "Disable 2FA (requires re-entering the password). `409` for a user whose role requires 2FA."),
  ("GET", "/auth/password-policy", "The minimum a new password must satisfy: `{ minLength, requireClasses }`. Public, no secret."),
  ("GET", "/auth/oidc/config", "Whether single sign-on is on and the button text: `{ enabled, label, localLogin }`. Public; nothing else about the provider."),
  ("GET", "/auth/oidc/login", "Starts the OpenID Connect sign-in: redirects to the provider (authorization code, PKCE S256, state, nonce) and sets a short `wcms_oidc` cookie. `404` when it is off."),
  ("GET", "/auth/oidc/callback", "The provider's redirect back. Checks the state and the browser's cookie, exchanges the code, verifies the ID token, opens the session and redirects to the dashboard, or to `/?sso_error=<code>`."),
  ("POST", "/auth/logout", "Revoke the current session and clear the cookie."),
  ("GET", "/auth/me", "Current user's id, email, display name, and effective permissions."),
  ("POST", "/auth/forgot-password", "Request a password-reset email."),
  ("POST", "/auth/reset-password", "Complete a password reset with the emailed token."),
  ("GET", "/auth/users", "List admin users."),
  ("POST", "/auth/users", "Create an admin user."),
  ("GET", "/auth/users/:id", "Get one admin user."),
  ("PATCH", "/auth/users/:id", "Update an admin user."),
  ("DELETE", "/auth/users/:id", "Delete an admin user."),
  ("POST", "/auth/users/:id/reset-password", "Force-reset another user's password (admin action)."),
  ("GET", "/auth/roles", "List roles."),
  ("POST", "/auth/roles", "Create a role (name + permission set)."),
  ("GET", "/auth/roles/:id", "Get one role."),
  ("PATCH", "/auth/roles/:id", "Update a role."),
  ("DELETE", "/auth/roles/:id", "Delete a role."),
  ("GET", "/auth/permissions", "List every permission key the system recognizes."),
]),
("Documents & Snippets (legacy Pimcore-migrated content)", [
  ("GET", "/documents", "List documents migrated from Pimcore."),
  ("GET", "/documents/:id", "Get one document."),
  ("PATCH", "/documents/:id", "Update a document's content."),
  ("GET", "/snippets", "List reusable content snippets (Whoobe Studio format - distinct from Whoobe One snippets below)."),
  ("POST", "/snippets", "Create a snippet."),
  ("DELETE", "/snippets/:id", "Delete a snippet."),
]),
("Whoobe One: Snippets", [
  ("GET", "/whoobe-one/snippets", "List reusable block snippets (whoobe-one-spike editor format). Besides `snippets` the answer has `templateUsage`: snippet id to the website templates (website, template, slots) that place it."),
  ("POST", "/whoobe-one/snippets", "Create a snippet."),
  ("GET", "/whoobe-one/snippets/:id", "Get one snippet."),
  ("GET", "/whoobe-one/snippets/:id/versions", "List the snippet's instant version history (up to the 10 most recent prior states)."),
  ("GET", "/whoobe-one/snippets/:id/versions/:versionId", "Get one historical version's full node content."),
  ("POST", "/whoobe-one/snippets/:id/render", "Render a snippet's node tree to standalone email HTML."),
  ("PATCH", "/whoobe-one/snippets/:id", "Update a snippet in place. Snapshots the pre-update node into version history if it changed."),
  ("DELETE", "/whoobe-one/snippets/:id", "Delete a snippet."),
  ("PUT", "/whoobe-one/snippets/:id/thumbnail", "Set (or clear with `null`) the snippet thumbnail: an image data URL under 400k characters."),
  ("PUT", "/whoobe-one/snippets/:id/lock", "Lock or unlock a snippet (`{ locked }`). A locked snippet is not saved automatically: the editor's autosave skips it and `PATCH /whoobe-one/snippets/:id` with `autosave: true` answers 423. Manual saves are unaffected."),
  ("PUT", "/whoobe-one/snippets/:id/wizard-block", "Set the block of the Generate Website Wizard that a snippet stands for (`{ block, label? }`: `hero`, `banner`, `cta`, `box-grid-3`, `box-grid-6`, `form`, `custom` (a block of its own, `label` required) or `null`; `label` is the name the wizard lists it under, up to 60 characters). The wizard then lists the snippet with its blocks whatever its category."),
]),
("Whoobe One: Templates & Kits", [
  ("GET", "/whoobe-one/templates", "List whole-page templates."),
  ("GET", "/whoobe-one/templates/:id", "Get one template."),
  ("POST", "/whoobe-one/templates", "Create a template (unique path)."),
  ("PATCH", "/whoobe-one/templates/:id", "Update a template."),
  ("DELETE", "/whoobe-one/templates/:id", "Delete a template."),
  ("GET", "/whoobe-one/kits", "List named template collections (\"kits\")."),
  ("GET", "/whoobe-one/kits/:id", "Get one kit."),
  ("POST", "/whoobe-one/kits", "Create a kit."),
  ("POST", "/whoobe-one/kits/:id/templates", "Append a template to an existing kit."),
  ("PATCH", "/whoobe-one/kits/:id", "Rename a kit or change its description or category. `409` for a kit that ships with the distribution (read-only: duplicate it, then edit the copy)."),
  ("POST", "/whoobe-one/kits/:id/duplicate", "Make an editable copy of a kit (also of one that ships with the distribution). `201` with the new kit."),
  ("PUT", "/whoobe-one/kits/:id/templates/:templateId", "Change a template of a kit: name, category, description or its document. `409` for a read-only kit; `404` when the template is not in this kit."),
  ("DELETE", "/whoobe-one/kits/:id/templates/:templateId", "Remove a template from a kit. `409` for a read-only kit."),
  ("DELETE", "/whoobe-one/kits/:id", "Delete a kit."),
]),
("Whoobe One: Pages", [
  ("GET", "/whoobe-one/editor-base", "Address other people reach the editor at (from ADMIN_PUBLIC_URL or WHOOBE_HOSTNAME), or null when it is localhost."),
  ("GET", "/whoobe-one/pages", "List real site pages, optionally filtered by websiteId."),
  ("GET", "/whoobe-one/pages/staged", "List Pimcore-migration staged pages awaiting review/promotion."),
  ("GET", "/whoobe-one/pages/staged/:id", "Get one staged page."),
  ("POST", "/whoobe-one/pages/staged/promote", "Promote all staged pages into the real pages table."),
  ("POST", "/whoobe-one/pages/staged/:id/promote", "Promote one staged page."),
  ("DELETE", "/whoobe-one/pages/staged/:id", "Discard one staged page without promoting it."),
  ("PUT", "/whoobe-one/pages/:id/thumbnail", "Set (or clear with `null`) the page thumbnail: an image data URL (webp/png/jpeg) under 400k characters. Used by the editor preview's \"Capture thumbnail\" (desktop crop, or the Mobile/Tablet device screen)."),
  ("GET", "/whoobe-one/pages/:id", "Get one page."),
  ("GET", "/whoobe-one/pages/:id/versions", "List the page's instant version history (up to the 10 most recent prior states of its content)."),
  ("GET", "/whoobe-one/pages/:id/versions/:versionId", "Get one historical version's full content tree."),
  ("GET", "/whoobe-one/pages/:id/layout", "Resolved website-template body slot (className/style) for this page's editor canvas."),
  ("POST", "/whoobe-one/pages/:id/render", "Render a page's node tree to standalone email HTML."),
  ("GET", "/whoobe-one/pages/:id/translations", "All locale variants of the same logical page."),
  ("POST", "/whoobe-one/pages/:id/translate", "AI-translate a page into a new locale, creating a draft in the same translation group."),
  ("POST", "/whoobe-one/pages", "Create a page. Validates/binds any Gateway content bindings before saving."),
  ("PATCH", "/whoobe-one/pages/:id", "Update a page. Snapshots the pre-update content into version history if it changed."),
  ("DELETE", "/whoobe-one/pages/:id", "Delete a page."),
]),
("Whoobe One: Websites, Settings, PWA", [
  ("GET", "/whoobe-one/websites", "List websites (domain + locale config a page tree belongs to)."),
  ("POST", "/whoobe-one/websites", "Create a website."),
  ("POST", "/whoobe-one/websites/:id/gateway-api-key/regenerate", "Generate (or replace) this website's Gateway site API key. Plaintext is returned once, only a salted hash is stored."),
  ("DELETE", "/whoobe-one/websites/:id/gateway-api-key", "Clear this website's Gateway site API key."),
  ("GET", "/whoobe-one/settings/default-placeholder-image", "Get the org-wide default placeholder image used when an image element has no source."),
  ("PUT", "/whoobe-one/settings/default-placeholder-image", "Set the default placeholder image."),
  ("GET", "/whoobe-one/settings/strip-html-comments", "Get whether HTML comments are stripped from rendered output."),
  ("PUT", "/whoobe-one/settings/strip-html-comments", "Set the strip-HTML-comments setting."),
  ("GET", "/whoobe-one/settings/logging", "Get editor logging verbosity settings."),
  ("PUT", "/whoobe-one/settings/logging", "Set editor logging verbosity."),
  ("GET", "/whoobe-one/settings/autosave", "Get the org-wide default autosave enabled/interval settings."),
  ("PUT", "/whoobe-one/settings/autosave", "Set the org-wide default autosave settings."),
  ("GET", "/whoobe-one/settings/alpine-presets", "Get the catalog of Alpine presets: named sets of Alpine.js directives applied from the editor's Advanced > AlpineJS panel (`{ presets: [{ name, description, directives }] }`)."),
  ("PUT", "/whoobe-one/settings/alpine-presets", "Replace the whole Alpine presets catalog (`{ presets }`); 400 with the reason when a name, a directive (`x-...`, `@event`, `:attr`) or a size limit is invalid, nothing is stored then."),
  ("GET", "/whoobe-one/settings/cdn-providers", "The CDN providers (Cloudinary, Cloudflare Images) and the fields of their settings; no secret."),
  ("GET", "/whoobe-one/settings/cdn-mirror", "The CDN-mirroring settings that apply to a website (`?websiteId=`: its own, else the installation's default; without it, the default): `{ scope, provider, config, secretsSet, missing, configured, own }`. A credential is never returned, only whether it is set; `gatewayRouteId` / `uploadPreset` are the Cloudinary values the sync script reads."),
  ("PUT", "/whoobe-one/settings/cdn-mirror", "Set the CDN settings of a website (`websiteId`) or the default: `{ websiteId?, provider, config, secrets }`; a secret that is not sent keeps the stored one. Needs `settings:manage`. The old body (`gatewayRouteId`, `uploadPreset`) means Cloudinary for the default. Audited as `setting.cdn_mirror_update`."),
  ("DELETE", "/whoobe-one/settings/cdn-mirror", "Remove a website's own CDN settings (`?websiteId=`: it uses the default again); without a website, the default goes. Needs `settings:manage`."),
  ("POST", "/whoobe-one/settings/cdn-mirror/test", "Check the settings that apply (`{ websiteId? }`): Cloudflare Images with a read call, Cloudinary that its Gateway route exists. Uploads nothing."),
  ("GET", "/whoobe-one/websites/:id", "Get one website."),
  ("PATCH", "/whoobe-one/websites/:id", "Update a website."),
  ("DELETE", "/whoobe-one/websites/:id", "Delete a website."),
  ("GET", "/whoobe-one/websites/:id/upload-settings", "The file-upload limits of a website's forms (`settings.uploads`: enabled, allowed file types, size, count, daily bytes, target folder), normalized, with the ceilings and the file types that can be allowed."),
  ("PUT", "/whoobe-one/websites/:id/upload-settings", "Save them. Only file types whose content can be checked are accepted (never html, svg, scripts, programs); numbers are held within the ceilings; the target folder is private unless a public one is explicitly allowed."),
  ("GET", "/whoobe-one/websites/:id/themes", "List themes available to this website (its settings.themes catalog)."),
  ("POST", "/whoobe-one/websites/:id/themes", "Add a theme to this website's catalog."),
  ("PUT", "/whoobe-one/websites/:id/themes/:themeId", "Update one of this website's catalog themes."),
  ("DELETE", "/whoobe-one/websites/:id/themes/:themeId", "Remove a theme from this website's catalog."),
  ("GET", "/whoobe-one/themes/all", "List every website's themes in one call, for snippet/global editors with no single website context."),
  ("GET", "/whoobe-one/websites/:id/theme", "Get this website's currently active default theme."),
  ("PUT", "/whoobe-one/websites/:id/theme", "Set this website's active default theme."),
  ("POST", "/whoobe-one/websites/:id/generate-pwa", "Generate/update this website's installable PWA manifest + service worker config."),
]),
("Themes (global catalog)", [
  ("GET", "/whoobe-one/themes", "List all globally-defined themes (name, colors, fonts, custom styles/Tailwind classes)."),
  ("POST", "/whoobe-one/themes", "Create a theme."),
  ("GET", "/whoobe-one/themes/:id", "Get one theme."),
  ("PUT", "/whoobe-one/themes/:id", "Update a theme."),
  ("DELETE", "/whoobe-one/themes/:id", "Delete a theme."),
]),
("Website Templates (header/aside/main/footer/404 composition)", [
  ("GET", "/whoobe-one/websites/:websiteId/templates", "List a website's layout templates."),
  ("POST", "/whoobe-one/websites/:websiteId/templates", "Create a layout template."),
  ("GET", "/whoobe-one/websites/:websiteId/templates/:id", "Get one layout template."),
  ("PATCH", "/whoobe-one/websites/:websiteId/templates/:id", "Update a layout template."),
  ("DELETE", "/whoobe-one/websites/:websiteId/templates/:id", "Delete a layout template."),
]),
("Website Paths (menu/navigation tree)", [
  ("GET", "/whoobe-one/website-paths", "List a website's menu/navigation entries."),
  ("POST", "/whoobe-one/website-paths", "Create a menu entry."),
  ("GET", "/whoobe-one/website-paths/:id", "Get one menu entry."),
  ("PATCH", "/whoobe-one/website-paths/:id", "Update a menu entry."),
  ("DELETE", "/whoobe-one/website-paths/:id", "Delete a menu entry."),
]),
("Public site endpoints (no auth)", [
  ("GET", "/public/pages/:locale/*", "Fetch a published page by locale + full path (static slug or dynamic pattern match), for SSR/rendering."),
  ("GET", "/public/page/*", "SEO-friendly page lookup with no locale in the URL - detects the website's rootPath from the first path segment."),
  ("GET", "/public/404/:websiteId", "Fetch a website's configured 404 page content."),
  ("GET", "/public/sitemap.xml", "Generated sitemap of all published, sitemap-included pages."),
  ("GET", "/public/robots.txt", "Generated robots.txt pointing at the sitemap."),
  ("GET", "/public/websites", "List websites (id + name only)."),
  ("GET", "/public/websites/:id", "Get one website's public config (domains, locales, PWA config; secrets redacted)."),
  ("GET", "/public/pages", "List a website's published pages (id/slug/title only), for static-export route generation."),
  ("GET", "/public/snippets/:id", "Get one Whoobe One snippet's node tree (public, for embedding on a published site)."),
  ("GET", "/public/assets/:uuid", "Resolve a DAM asset's public URL by its stable uuid reference."),
  ("GET", "/public/dam/assets/mirror-status", "Whether CDN-mirrored copies exist for a batch of asset paths (`?provider=` counts only a mirror at that provider)."),
  ("GET", "/public/apps/:websiteId", "List a website's `kind: app` pages, for the Capacitor mobile-app generator."),
  ("GET", "/public/search", "Full-text search (tsvector + pg_trgm) across published pages/objects/classes/assets."),
]),
("PWA push", [
  ("POST", "/pwa/subscribe", "Register a browser's push subscription for a website."),
  ("POST", "/pwa/send", "Send a push notification to a website's subscribers."),
]),
("Data Classes (PIM/MDM class definitions)", [
  ("GET", "/data-classes", "List all classes."),
  ("GET", "/data-classes/:id", "Get one class."),
  ("POST", "/data-classes", "Create a class (name, label, fields, optional view config)."),
  ("PATCH", "/data-classes/:id", "Update a class. Renaming/retyping a field is blocked once objects of that class exist."),
  ("DELETE", "/data-classes/:id", "Delete a class. Blocked while any object of that class still exists."),
  ("GET", "/data-classes/:id/object-count", "How many objects the class has (used before emptying it)."),
  ("POST", "/data-classes/:id/empty", "Delete every object of the class, keeping the class. The body must carry `confirm` equal to the class name; the action is logged and returns the number deleted."),
  ("GET", "/data-classes/:id/workflow", "Get the class's publishing workflow definition, if any."),
  ("PUT", "/data-classes/:id/workflow", "Create/replace the class's workflow (places + transitions)."),
  ("DELETE", "/data-classes/:id/workflow", "Remove the class's workflow."),
]),
("Data Components (reusable field-collection sub-schemas)", [
  ("GET", "/data-components", "List all component types."),
  ("GET", "/data-components/:id", "Get one component type."),
  ("GET", "/data-components/:id/usage", "Whether any existing object references this component."),
  ("POST", "/data-components", "Create a component type."),
  ("PATCH", "/data-components/:id", "Update a component type. Renaming/retyping a field is blocked while it's in use."),
  ("DELETE", "/data-components/:id", "Delete a component type. Blocked while it's in use."),
]),
("Migration Sources & Pimcore import", [
  ("GET", "/migration-sources", "List configured migration sources (passwords never included)."),
  ("POST", "/migration-sources", "Save a new source (DB connection + var/classes path)."),
  ("PATCH", "/migration-sources/:id", "Update a source."),
  ("DELETE", "/migration-sources/:id", "Delete a source."),
  ("POST", "/migration-sources/:id/import-classes", "Import Pimcore class definitions into data-classes."),
  ("POST", "/migration-sources/:id/preview-classes", "Read the class definition files of the source and return the proposed fields of each class, without creating anything (the dashboard lets the user choose and map fields before importing)."),
  ("POST", "/migration-sources/:id/import-objects", "Import one class's real object instances from the source MySQL DB."),
  ("GET", "/migration-sources/import-jobs/:jobId", "State of a background object import started with `background: true` (progress, counts, failed records)."),
  ("POST", "/migration-sources/:id/extract-components", "Extract embedded collection types of the imported classes into standalone data components (no access to the Pimcore DB needed)."),
  ("POST", "/migration-sources/:id/import-documents", "Convert the source's Pimcore documents into pages. With `staging: true` they land in the staging table for review instead of the live pages."),
  ("POST", "/migration-sources/:id/promote-documents", "Copy the staged documents of this source into the live pages table."),
]),
("Data Objects (PIM/MDM instances)", [
  ("GET", "/data-objects", "List objects, optionally filtered by classId."),
  ("GET", "/data-objects/:id", "Get one object."),
  ("POST", "/data-objects", "Create an object."),
  ("POST", "/data-objects/bulk", "Create (or, with `onConflict: update`, update) up to 500 objects of one class in one call, as drafts; rows that break a rule (required, unique) are returned in `rejected` and do not stop the others."),
  ("PATCH", "/data-objects/:id", "Update an object."),
  ("DELETE", "/data-objects/:id", "Delete an object."),
  ("GET", "/data-objects/batch", "Fetch several objects by id (admin: drafts included)."),
  ("POST", "/data-objects/batch", "Batch action on `ids[]`: `publish`, `unpublish`, `delete` or `resolve-assets`."),
  ("POST", "/data-objects/query", "Query objects by class name + filters (admin: no published filter)."),
  ("GET", "/data-objects/:id/translations", "Every locale variant of the same logical object."),
  ("GET", "/data-objects/translations/:translationGroupId", "Locale variants by translation group id."),
  ("POST", "/data-objects/:id/preview-link", "Create a shareable preview link for an object (may be a draft); body `{ expiresInDays? }`. Requires `objects:publish`."),
  ("GET", "/data-objects/:id/preview-links", "List the object's preview links (with view counts)."),
  ("DELETE", "/data-objects/preview-links/:token", "Revoke a preview link; `?permanent=true` removes a revoked or expired one for good. Requires `objects:publish`."),
  ("GET", "/data-objects/:id/transitions", "Workflow transitions available for the object in its class's workflow."),
  ("POST", "/data-objects/:id/transition", "Run a workflow transition; each transition declares the permissions it needs."),
]),
("Public Data Objects & Forms (no auth, published only)", [
  ("GET", "/public/data-objects", "List published objects of a class by name."),
  ("GET", "/public/data-objects/batch", "Fetch multiple published objects by id."),
  ("POST", "/public/data-objects/query", "Query published objects by class name + filters."),
  ("GET", "/public/data-objects/:id", "Get one published object (404 if it's a draft - never leaks draft existence)."),
  ("POST", "/public/uploads/intent", "Public. Approve one file for a form Upload field: `{ fieldId, filename, size }` is checked against the website's upload limits (type, size, daily quota) and the field's own; answers `{ uploadId, uploadUrl, expiresIn, maxBytes }`. The bytes go to `uploadUrl` (asset service, `PUT /public/upload-data/<ticket>`), then the form submission refers to the upload as `{ uploadId }`. 503 when `UPLOAD_TOKEN_SECRET` is not set."),
  ("POST", "/public/forms/:classId/submit", "Submit a public form, creating an unpublished Data Object of the given class. A `notify` block in the body only sends mail if it is the one an author saved in a form of a page for that class (F-053); recipients must be one plain address, 3 mails an hour per address."),
  ("GET", "/preview/objects/:token", "Resolve a preview-link token to its (possibly unpublished) object."),
]),
("Object events: subscriptions and delivery log (permission `object_events:manage`)", [
  ("GET", "/object-event-subscriptions", "List the subscriptions that send object events to a service."),
  ("POST", "/object-event-subscriptions", "Create one: `{ name, events[], endpointId, routeId, classId?, enabled?, ignoreActors?, signingSecretRef? }`. The route must be POST, PUT or PATCH with a fixed path; `signingSecretRef` is an environment variable name starting `OBJECT_EVENTS_SECRET_`."),
  ("GET", "/object-event-subscriptions/:id", "Get one subscription."),
  ("PATCH", "/object-event-subscriptions/:id", "Change some of its fields."),
  ("DELETE", "/object-event-subscriptions/:id", "Delete it and its delivery log."),
  ("POST", "/object-event-subscriptions/:id/test", "Queue a synthetic `object.updated` marked `\"test\": true` for this subscription only (202)."),
  ("GET", "/object-event-subscriptions/:id/deliveries", "The delivery log, newest first (`?status=pending`, `delivered`, `retrying`, `dead` or `stopped`, `?type=object.updated` and so on, and `limit` up to 200): status, attempts, next try, last problem. Never the event content or the service's answer."),
  ("DELETE", "/object-event-subscriptions/:id/deliveries", "Clear finished deliveries from the log: body `{ ids: [...] }` (up to 500) or `{ status: 'delivered' | 'dead' | 'stopped' }`; returns `{ removed }`. A delivery still pending or retrying is never removed; the events and the loop guard counts are not touched."),
  ("POST", "/object-event-deliveries/:id/retry", "Retry a delivery that gave up (`dead`); 409 for any other status."),
]),
("Audit log of administrative actions (permission `audit:read`, read only)", [
  ("GET", "/audit-log", "The audit log, newest first: who (user, address), what (`action`), on which target, and the fields before and after (never a secret). Filters: `action` (exact, or a prefix ending in `.`, such as `user.`), `actor` (user id), `targetType`, `targetId`, `from`, `to` (ISO dates), `limit` (default 100, at most 5000), `offset`. Returns `{ entries, total }`; `?format=csv` returns the same rows as a file. There is no route that writes or deletes a row."),
]),
("Security settings and single sign-on (permission `settings:manage`)", [
  ("GET", "/security-settings", "`{ requireMfaRoleIds, passwordPolicy: { minLength, requireClasses }, mailLogRetentionDays, updatedAt, roles }`; `roles` lists every role for a picker. Defaults when never saved: no role required, length 8, no classes rule, the mail log kept."),
  ("PUT", "/security-settings", "Change any of `requireMfaRoleIds` (role ids that must use 2FA), `passwordMinLength` (8 to 128), `passwordRequireClasses`, `mailLogRetentionDays` (1 to 36500 or `null`); only the keys sent change. Audited as `setting.security_update`."),
  ("GET", "/oidc-settings", "The single sign-on provider settings (issuer, client id, redirect and dashboard addresses, scopes, role claim and mapping, default roles, provisioning, linking, `localLogin`), `hasClientSecret` (the secret is never returned) and `roles` for the pickers. See docs/release/operations/single-sign-on.md."),
  ("PUT", "/oidc-settings", "Change any of them; only the keys sent change; a blank `clientSecret` keeps the stored one, `clearClientSecret: true` removes it. Switching on needs issuer, client id and redirect address. Audited as `setting.oidc_update`."),
  ("POST", "/oidc-settings/test", "Reads the saved issuer's discovery document: `{ ok: true, authorizationEndpoint, tokenEndpoint }` or `{ ok: false, error }`."),
]),
("Data subject requests and retention (permission `data_subject:manage`; see docs/release/operations/data-subject-requests.md)", [
  ("POST", "/data-subject/search", "`{ identifier, classIds?, includeMailBodies? }`: what exists for one person (the identifier is matched whole and in any case): objects (class, key, date, the fields that hold it), files, mails and the staff accounts of the address. No values."),
  ("POST", "/data-subject/export", "The same selection with the records, as one JSON file (`Content-Disposition: attachment`, named after a fingerprint of the identifier); files are listed with their library path."),
  ("POST", "/data-subject/erase", "A **dry run** unless `dryRun: false`; a real run needs `confirm` equal to `identifier`. Deletes the files first, then the objects and the mails (`include: { objects, mail }` narrows it); answers the counts and `failures` (an object whose file could not be deleted stays). Staff accounts are never deleted."),
  ("POST", "/data-subject/retention/run", "Runs the retention job now: `{ classes: [{ classId, className, days, deleted, failed }], mailDeleted }`. The same job runs daily; `PATCH /data-classes/:id` with `retentionDays` (needs this permission) sets the days per class."),
]),
("Documentation sites (Markdown)", [
  ("GET", "/docs-sites/:websiteId/tree", "A documentation website (settings `kind: docs`, source DAM folder): its documents with titles, addresses and visibility, the index (automatic from the tree of files, or `_nav.yml`), the other files and the warnings (broken links, entries pointing nowhere)."),
  ("GET", "/docs-sites/:websiteId/preview/*", "A rendered page of a documentation website by its address (empty = home), private documents included: `{ site, nav, page }` with the HTML, the headings, breadcrumbs, previous/next and the warnings."),
  ("POST", "/docs-sites/:websiteId/render", "Live preview: renders Markdown that is not saved yet (`{ path, markdown }`) as it would be at that path, with the folder's real links and files; returns `{ title, html, headings, warnings }`."),
  ("POST", "/docs-sites/:websiteId/nav/check", "Checks the text of the index file (`{ text }`) without saving it: `{ ok, errors, warnings, nav }`."),
  ("GET", "/docs-sites/:websiteId/search-index", "The search index of a documentation website (a serialised MiniSearch, searched in the browser), private documents included. ETag-cached."),
  ("GET", "/public/docs/:websiteId/search-index", "The search index of the PUBLIC documents of a documentation website. ETag-cached; the same file the static site ships."),
  ("GET", "/public/docs-site/:segment", "Which documentation website answers at a root path segment (`{ websiteId, rootPath, title }`, 404 if none)."),
  ("GET", "/public/docs/:websiteId/nav", "Index of the PUBLIC documents of a documentation website."),
  ("GET", "/public/docs/:websiteId/page/*", "A rendered public document by its address (empty = home): `{ site, page }`. A document that is private in the DAM answers 404."),
]),
("Mail: settings, log, templates", [
  ("GET", "/mail-settings", "Get a mail configuration: the default, or with `?websiteId=` that website's own, plus what a message of that scope is sent with. Passwords and API keys are never returned (only whether they are set)."),
  ("GET", "/mail-providers", "List the installed HTTP mail providers (OneSignal ...): their id, label and config fields. Providers are JSON files (`packages/core/mail-providers`, `MAIL_PROVIDERS_PATH`), read again when one changes."),
  ("PUT", "/mail-settings", "Save a mail configuration for the default (no `websiteId`) or for one website: `provider` is `smtp` (with `smtp: {host, port, secure, user, password}`) or a provider id (with `providerConfig`). Secrets are encrypted at rest; a blank secret keeps the stored one. Needs `MAIL_SETTINGS_ENCRYPTION_KEY` on the server."),
  ("DELETE", "/mail-settings", "Remove a website's own mail configuration (`?websiteId=`), so its mail goes out with the default again. The default cannot be removed."),
  ("POST", "/mail-settings/test", "Send a test email with the configuration of the default or, with `websiteId`, of that website."),
  ("GET", "/mail-log", "List sent-mail log entries."),
  ("POST", "/mail-log/delete", "Bulk-delete mail log entries."),
  ("GET", "/mail-log/:id", "Get one mail log entry (including the rendered body)."),
  ("POST", "/mail-log/:id/resend", "Re-send a previously logged email."),
  ("GET", "/mail-templates", "List HTML/text mail templates."),
  ("POST", "/mail-templates", "Create a mail template."),
  ("GET", "/mail-templates/:id", "Get one mail template."),
  ("PATCH", "/mail-templates/:id", "Update a mail template."),
  ("DELETE", "/mail-templates/:id", "Delete a mail template."),
  ("POST", "/mail-templates/:id/render", "Render a mail template to HTML, substituting sample/live data."),
]),
("AI: text, images, translation, whole-website generation", [
  ("GET", "/ai/settings", "Get the configured AI text-generation provider/model/key."),
  ("PUT", "/ai/settings", "Update AI text-generation settings."),
  ("POST", "/ai/generate", "Generate text for an editor field (heading, paragraph, etc.) from a prompt."),
  ("GET", "/ai/generated", "List past AI-generation results."),
  ("GET", "/ai/usage", "Token usage of the AI functions per user in a period (`from`, `to` as YYYY-MM-DD, both included, default the last 30 days, at most 366): totals overall and by user, function, model and day; with `userId`, that person's requests one by one (at most 1000, newest first), and the reading is written to the audit log as `ai_usage.read_user`. Counts only, never prompts or answers. Rows exist only while the tracking is on (Settings > Security). Needs `ai_usage:read` (administrators)."),
  ("GET", "/ai/usage/monthly", "Monthly token totals per user, function and model (`from`, `to` as YYYY-MM, default the last 12 months, optional `userId`); kept after the detail rows are deleted. Needs `ai_usage:read`."),
  ("GET", "/ai/usage/me", "The token usage recorded about the signed-in person: the same report as `/ai/usage` for their own rows (`from`, `to`) and their monthly totals of the last 12 months. Any signed-in user."),
  ("POST", "/ai/generate-wizard-texts", "Write the texts of the Generate Website Wizard with the configured AI (`{ answers, description? }`). The model gets the name, sector, context, description and the list of slots of the structure, and its reply is read slot by slot: only texts of real slots come back, cleaned and cut to their length (`{ texts, used, dropped, slots }`). Creates nothing. Needs `objects:write` and an AI provider (Settings > AI); refused in the sandbox; rate limited like the other AI calls."),
  ("POST", "/ai/generate-website-structure", "Generate a full website's page/section structure from a text brief."),
  ("POST", "/whoobe-one/websites/from-ai", "Create a real website + pages from a previously generated AI structure."),
  ("GET", "/whoobe-one/site-wizard/options", "What the template wizard offers: the limits, the sectors (each with the structure it proposes), the blocks with their descriptions, the colour themes with their palettes, the palettes made by a person (with the colours that are hard to read), the fonts, the source of the texts, and the snippets of the library that could stand for a block (name, category and block; never their content). Needs `websites:create` or `objects:write`; calls nothing outside."),
  ("POST", "/whoobe-one/site-wizard/palettes", "Create a palette of the wizard (`{ name, colors }`: bg, bgAlt, card, text, muted, border, accent, onAccent as #RRGGBB). Saved even if some colours are hard to read; `warnings` lists them. 409 for a name in use."),
  ("PUT", "/whoobe-one/site-wizard/palettes/:id", "Change a palette of the wizard (same body). 404 for an unknown id, 409 for a name in use."),
  ("DELETE", "/whoobe-one/site-wizard/palettes/:id", "Delete a palette of the wizard. Websites already made from it are not affected."),
  ("POST", "/whoobe-one/websites/from-wizard", "Create a website from the answers of the template wizard (name, language, sector, market context, theme or company colour, accent, font, up to four pages each with its blocks, header button). Body `{ answers, choices?, website? }`, with `choices` and `website` as for `from-spec`. The answers become a site specification of fixed block templates (no model is called) that goes through the same check and import: `?dryRun=1` writes nothing and returns the conflicts, a summary, the importer's report and `notes` (what was adjusted to keep the colours readable). Pages are created as drafts; a form block is created **not connected** (no target, no recipient). `400` with `issues` when the answers are not valid, `409` when the root path is taken, `413` above 200 KB."),
  ("GET", "/whoobe-one/site-spec/material", "The material for writing a site specification with any language model: the instructions (Markdown), the JSON Schema, the limits and the examples. Needs `websites:create` or `objects:write`; calls nothing outside."),
  ("POST", "/whoobe-one/websites/from-spec", "Create a website from a site specification (one JSON file: theme, snippets, header/footer, pages in one or two languages). Body `{ spec, choices?, website? }`: `choices` (`themes`/`snippets`, name -> `existing` or `new`) decides what happens to a theme or snippet name that already exists here (default `new`, under a free name; an existing one is never changed), `website` (`name`, `rootPath`) changes the name or root path before the check. `?dryRun=1` writes nothing and returns the conflicts, a summary and the importer's report. Pages are created as drafts. `400` with `issues` (each with `path`, `where` in words and `message`) when the file is not valid or the root path is reserved; `409` when the root path is taken; `413` above 4 MB."),
  ("GET", "/whoobe-one/websites/:id/export", "Export a website as a version 2 bundle (JSON manifest): pages, templates, menus, themes and everything they refer to - snippets, module pages, data classes/components/objects, asset records. `?dataObjects=referenced` leaves out the objects a data binding would list. The asset files are fetched by the client (admin dashboard zips them)."),
  ("POST", "/whoobe-one/websites/import", "Import a version 1 or 2 bundle as a new website. `?dryRun=1` writes nothing and returns the report with the asset plan; `assetMap` in the body maps old asset ids to the records the client stored. Classes and objects that exist are reused, ids are rewritten, a failure removes what was created."),
  ("GET", "/ai/image-settings", "Get the configured AI image-generation provider/model/key."),
  ("PUT", "/ai/image-settings", "Update AI image-generation settings."),
  ("GET", "/ai/translate-settings", "Get the configured AI translation provider/model/key."),
  ("PUT", "/ai/translate-settings", "Update AI translation settings."),
  ("POST", "/ai/generate-image", "Generate an image from a text prompt, uploading the result to the DAM."),
]),
("Figma import", [
  ("GET", "/figma/settings", "Get the configured Figma personal access token (masked)."),
  ("PUT", "/figma/settings", "Update the Figma access token."),
  ("POST", "/figma/import", "Import a Figma file/frame, converting it into a page's node tree."),
]),
("Custom fonts", [
  ("GET", "/fonts", "List the custom fonts (woff2 files of the DAM) shared by the websites of the workspace: family, weight, style, the asset, and its address when the file is still public."),
  ("GET", "/public/fonts", "The custom fonts a published site needs (public woff2 files only), without a session: family, weight, style and the address of the file."),
  ("POST", "/fonts", "Register a woff2 file of the DAM (public folder) as a face of a font family."),
  ("DELETE", "/fonts/:id", "Remove a custom font face (the file stays in the DAM)."),
]),
("Search (admin)", [
  ("GET", "/whoobe-one/search", "Admin search over the same index as `/public/search`, but session-gated and including drafts and non-indexable pages."),
  ("POST", "/whoobe-one/search/reindex", "Rebuild the whole search index from the source tables (heals drift; indexing hooks are best-effort)."),
]),
("System", [
  ("GET", "/api/v1/system/logs", "Tail recent application log lines."),
  ("GET", "/api/v1/system/logs/download", "Download the full current log file."),
  ("GET", "/health", "Readiness: `200` with `database: \"ok\"`, or `503` with `database: \"down\"` when the database does not answer within 2 seconds."),
  ("GET", "/health/live", "Liveness: the process is up, nothing else is asked (the Docker health check)."),
  ("GET", "/metrics", "Prometheus metrics. `404` unless `METRICS_TOKEN` is set on the server, then `Authorization: Bearer <token>`. Not routed by the nginx template. See docs/release/operations/observability-and-logging.md."),
  ("GET", "/site-root", "Asked by the reverse proxy for requests it cannot route by name: 204 if the first path segment is a website's root path (the proxy then sends the request to the editor, which renders the page), 403 otherwise (dashboard). Answers from a 5 s cache; reads the URI from `X-Original-URI`."),
]),
]

ASSET_PROCESSOR_SECTIONS = [
("Stateless image processing", [
  ("POST", "/api/v1/process", "Resize/convert an uploaded (or base64) image; `?mode=variants` returns multiple sizes in one call."),
  ("POST", "/api/v1/metadata", "Extract EXIF/IPTC/GPS/camera metadata from an uploaded file."),
]),
("DAM assets (S3-backed, Postgres-tracked)", [
  ("GET", "/api/v1/dam/info", "Non-secret storage config (bucket, endpoint, public base URL) for the admin UI."),
  ("POST", "/api/v1/dam/upload", "Upload a file to S3 and record it (path, visibility, metadata)."),
  ("POST", "/api/v1/dam/transform", "Re-process an already-uploaded image (resize/format/watermark/etc.) and save it as a new version or _edited copy."),
  ("DELETE", "/api/v1/dam/asset", "Delete an asset (and its thumbnails) from storage and the DB."),
  ("POST", "/api/v1/dam/assets/move", "Move/rename an asset to a new folder path."),
  ("GET", "/api/v1/dam/folders", "List DAM folders."),
  ("POST", "/api/v1/dam/folders", "Create a folder."),
  ("DELETE", "/api/v1/dam/folders", "Delete a folder and everything under it (descendant folders, asset records, and S3 objects)."),
  ("GET", "/api/v1/dam/assets", "List assets in a folder, with resolved URLs + thumbnails."),
  ("POST", "/api/v1/dam/assets", "List assets in a folder (POST variant, avoids URL-length limits for large folder-rule payloads)."),
  ("GET", "/api/v1/dam/assets/:id", "Get a single asset by record id, with resolved URLs."),
  ("PATCH", "/api/v1/dam/assets/metadata", "Update an asset's stored metadata."),
  ("POST", "/api/v1/dam/assets/:id/mirror-cdn", "Push a copy of this asset to the CDN configured for `websiteId` (its own settings, else the default): Cloudinary through the Gateway, Cloudflare Images directly. The old body (`gatewayRouteId`, `uploadPreset`) still means Cloudinary. A refusal of the provider is in `detail`."),
  ("GET", "/api/v1/dam/asset-urls", "Resolve an asset's (public or freshly presigned) URL + thumbnail URLs by path."),
  ("POST", "/api/v1/dam/asset-urls", "Resolve URLs for a batch of asset paths in one call."),
  ("GET", "/api/v1/dam/exists", "Check whether an asset exists at a given path."),
  ("POST", "/api/v1/dam/exists", "Check existence for a batch of paths in one call."),
  ("POST", "/api/v1/dam/regenerate-thumbnails", "Regenerate thumbnail variants for one or more assets."),
  ("POST", "/api/v1/dam/ensure-bucket", "Ensure the target bucket exists with the correct public-read policy for current folder rules."),
  ("GET", "/dam-asset/*", "Streams a stored object through this server (signed S3 GetObject), so the browser never talks to S3 directly."),
]),
("Health", [
  ("GET", "/health", "Liveness/uptime check."),
]),
]

GATEWAY_SECTIONS = [
("Gateway admin: endpoints, routes, schemas (auth: wcms_session + GATEWAY_MANAGE)", [
  ("GET", "/api/v1/gateway/endpoints", "List configured upstream API endpoints (base URL, auth type, rate limits)."),
  ("POST", "/api/v1/gateway/endpoints", "Register a new upstream endpoint."),
  ("GET", "/api/v1/gateway/endpoints/:id", "Get one endpoint (credentials redacted)."),
  ("PATCH", "/api/v1/gateway/endpoints/:id", "Update an endpoint."),
  ("DELETE", "/api/v1/gateway/endpoints/:id", "Delete an endpoint and its routes."),
  ("GET", "/api/v1/gateway/endpoints/:id/routes", "List an endpoint's configured routes."),
  ("POST", "/api/v1/gateway/endpoints/:id/routes", "Add a route (path + method) to an endpoint."),
  ("PATCH", "/api/v1/gateway/routes/:id", "Update a route."),
  ("DELETE", "/api/v1/gateway/routes/:id", "Delete a route."),
  ("POST", "/api/v1/gateway/routes/:id/test", "Fire a real test request through a route and return the raw upstream response."),
  ("POST", "/api/v1/gateway/routes/:id/execute", "Execute a route's proxied request with real parameters (used by the editor's live preview)."),
  ("GET", "/api/v1/gateway/routes/:id/schema", "Get a route's auto-inferred response schema + sample payload."),
  ("POST", "/api/v1/gateway/routes/:id/refresh-schema", "Re-infer a route's response schema from a fresh live call."),
  ("POST", "/api/v1/gateway/endpoints/:id/import-openapi", "Bulk-create routes for an endpoint from an OpenAPI/Swagger spec."),
  ("POST", "/api/v1/gateway/preview-resolve", "Admin-authenticated live resolve, for the editor's own binding-picker preview (distinct from the public /resolve below)."),
  ("GET", "/api/v1/gateway/plugins", "List loaded custom Gateway plugins."),
  ("GET", "/api/v1/gateway/presets", "List available connector presets (HubSpot, Brevo, Stripe, etc.)."),
]),
("Gateway admin: API clients (auth: wcms_session + GATEWAY_MANAGE)", [
  ("GET", "/api/v1/gateway/clients", "List the API clients (applications that call the gateway with a key) with their keys' prefixes; never a key or a hash."),
  ("POST", "/api/v1/gateway/clients", "Create a client (name, scopes, limits, allowed addresses, expiry; `authMode` `key` or `jwt`; a `jwt` client carries the identity provider registration in `jwt`). A key client gets its first key, in the reply, once; a token client has none."),
  ("GET", "/api/v1/gateway/clients/:id", "Get one client with its keys."),
  ("PATCH", "/api/v1/gateway/clients/:id", "Change a client: name, status (`active` / `suspended`), scopes, limits, addresses, expiry. Scopes are checked against the resulting kind."),
  ("DELETE", "/api/v1/gateway/clients/:id", "Delete a client and its keys."),
  ("POST", "/api/v1/gateway/clients/:id/keys", "Add a key to a key client (rotation). The key is in the reply, once."),
  ("DELETE", "/api/v1/gateway/clients/:id/keys/:keyId", "Revoke a key."),
]),
("Gateway client surface (auth: an API key `wbk_...` from a server, or an identity provider token from a browser or an app, as `Authorization: Bearer`; the key also as `X-Whoobe-Key`; no session - see docs/release/communication/integrations.md)", [
  ("GET", "/client/v1/me", "What the calling key is: name, auth mode, scopes, limits, state of the rate-limit store. No secret."),
  ("GET", "/client/v1/data/:class", "Published objects of a Data Class named in a `data:read:<Class>` scope: `filter=field:op:value` (up to 5), `orderBy`, `dir`, `limit` (1-100), `offset`, `locale`. Only the class's own attributes are returned. Outside the scopes or an unknown class: `404 Not found`."),
  ("GET", "/client/v1/data/:class/:id", "One published object of that class; a draft, another class's id or a malformed id answer `404 Not found`."),
  ("POST", "/client/v1/automations/:endpoint/*", "Start the flow behind a POST route of an engine endpoint (Activepieces, n8n) named in an `automation:run:<endpoint>:<route>` scope, wait for its answer and return `{ ok, outcome?, response }`; `outcome` is the validated key (1-32 letters, digits, `_`, `-`) the flow answered. JSON body up to 1 MB. Outside the scopes: `404 Not found`; an engine error: `502`."),
  ("ALL", "/client/v1/gateway/:endpoint/*", "Call a configured route of an endpoint the client's scopes allow: the path is matched to a route (templates such as `customers/{id}` included), query string and JSON body are passed on, the gateway adds the credentials. Anything outside the scopes answers `404 Not found`; `429` with `Retry-After` over the client's limits. A key sent with an `Origin` header (a browser) is refused with `403`; a valid token whose claims give no access gets `403`."),
]),
("Gateway published-site endpoints (site API key or bound content only - see docs/release/communication/api-gateway-security.md)", [
  ("POST", "/api/v1/gateway/resolve", "Resolve a gateway-bound content field for a published page - the only way a published site reads third-party data. Requires a resolved gatewayBindingId (server-assigned at page-save time), not a free endpoint/route choice."),
  ("POST", "/api/v1/gateway/submit", "Submit a gateway-bound form for a published page. Requires a resolved gatewayBindingId, same as /resolve. The reply is `{ success, response }`, plus `outcome` when the service answered a plain key of 1-32 letters, digits, `_` or `-` (the page reacts to it, see guides/marketing-automation.md)."),
]),
("Gateway internal proxies (auth: wcms_session, admin-dashboard use only)", [
  ("ALL", "/api/internal/*", "Authenticated passthrough proxy to core-api, for admin-dashboard requests that need to cross from the Gateway's own origin."),
  ("ALL", "/dam/*", "Authenticated passthrough proxy to asset-processor."),
]),
("Gateway public proxy (no auth)", [
  ("ALL", "/public/*", "Unauthenticated passthrough proxy to core-api's own /public/* routes, for published sites that only have the Gateway's origin configured."),
]),
("Gateway plugin routes", [
  ("ALL", "/api/remote/*", "Dynamically registered by loaded Gateway plugins (see /api/v1/gateway/plugins) - not enumerable statically."),
]),
("Health", [
  ("GET", "/health", "Liveness/uptime check."),
]),
]

# A handful of flagship endpoints get a real request/response schema instead
# of the generic `type: object` every other route falls back to - enough to
# anchor the spec's quality without hand-modeling all 226 routes (see this
# file's own module docstring / docs/release/api/api-reference.md's own note on
# this scope decision).
SCHEMA_OVERRIDES = {
  ("post", "/auth/login"): {
    "requestBody": """        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email: { type: string, format: email }
                password: { type: string, format: password }""",
    "responses": """        "200":
          description: Logged in, or a pending 2FA challenge.
          content:
            application/json:
              schema:
                oneOf:
                  - type: object
                    properties:
                      user: { $ref: '#/components/schemas/AuthUser' }
                  - type: object
                    properties:
                      mfaRequired: { type: boolean, enum: [true] }
                      mfaToken: { type: string }
        "401":
          $ref: '#/components/responses/Unauthorized'""",
  },
  ("get", "/auth/me"): {
    "responses": """        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthUser'
        "401":
          $ref: '#/components/responses/Unauthorized'""",
  },
  ("post", "/api/v1/gateway/resolve"): {
    "requestBody": """        required: true
        content:
          application/json:
            schema:
              type: object
              required: [bindingId]
              properties:
                bindingId:
                  type: string
                  description: Server-resolved at page-save time (never a free endpoint/route choice) - see GatewayBinding in packages/sdk/schema.
                params:
                  type: object
                  description: Dynamic placeholder values for the bound route's path/query, if any.""",
    "responses": """        "200":
          description: The bound field's resolved value (shape depends entirely on the upstream API).
          content:
            application/json:
              schema:
                type: object
        "401":
          description: Missing/invalid site key, or the binding doesn't belong to this site.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'""",
    "security": '      security:\n        - gatewaySiteKey: []',
  },
  ("post", "/api/v1/gateway/submit"): {
    "requestBody": """        required: true
        content:
          application/json:
            schema:
              type: object
              required: [bindingId, attributes]
              properties:
                bindingId:
                  type: string
                  description: Server-resolved at page-save time (never a free endpoint/route choice) - see GatewayBinding in packages/sdk/schema.
                attributes:
                  type: object
                  description: The submitted form's field values.""",
    "responses": """        "200":
          description: Submission accepted.
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  outcome:
                    type: string
                    description: Only when the service answered a plain key (1-32 letters, digits, underscore or hyphen); anything else is dropped.
                  response:
                    description: The service's whole reply.
        "401":
          description: Missing/invalid site key, or the binding doesn't belong to this site.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'""",
    "security": '      security:\n        - gatewaySiteKey: []',
  },
  ("post", "/whoobe-one/pages"): {
    "requestBody": """        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/WhoobePageInput'""",
    "responses": """        "201":
          description: Created.
          content:
            application/json:
              schema:
                type: object
                properties:
                  page: { $ref: '#/components/schemas/WhoobePage' }
        "409":
          description: A page with this slug already exists for this locale/website.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'""",
  },
  ("patch", "/whoobe-one/pages/{id}"): {
    "requestBody": """        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/WhoobePageInput'""",
    "responses": """        "200":
          description: Updated.
          content:
            application/json:
              schema:
                type: object
                properties:
                  page: { $ref: '#/components/schemas/WhoobePage' }""",
  },
  ("get", "/whoobe-one/pages/{id}"): {
    "responses": """        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  page: { $ref: '#/components/schemas/WhoobePage' }
        "404":
          description: Not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'""",
  },
}

def to_openapi_path(path: str) -> str:
    return re.sub(r":([A-Za-z0-9_]+)", r"{\1}", path).replace("/*", "/{splat}")

def path_params(path: str):
    names = re.findall(r":([A-Za-z0-9_]+)", path)
    if "/*" in path:
        names.append("splat")
    return names

PUBLIC_PREFIXES = ("/public/", "/preview/", "/dam-asset/", "/health")

def is_public(path: str) -> bool:
    return path == "/health" or any(path.startswith(p) for p in PUBLIC_PREFIXES)

def md_for(service_title: str, sections) -> str:
    out = []
    for title, routes in sections:
        out.append(f"### {title}\n")
        out.append("| Method & path | Description |")
        out.append("| --- | --- |")
        for method, path, desc in routes:
            out.append(f"| `{method} {path}` | {desc} |")
        out.append("")
    return "\n".join(out)

def yaml_escape(s: str) -> str:
    return s.replace('"', '\\"')

def openapi_for(all_services):
    lines = []
    lines.append("openapi: 3.0.3")
    lines.append("info:")
    lines.append("  title: Whoobe API")
    lines.append('  description: >')
    lines.append("    HTTP APIs exposed by this monorepo's backend services (core-api, gateway,")
    lines.append("    asset-processor). Companion machine-readable spec for")
    lines.append("    docs/release/api/api-reference.md - generated from the same route table (see")
    lines.append("    docs/release/api/gen-api-docs.py), so treat that script, not this file directly,")
    lines.append("    as the source of truth when routes change.")
    lines.append("  version: \"1.0\"")
    lines.append("servers:")
    lines.append("  - url: http://localhost:3003")
    lines.append("    description: core-api (local dev)")
    lines.append("  - url: http://localhost:3001")
    lines.append("    description: gateway (local dev)")
    lines.append("  - url: http://localhost:3002")
    lines.append("    description: asset-processor (local dev)")
    lines.append("security:")
    lines.append("  - sessionCookie: []")
    lines.append("components:")
    lines.append("  securitySchemes:")
    lines.append("    sessionCookie:")
    lines.append("      type: apiKey")
    lines.append("      in: cookie")
    lines.append("      name: wcms_session")
    lines.append("      description: Admin session cookie, set by POST /auth/login.")
    lines.append("    gatewaySiteKey:")
    lines.append("      type: apiKey")
    lines.append("      in: header")
    lines.append("      name: X-Whoobe-Site-Key")
    lines.append("      description: >")
    lines.append("        Optional per-website key (see docs/release/communication/api-gateway-security.md).")
    lines.append("        A resolved gatewayBindingId is the mandatory server-side check either")
    lines.append("        way; this key adds per-site scoping/rate-limiting/revocation on top.")
    lines.append("  schemas:")
    lines.append("    Error:")
    lines.append("      type: object")
    lines.append("      properties:")
    lines.append("        error:")
    lines.append("          type: string")
    lines.append("    AuthUser:")
    lines.append("      type: object")
    lines.append("      properties:")
    lines.append("        id: { type: string, format: uuid }")
    lines.append("        email: { type: string, format: email }")
    lines.append("        name: { type: string }")
    lines.append("        permissions:")
    lines.append("          type: array")
    lines.append("          items: { type: string }")
    lines.append("    WhoobePage:")
    lines.append("      type: object")
    lines.append("      description: A whoobe_pages row - see packages/core/src/db/whoobe-pages-schema.ts.")
    lines.append("      properties:")
    lines.append("        id: { type: string, format: uuid }")
    lines.append("        translationGroupId: { type: string, format: uuid }")
    lines.append("        locale: { type: string, example: en }")
    lines.append("        slug: { type: string }")
    lines.append("        title: { type: string }")
    lines.append("        category: { type: string }")
    lines.append("        kind: { type: string, enum: [content, module, app] }")
    lines.append("        published: { type: boolean }")
    lines.append("        workflowState: { type: string, nullable: true }")
    lines.append("        content:")
    lines.append("          type: object")
    lines.append("          description: A WhoobeElementNode tree (packages/sdk/schema) - opaque jsonb.")
    lines.append("        websiteId: { type: string, format: uuid, nullable: true }")
    lines.append("        themeId: { type: string, format: uuid, nullable: true }")
    lines.append("        publishedAt: { type: string, format: date-time, nullable: true }")
    lines.append("        createdAt: { type: string, format: date-time }")
    lines.append("        updatedAt: { type: string, format: date-time }")
    lines.append("    WhoobePageInput:")
    lines.append("      type: object")
    lines.append("      required: [slug, title, content]")
    lines.append("      properties:")
    lines.append("        slug: { type: string }")
    lines.append("        title: { type: string }")
    lines.append("        category: { type: string }")
    lines.append("        kind: { type: string, enum: [content, module, app] }")
    lines.append("        content:")
    lines.append("          type: object")
    lines.append("          description: A WhoobeElementNode tree (packages/sdk/schema).")
    lines.append("        locale: { type: string }")
    lines.append("        websiteId: { type: string, format: uuid, nullable: true }")
    lines.append("        themeId: { type: string, format: uuid, nullable: true }")
    lines.append("        published: { type: boolean }")
    lines.append("  responses:")
    lines.append("    Unauthorized:")
    lines.append('      description: Missing/invalid session, or missing permission.')
    lines.append("      content:")
    lines.append("        application/json:")
    lines.append("          schema:")
    lines.append("            $ref: '#/components/schemas/Error'")
    lines.append("paths:")

    path_entries = {}  # openapi_path -> {method: {...}}
    for service_tag, sections in all_services:
        for section_title, routes in sections:
            for method, raw_path, desc in routes:
                if method == "ALL":
                    methods = ["get", "post", "put", "patch", "delete"]
                else:
                    methods = [method.lower()]
                op = to_openapi_path(raw_path)
                key = op
                path_entries.setdefault(key, {})
                for m in methods:
                    path_entries[key][m] = {
                        "tag": f"{service_tag}: {section_title}",
                        "summary": desc,
                        "path": raw_path,
                        "public": is_public(raw_path),
                    }

    for op_path in path_entries:
        lines.append(f"  {op_path}:")
        for method, meta in path_entries[op_path].items():
            override = SCHEMA_OVERRIDES.get((method, op_path), {})
            lines.append(f"    {method}:")
            lines.append(f"      tags: [\"{yaml_escape(meta['tag'])}\"]")
            lines.append(f"      summary: \"{yaml_escape(meta['summary'])}\"")
            params = path_params(meta["path"])
            if params:
                lines.append("      parameters:")
                for p in params:
                    lines.append(f"        - name: {p}")
                    lines.append("          in: path")
                    lines.append("          required: true")
                    lines.append("          schema:")
                    lines.append("            type: string")
            if "security" in override:
                lines.append(override["security"])
            elif meta["public"]:
                lines.append("      security: []")
            if "requestBody" in override:
                lines.append("      requestBody:")
                lines.append(override["requestBody"])
            elif method in ("post", "patch", "put"):
                lines.append("      requestBody:")
                lines.append("        required: false")
                lines.append("        content:")
                lines.append("          application/json:")
                lines.append("            schema:")
                lines.append("              type: object")
                lines.append("              description: See docs/release/api/api-reference.md and the route handler for the exact shape.")
            lines.append("      responses:")
            if "responses" in override:
                lines.append(override["responses"])
            else:
                lines.append("        \"200\":")
                lines.append("          description: OK")
                lines.append("          content:")
                lines.append("            application/json:")
                lines.append("              schema:")
                lines.append("                type: object")
                if not meta["public"]:
                    lines.append("        \"401\":")
                    lines.append("          $ref: '#/components/responses/Unauthorized'")
    return "\n".join(lines) + "\n"

import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Splices generated tables into docs/release/api/api-reference.md between paired
# `<!-- GENERATED:<NAME>:START -->`/`:END` HTML-comment markers already
# present in that file - the surrounding prose (headers, the OpenAPI-scope
# note, etc.) is real, hand-maintained content this script never touches,
# only what's between a marker pair.
def splice_markers(doc_text: str, name: str, replacement_md: str) -> str:
    start = f"<!-- GENERATED:{name}:START"
    end = f"<!-- GENERATED:{name}:END -->"
    start_idx = doc_text.index(start)
    start_line_end = doc_text.index("\n", start_idx) + 1
    end_idx = doc_text.index(end, start_line_end)
    return doc_text[:start_line_end] + replacement_md + "\n" + doc_text[end_idx:]

if __name__ == "__main__":
    md_path = os.path.join(SCRIPT_DIR, "api-reference.md")
    with open(md_path) as f:
        doc = f.read()
    doc = splice_markers(doc, "CORE_API", md_for("core-api", CORE_API_SECTIONS).rstrip("\n"))
    doc = splice_markers(doc, "GATEWAY", md_for("gateway", GATEWAY_SECTIONS).rstrip("\n"))
    doc = splice_markers(doc, "ASSET_PROCESSOR", md_for("asset-processor", ASSET_PROCESSOR_SECTIONS).rstrip("\n"))
    with open(md_path, "w") as f:
        f.write(doc)

    spec = openapi_for([
        ("core-api", CORE_API_SECTIONS),
        ("gateway", GATEWAY_SECTIONS),
        ("asset-processor", ASSET_PROCESSOR_SECTIONS),
    ])
    openapi_path = os.path.join(SCRIPT_DIR, "openapi.yaml")
    with open(openapi_path, "w") as f:
        f.write(spec)

    total = sum(len(r) for _, s in [("core-api", CORE_API_SECTIONS), ("gateway", GATEWAY_SECTIONS), ("asset-processor", ASSET_PROCESSOR_SECTIONS)] for _, r in s)
    print(f"Updated {md_path} and wrote {openapi_path} ({total} route entries)")
