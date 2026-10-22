# Database hardening and disclosure policy: plan

Status: proposal, 2026-10-22. Written after reading `Security-Analysis-Overview.md` against the code. Nothing here is built.
Related: `docs/release/security/threat-model.md`, `docs/release/security/findings.md`, `SECURITY.md`,
`docs/release/operations/upgrade-and-migrations.md`, `docs/release/architecture/design-decisions/one-workspace-per-organisation.md`.

## 0. What the overview gets right and what it does not

| Statement of the overview | Against the repository |
|---|---|
| Access control is "centralised by the API Gateway" | Permissions (`objects:read`, `settings:manage`, ...) are enforced by core-api. The gateway serves public data bindings and form submissions. |
| "Native architectural logs" | There is an audit log with retention and a per-event catalogue (`docs/release/operations/audit-log.md`). |
| A real-time public register of active bugs | `SECURITY.md` promises disclosure **after** the fix is available. `findings.md` lists fixed findings; none is open today. The two statements need one explicit policy (section 1). |
| RLS makes the CMS "mathematically fault tolerant" | Not as described (section 3). The valuable part of the proposal is the separation of database roles (section 2). |
| Transactional DDL and zero-downtime updates | Not verified for our drizzle version, and `CREATE INDEX CONCURRENTLY` cannot run in a transaction. What protects an upgrade today is the expand-only rule and the dump taken before it (section 4). |
| A compliance ceiling (SOC 2, ISO 27001) | Correct and consistent with what the product says: no third-party certificate. A commercial decision, not part of this plan. |

## 1. Disclosure policy (1 day, no code)

The "vulnerability window" is real: a test that describes an open defect is already public in the repository, and `known()` keeps CI green while it is open.

- Write it in `docs/release/release-process.md` and link it from `SECURITY.md`: a finding of severity High or Critical is entered in the public register **with the release that fixes it**, never before; until then its `known()` test lives outside the public branch (a private branch or a private repository of the owner's choice).
- Medium and below: in the register when found, as today.
- Say what an operator can expect: how long between the fix and the public entry, and how an installation is told (release notes, the upgrade page).
- Done when: the page exists, `SECURITY.md` points to it, and the findings template has a "public from release" column.

## 2. Separate database roles (3-5 days)

Today each workspace has a user `whoobe_<slug>`, but it is the `POSTGRES_USER` of the workspace's own cluster, so it is a **superuser** of that cluster: every service can do DDL, read every table and ignore any policy. The blast radius is one workspace, which the one-workspace-per-organisation decision already accepts, but inside it nothing is separated.

| Step | What | Notes |
|---|---|---|
| 2.1 Migration role | `DB_MIGRATION_USER` / `DB_MIGRATION_PASSWORD` (optional): `bootstrap.ts` runs `migrate` with it, then core-api works with the application role, which has no DDL right. | Without the variables, nothing changes. Upgrade stays "restart core-api". The runtime role needs the grants of every table a migration creates: a migration helper (or default privileges on the schema) keeps them in step. |
| 2.2 Gateway role | `SELECT` on the tables the public routes read, `INSERT` on form submissions, nothing else. | The gateway is its own process, so this is the cheap one. List its tables from its queries; a test runs the gateway suite with the restricted role. |
| 2.3 Asset-processor role | Its own tables only (assets, folders, jobs). | Same method. |
| 2.4 core-api public routes | A read-only role for `/public/*` in a second pool inside core-api. | The costly one: the routes live in the process that also serves staff. Decide after 2.1-2.3 whether it is worth it. |

Provisioning (`provision-workspace.sh`) creates the roles and writes their passwords to the env file; the backup and restore scripts keep working with the owner role. The security suite gains a test per role: the role cannot read what it should not, cannot alter schema, cannot write outside its tables.

## 3. Row-level security (not now)

Reasons to wait:

- A policy reading `current_setting('whoobe.current_user_role')` trusts the application to set it; an injection running with the same role can set it too. The protection exists only when the anonymous path connects with a **different role that cannot change the setting**, which is what section 2 gives.
- The overview's example names a `contents` table with a `status` column; the schema has about 96 tables and the draft/published state lives in the object and version tables.
- The code does not open a transaction per request; `SET LOCAL` for the request context would mean wrapping each request in one.
- Between workspaces RLS adds nothing: each has its own database.

Revisit when there is a concrete requirement for draft/published visibility enforced in the database, after 2.2 and 2.4. First step then: one table (the public object list) with a policy for the anonymous role, behind a flag, with a test that the role sees no draft.

## 4. Migrations: verify, do not assume (0.5 day)

- Check whether `drizzle-orm`'s migrator (version in `pnpm-lock.yaml`) runs the pending migrations in one transaction, and write the answer in `upgrade-and-migrations.md`.
- Keep the expand-only rule and the dump before an upgrade as the guarantee; do not promise automatic rollback.
- A migration that needs `CREATE INDEX CONCURRENTLY` runs outside the transaction, by its own step, and the page says so.

## 5. Order

1. Section 1 (policy).
2. Section 4 (the check).
3. 2.1, then 2.2 and 2.3.
4. 2.4 and section 3 only on a concrete requirement.

Level 1 total: about 5-7 days, none of it needed for the private-network profile.
