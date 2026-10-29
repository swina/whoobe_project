# Audit log of administrative actions

Who changed a user, a role, a website, a setting or an integration, when, from which address, and what it was before. The log is a table
that only grows, written by the application for every administrative action and readable by administrators. It answers an auditor's
question ("who gave this role that permission, and when?") without searching the application log.

*Status: new in the release after 0.1.1. Plan and reasons: `docs/plans/system/audit-log-plan.md` in the repository.*

## 1. What is recorded

One row per action that **succeeded**, and one per **failed attempt** of the kinds listed in "Failed attempts" below. Any other request that was
refused (no session), failed (validation, conflict, server error) or changed nothing (deleting something that is not there, a dry run of an
import) leaves no row.

| Column | Content |
|---|---|
| `at` | server time, UTC |
| `actor_type`, `actor_id`, `actor_label` | `user`, the user's id and the e-mail **at that moment** (the row stays readable after the user is deleted); `system` when there is no session; `api-client` with the client's id and name; `anonymous` for a failed attempt by someone not signed in |
| `ip` | the client address as the application sees it; behind a reverse proxy set `TRUST_PROXY` (see the [configuration reference](configuration-reference.md)) |
| `action` | a stable name, `area.verb` (below) |
| `target_type`, `target_id`, `target_label` | what was changed and a readable name at that moment |
| `before`, `after` | the fields that **changed**, on an allow-list per kind of object. A create has only `after`, a delete only `before` |
| `request_id` | the correlation id of the request (`X-Request-Id`, set by nginx or by the service): the same id is in the log lines of every service that served it ([observability](observability-and-logging.md) section 5) |

### What is audited

