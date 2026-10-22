# Audit log of administrative actions

Who changed a user, a role, a website, a setting or an integration, when, from which address, and what it was before. The log is a table
that only grows, written by the application for every administrative action and readable by administrators. It answers an auditor's
question ("who gave this role that permission, and when?") without searching the application log.

*Status: new in the release after 0.1.1. Plan and reasons: `docs/plans/system/audit-log-plan.md` in the repository.*

## 1. What is recorded

One row per action that **succeeded**. A request that was refused (no permission, no session), failed (validation, conflict, server error) or
changed nothing (deleting something that is not there, a dry run of an import) leaves no row.

| Column | Content |
|---|---|
| `at` | server time, UTC |
| `actor_type`, `actor_id`, `actor_label` | `user`, the user's id and the e-mail **at that moment** (the row stays readable after the user is deleted); `system` when there is no session |
| `ip` | the client address as the application sees it; behind a reverse proxy set `TRUST_PROXY` (see the [configuration reference](configuration-reference.md)) |
| `action` | a stable name, `area.verb` (below) |
| `target_type`, `target_id`, `target_label` | what was changed and a readable name at that moment |
| `before`, `after` | the fields that **changed**, on an allow-list per kind of object. A create has only `after`, a delete only `before` |
| `request_id` | the `X-Request-Id` header of the request, when the proxy sets one |

### What is audited

| Area | Actions |
|---|---|
| Users | `user.create`, `user.update` (name, e-mail, active, roles), `user.delete`, `user.reset_password` |
| Roles | `role.create`, `role.update` (name, description, permission keys), `role.delete` |
| Websites | `website.create`, `website.update`, `website.delete`, `website.import`, `website.create_from_ai`, `website.create_from_spec`, `website.create_from_wizard`, `website.theme_create`, `website.theme_update`, `website.theme_delete`, `website.theme_set`, `website.upload_settings`, `website.pwa_generate`, `website.api_key_regenerate`, `website.api_key_clear`, `website_path.create`, `website_path.update`, `website_path.delete` |
| Settings | `setting.update` (autosave, logging, HTML comment stripping, placeholder image, Alpine presets; the key is the target), `setting.cdn_mirror_update` / `setting.cdn_mirror_remove` (the CDN of a website or the default; the API token is "changed"), `setting.mail_update`, `setting.mail_remove`, `setting.figma_update`, `setting.security_update` (mandatory 2FA, password policy, mail log retention), `setting.oidc_update` (single sign-on; the client secret is "changed") |
| Single sign-on | `user.sso_provision`, `user.sso_link`, `user.sso_roles` (actor "Single sign-on") |
| Personal data | `data_subject.search`, `data_subject.export`, `data_subject.erase` (a fingerprint of the identifier and the counts, **never the identifier**), `data_class.retention_update`, `retention.purge` (the classes and the counts) |
| Publication | `website.publish` (a site generation was queued: framework, slug, domain; whether a site key was given, never the key), `website.publish_cancel` |
| Fonts | `font.create`, `font.delete` (family, weight, style and the path of the woff2 file) |
| Integrations | `migration_source.create`, `.update`, `.delete`, `.import_classes`, `.import_objects`, `.import_documents`, `.promote_documents`, `.extract_components`; `object_event_subscription.create`, `.update`, `.delete` |
| The log itself | `audit.purge` (written by the retention job with the number of rows removed) |

### What is deliberately not audited

- **Content editing** (pages, snippets, kits, templates, themes' CSS): the editor keeps a version history of who saved what.
- **Data**: objects and classes have object events and the record's own history.
- **Personal actions**: signing in and out, the second factor, a user's own AI provider key.
- **Operations that change no configuration**: AI generation, mail tests and log clean-up, search reindex, delivery retries.
- **Failed attempts**: they belong to a login log with another volume and retention; the application counts them for the lockout and logs failed
  logins (see [observability and logging](observability-and-logging.md)).

### Secrets

A secret is **never** written, not even masked. The snapshots list the fields they record; anything else is left out. When a credential is
changed the row says `"changed"` in its place (`smtp.password`, `providerConfig.apiKey`, `accessToken`, `dbPassword`). The text of a theme or
of an Alpine preset is stored as a short fingerprint (`sha:...`), so that a change is visible and the code is not copied into the log.
A safety net hides, whatever the caller passes, any value whose key looks like a credential (password, secret, token, key, hash, cookie...).

## 2. Reading it

Permission **`audit:read`**, given to the `admin` role. It is separate from `users:manage` on purpose: an auditor can read the log without
being able to change users or roles. Add it to a custom role in *Security > Roles/Users/Workspaces*.

```bash
# the latest entries, then everything a person did, then one object's history, then a file for a spreadsheet
curl -b cookies.txt 'https://your-host/api/audit-log?limit=50'
curl -b cookies.txt 'https://your-host/api/audit-log?actor=<user id>&from=2026-10-01'
curl -b cookies.txt 'https://your-host/api/audit-log?targetType=role&targetId=<role id>'
curl -b cookies.txt -o audit-log.csv 'https://your-host/api/audit-log?format=csv&action=user.'
```

Filters: `action` (exact, or a prefix ending in a dot), `actor`, `targetType`, `targetId`, `from`, `to` (ISO dates), `limit` (default 100,
at most 5000), `offset`. The answer is `{ entries, total }`, newest first. CSV starts with a header row; a value that begins with `=`, `+`, `-` or `@`
gets a leading apostrophe so that a spreadsheet does not run it. A dashboard screen is planned.

There is **no route that writes, changes or deletes a row.**

## 3. Protection and retention

- **Append only, enforced by the database.** A trigger refuses `UPDATE` and `TRUNCATE`, and refuses `DELETE` unless the transaction is the retention
  job's. The application has no other path that deletes. This protects against the application and against mistakes. **It does not protect against a
  database administrator**, who can disable the trigger; for that, copy the log to a place they cannot change (below).
- **Retention.** `AUDIT_RETENTION_DAYS` (default **365**; `0` keeps everything). At start and then daily, core-api deletes rows older than that in batches and writes
  one `audit.purge` row with the count.
- **Backups.** The log is in the database, so it is in the database backup ([backup, restore and DR](backup-restore-and-dr.md)). Export it (CSV) to
  storage with versioning or object lock if your rules ask for evidence that cannot be altered afterwards.
- **A write that fails** is logged with the action and target (`audit: the row could not be written`) and the request still succeeds: the change had
  already happened. `GET /health` shows `"audit": "degraded"` after the first lost row since the start, so monitoring can alert on it.
- **Size.** A row is a few hundred bytes and administrative actions are rare; no partitioning is needed for the retention above.

## 4. Limits

- Successful actions only (section 1).
- Administration of the Gateway (API clients, keys, endpoints, routes) is not in this log yet; it is written by another service and comes in a later step.
- No hash chain or external anchoring; no export to a SIEM (use the CSV export on a schedule).
- One log per workspace, like everything else; a deleted workspace takes its log with it.

## 5. For developers: adding a route

A route that changes something must decide, in `scripts/security/routes.expected.json`, either `"audit": "<specName>"` (and carry
`audited(AUDIT.<specName>)` in its middleware list, after the permission guard) or `"audit": "exempt: <the reason>"`. The route-drift test fails for a new
route without a decision, for a decision that does not match the code, and for a spec nobody uses. A spec (`apps/core-api/src/audit-specs.ts`) names the
fields it records and the credentials it must never record.
