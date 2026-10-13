# One workspace per organisation

## Decision
An installation (a **workspace**) serves **one organisation**. Divisions of the same legal entity share a workspace and are told apart with
roles. Different companies, customers or legal entities each get their **own** workspace: own database, own storage bucket, own secrets, own
containers, own host name. Whoobe is not a shared multi-tenant platform.

## Why
- **Isolation is stronger when it is structural.** Two workspaces share nothing but the host. A mistake in a query, a role or a permission in
  one cannot expose the data of the other, because the data is not there. A shared installation would rest that guarantee on application code
  alone, on every table and every route.
- **No tenant plumbing to get wrong.** There is no tenant column, no per-tenant quota, no per-tenant key and no tenant-aware cache. The code that
  runs is the same single-tenant code, which is simpler to review and test; the isolation test suite checks that credentials and data of one
  stack do not work in the other.
- **Fits how organisations buy.** An organisation wants its own data, keys, upgrade timing and backups. A hosting provider or agency serves many
  clients by running many workspaces (`scripts/provision-workspace.sh`), each independent.
- **It lets the rest stay simple.** Credentials, integrations, engines (Activepieces, n8n) and identity providers belong to the organisation, so
  they are configured once per workspace with no multi-tenant isolation to design.

## What it costs
- **A website inside a workspace is not a security boundary.** Roles and permissions are workspace-wide: anyone who may edit pages may edit the
  pages of every website of the workspace. Roles describe *function* (editor, publisher, administrator), not *division*. If a division must be
  fenced off from another, that needs a separate workspace; per-website permissions are not implemented.
- **More installations to operate** when you have many clients: each has its own upgrade, backup and monitoring (the scripts make creating,
  backing up and removing one routine, see [creating workspaces](../../operations/creating-workspaces.md)).
- **No cross-workspace features:** no shared users, no shared media library, no central console.

## When to revisit
Only if a single installation must serve unrelated entities with strict mutual isolation: that needs a different architecture (row-level
tenancy, tenant-scoped keys, per-tenant limits), not a configuration switch.

## Where it shows in the product
[Architecture overview, section 7](../architecture-overview.md); the provisioning, backup and removal scripts in
[operations](../../operations/creating-workspaces.md); the plan [`workspaces-plan.md`](../../../plans/system/workspaces-plan.md).