| Area | Actions |
|---|---|
| Users | `user.create`, `user.update` (name, e-mail, active, roles), `user.delete`, `user.reset_password` |
| Roles | `role.create`, `role.update` (name, description, permission keys), `role.delete` |
| Websites | `website.create`, `website.update`, `website.delete`, `website.import`, `website.create_from_ai`, `website.create_from_spec`, `website.create_from_wizard`, `website.theme_create`, `website.theme_update`, `website.theme_delete`, `website.theme_set`, `website.upload_settings`, `website.pwa_generate`, `website.api_key_regenerate`, `website.api_key_clear`, `website_path.create`, `website_path.update`, `website_path.delete` |
| Settings | `setting.update` (autosave, logging, HTML comment stripping, placeholder image, Alpine presets; the key is the target), `setting.cdn_mirror_update` / `setting.cdn_mirror_remove` (the CDN of a website or the default; the API token is "changed"), `setting.mail_update`, `setting.mail_remove`, `setting.figma_update`, `setting.security_update` (mandatory 2FA, password policy, mail log retention, AI usage recording and the AI retention periods), `setting.oidc_update` (single sign-on; the client secret is "changed") |
| Single sign-on | `user.sso_provision`, `user.sso_link`, `user.sso_roles` (actor "Single sign-on") |
| Personal data | `data_subject.search`, `data_subject.export`, `data_subject.erase` (a fingerprint of the identifier and the counts, **never the identifier**), `data_class.retention_update`, `retention.purge` (the classes and the counts), `ai_usage.read_user` (an administrator opened one person's AI requests: the person, the period, the number of requests) |
| Publication | `website.publish` (a site generation was queued: framework, slug, domain; whether a site key was given, never the key), `website.publish_cancel` |
| Fonts | `font.create`, `font.delete` (family, weight, style and the path of the woff2 file) |
| Gateway | `gateway_endpoint.create`, `.update`, `.delete` (name, address, kind of authentication, timeouts and limits, active; the **names** of the stored credentials, a new credential is "changed"), `gateway_endpoint.import_openapi` (the spec's address without its query, or "pasted"; routes created, updated, skipped); `gateway_route.create`, `.update`, `.delete`; `gateway_route.test`, `.refresh_schema`, `.execute` (a call made to the upstream with the stored credentials: the upstream status, never a body; an `execute` that never reached the upstream is not written) |
| API clients | `api_client.create`, `.update`, `.delete` (name, authentication mode, status, scopes, limits, allowed addresses, expiry, the identity provider's registration), `api_client.key_add` (the key's id, prefix, label and expiry, **never the key**), `api_client.key_revoke` |
| Integrations | `migration_source.create`, `.update`, `.delete`, `.import_classes`, `.import_objects`, `.import_documents`, `.promote_documents`, `.extract_components`; `object_event_subscription.create`, `.update`, `.delete` |
| The log itself | `audit.purge` (written by the retention job with the number of rows removed) |

### Failed attempts

| Action | When | Recorded |
|---|---|---|
| `auth.login_failed` | a sign-in with a password refused | `reason`: `unknown_user` (no target: the e-mail typed is **not** written, it may be a password typed in the wrong field), `inactive`, `wrong_password`, `locked_out` (the address or the account is waiting after too many failures), `single_sign_on_required`; the account as target when it exists |
| `auth.mfa_failed` | a wrong second-factor code | `step` (`challenge` at sign-in, `enrol` when the role requires it, `setup` and `disable` by the signed-in user) and `reason` (`wrong_code`, `wrong_recovery_code`, `wrong_password` to turn it off, `locked_out`); the account as target |
| `access.permission_refused` | a signed-in user called a route without its permission (core-api and the Gateway's administration) | the user as actor; `method`, `route` (the pattern, never the URL with its values), `permission` (and `accepted` when several would do; `service: gateway` for the Gateway) |
| `api_client.refused` | an application was refused at the Gateway's `/client/v1` before calling anything | `reason` (`unknown`, `revoked`, `expired`, `suspended`, `malformed`, a token's reason such as `expired` or `signature`, `address not allowed`, `key sent by a browser`, `locked_out`) and `presented` (what was sent: `key`, `jwt`, `none`); the client as actor when the credential named one |

No password, code, key or token is ever written. Someone trying passwords decides how many failures there are, so the rows are **throttled: at
most 10 a minute per address and action**; the rest of that minute is dropped and the service writes one warning line (`audit: more than 10
failed attempts in a minute from this address...`). The counts are per process and start again after a restart. A refusal that answers 404 on
purpose (an API client asking for a class or a folder outside its scopes, so that it cannot learn what exists) is in the gateway log, not here.

### What is deliberately not audited

- **Content editing** (pages, snippets, kits, templates, themes' CSS): the editor keeps a version history of who saved what.
- **Data**: objects and classes have object events and the record's own history.
- **Personal actions**: a successful sign-in or sign-out, turning the second factor on, a user's own AI provider key (failed sign-ins and codes are
  audited, above).
- **Operations that change no configuration**: AI generation, mail tests and log clean-up, search reindex, delivery retries.

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

- Successful actions, and the failed attempts listed in section 1; a missing session (401) is not written.
- The Gateway writes its rows itself: a row it cannot write is in the gateway's log (`audit: the row could not be written`), not in core-api's `GET /health`.
- The editor's previews on the Gateway (`preview-resolve`, `preview-submit`) are not written: one reads, the other is the same write a visitor's form makes.
- No hash chain or external anchoring; no export to a SIEM (use the CSV export on a schedule).
- One log per workspace, like everything else; a deleted workspace takes its log with it.

## 5. For developers: adding a route

A route that changes something must decide, in `scripts/security/routes.expected.json`, either `"audit": "<specName>"` (and carry
`audited(AUDIT.<specName>)` in its middleware list, after the permission guard) or `"audit": "exempt: <the reason>"`. The route-drift test fails for a new
route without a decision, for a decision that does not match the code, and for a spec nobody uses. A spec (`apps/core-api/src/audit-specs.ts`) names the
fields it records and the credentials it must never record.

The Gateway's administration routes (`apps/gateway/src/admin-routes.ts`, `client-admin-routes.ts`, and a mount guarded by a permission in `router.ts`)
decide the same way under `"gateway"` in that file, with their specs in `apps/gateway/src/audit-specs.ts`. `audited()` itself is shared, in
`packages/core/src/http/audited.ts`.
