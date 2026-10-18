# Audit log of administrative actions

*Date: 2026-10-18. Status: **plan, nothing built.** Part of block A2 of [release 0.2](release-0.2-plan.md) (verb **govern**). Statements about
the code were checked in the repository on this date.*

## 1. What it is for

An operator, an auditor or a security officer asks: *who changed this user, role, website or setting, when, from where, and what was it
before?* Today the answer is "the application log, if it has not rotated", which is neither complete nor protected. The audit log is a table
that only grows, written by the application for every **administrative** action, readable by administrators.

Not in scope: the content itself (pages and snippets have version history, data objects have object events), the content of form submissions,
and read access (who looked at what). Failed attempts are not in version 1 (see section 7).

## 2. What is recorded

One row per action that succeeded:

| Column | Content |
|---|---|
| `id`, `at` | uuid, server time (UTC) |
| `actor_type`, `actor_id`, `actor_label` | `user` (the session user), `api_client` (gateway administration), or `system`; the e-mail at that moment, so the row stays readable after the user is deleted |
| `ip` | client address as the application sees it (`TRUST_PROXY` applies) |
| `action` | a stable name: `user.create`, `user.update`, `user.delete`, `user.reset_password`, `role.update`, `website.delete`, `setting.update`, `website.publish` ... |
| `target_type`, `target_id`, `target_label` | what was changed, and a readable name at that moment |
| `before`, `after` | JSON, **only fields on an allow-list per entity**; never a secret (section 4) |
| `request_id` | correlation with the application log line of the same request |

Rows are never updated. A secret is never written, not even masked: a changed secret is recorded as `{ "apiKey": "changed" }`.

## 3. How it is written

**A guard that is part of the route** (`apps/core-api/src/audit.ts`):

```ts
app.patch('/auth/users/:id', requirePermission(PERMISSIONS.USERS_MANAGE), audited(AUDIT.userUpdate), async (req, res) => { ... })
```

`audited(spec)` runs after the permission guard (so `req.user` is known), calls `spec.before(req)` for the state before the handler, and on the
response `finish` event with a status below 400 calls `spec.after(req, res)` and inserts the row. A spec is `{ action, targetType, target(req),
before?(req), after?(req, res) }`; the snapshot functions return allow-listed fields. If the insert fails, the error is logged loudly with the
action and target and the request is **not** failed (the change has already happened); `/health` reports the number of lost audit writes since start.

Why not a global middleware that logs every mutating request: it cannot know the actor before the route's own guard has run, cannot name the
target, and would log bodies that hold secrets. Why not write inside each handler: 35 routes edited by hand with no way to see what was
forgotten. A visible `audited(...)` per route plus a test (section 6) gives both explicit snapshots and a check for omissions.

**The write is in `packages/core`** (`insertAudit`), so the gateway (clients, keys, endpoints) can write to the same table in a later step.

## 4. What is audited in version 1

From the route contract (125 routes that change something; 228 in all):

| Area | Routes | Actions |
|---|---|---|
| Users | `POST/PATCH/DELETE /auth/users`, `POST /auth/users/:id/reset-password` | create, update (name, e-mail, roles, active), delete, reset password |
| Roles | `POST/PATCH/DELETE /auth/roles` | create, update (name, permission keys), delete |
| Websites | create, update, delete, import, from-ai, theme and template changes, paths, upload settings, API key regenerate / delete | one action each |
| Settings | the six `PUT /whoobe-one/settings/*`, `PUT/DELETE /mail-settings`, `PUT /ai/*settings`, `PUT /figma/settings` | `setting.update` with the key; secrets as "changed" |
| Publication | the publish-job routes (`publish-jobs.ts`): request, cancel | `website.publish`, `website.publish_cancel` |
| Integrations | migration sources (create, update, delete), object event subscriptions (create, update, delete) | one action each |

Allow-lists: users `email, displayName, active, roles, mfaEnabled`; roles `name, description, permissionKeys`; websites `name, rootPath, domain,
published flags, theme id` (not `settings` as a whole: only the keys named in the request, secrets excluded); settings: the value for plain
settings, "changed" for any field that is a secret or a key. The list is in code next to each spec and each field is argued in a comment.

Not audited by decision (each with a reason in the contract): content editing (pages, snippets, kits, themes' CSS, templates: version history),
data objects and classes (object events, history of the record), AI generation calls, mail test and log operations (they act on the mail log, not
on the configuration), `POST /pwa/subscribe` (public), the login family (they belong to the login log, section 7).

## 5. Storage, protection and retention

- Table `audit_log` (migration `0060`, expand only). Indexes on `at`, `(actor_id, at)`, `(target_type, target_id, at)`, `action`.
- **Append only, enforced by the database**: a trigger refuses `UPDATE` always and `DELETE` unless the transaction has set
  `whoobe.audit_purge = 'on'` (only the purge job sets it). The application has no other delete path; the test proves that a plain
  `DELETE` and an `UPDATE` fail, and the purge works.
- **Retention**: `AUDIT_RETENTION_DAYS` (default 365; `0` = keep forever). A daily job at core-api start deletes older rows in batches and writes
  one `audit.purge` row with the count. The audit log is part of the database backup; shipping it elsewhere is the operator's job (the list
  can be exported).
- Size: a row is a few hundred bytes; an administrative action is rare. No partitioning in version 1.

## 6. Reading it, and the test that finds an omission

- `GET /audit-log` (new permission **`audit:read`**, given to `admin` at start, like `object_events:manage`): filters `action`, `actor`,
  `targetType`, `targetId`, `from`, `to`, `limit`, `offset`; newest first; JSON, and `?format=csv` for an export. Read-only: there is no write
  route.
- Dashboard: *Settings > Audit log* (only with `audit:read`): table with filters, a row opens a before / after view. Second step.
- **The route contract gets a decision for every changing route**: `scripts/security/routes.expected.json` gains `audit: "<action>"` or
  `audit: "exempt: <reason>"`. `route-drift` fails when a changing route has neither (so a new route cannot be added without deciding) and
  when the `audited(...)` calls found in `server.ts` and `publish-jobs.ts` differ from the contract. An API test per area (users, roles,
  websites, settings, publication) makes the change and reads the row back: actor, action, target, before / after, no secret.
- A **secret test**: it saves a setting with a recognisable secret and a user password through every audited route and greps the whole table
  for the value: zero hits.

## 7. Not in version 1

- **Failed attempts** (403, 401, failed logins): they belong to a login / security log with another retention and another volume; the
  application already counts them for the lockout. Next step if asked.
- Gateway administration (API clients, keys, endpoints, routes): same table, written from the gateway process; second step.
- Tamper evidence beyond the database rule (hash chain, external anchoring); shipping to a SIEM; per-class data audit. The documentation says
  that a database administrator can still change the table: the rule protects against the application and against mistakes.
- Reading the log of a deleted workspace: the table is per workspace like everything else.

## 8. Order of work

1. This plan.
2. Migration `0060`, schema, `insertAudit` / `listAudit` / `purgeAudit`, redaction helper, trigger test (core, on a disposable database).
3. `audited()` and the users and roles routes, `GET /audit-log` with the permission; contract decisions for all 125 routes; route-drift test;
   API tests for users and roles.
4. Websites, settings, publication, integrations; the secret test.
5. Dashboard view; documentation (guide, API reference, configuration reference for `AUDIT_RETENTION_DAYS`, status summary row, chapter 4.5
   of the overview); `CHANGES.md`.

## 9. Decisions for the owner

- Default retention **365 days**, or longer / forever?
- Is `audit:read` right as a separate permission, or should it be tied to `users:manage`? (Proposal: separate, so an auditor can read without being able to change users.)
- Is "successful administrative actions only" enough for version 1?
