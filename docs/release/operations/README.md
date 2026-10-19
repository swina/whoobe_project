# Operations: start here

Running Whoobe: installing a workspace, configuring it, securing it, backing it up, upgrading it and watching it. Written for operators and DevOps.

## The path for a new installation

1. **Understand the shape.** [Architecture overview](../architecture/architecture-overview.md) (what runs, ports, routing), and the
   [deployment model](../architecture/design-decisions/one-workspace-per-organisation.md): one workspace per organisation.
2. **Create a workspace.** [Creating workspaces](creating-workspaces.md) is the tested install: `scripts/provision-workspace.sh`, TLS, first administrator.
3. **Configure.** [Configuration reference](configuration-reference.md) (every variable) and [secrets and keys](secrets-and-keys.md) (what protects what, rotation).
4. **Protect.** [Encryption](encryption.md) and encrypted backups; [backup, restore and DR](backup-restore-and-dr.md); rehearse the restore once.
5. **Watch.** [Observability and logging](observability-and-logging.md).
6. **Size and scale.** [Capacity and scaling](capacity-and-scaling.md).
7. **Keep it current.** [Upgrade and migrations](upgrade-and-migrations.md) and the [release process](../release-process.md); read the [release notes](../release-notes-0.1.0.md) before installing over a development setup.

## All documents

| Document | Purpose |
|---|---|
| [Creating workspaces](creating-workspaces.md) | Create, secure, back up, restore and remove a workspace |
| [Configuration reference](configuration-reference.md) | Every environment variable, by area |
| [Secrets and keys](secrets-and-keys.md) | Inventory of secrets, lost or leaked, how to rotate |
| [Encryption](encryption.md) | At rest, in transit, backups, answers for a questionnaire |
| [Backup, restore and DR](backup-restore-and-dr.md) | What to recover and a runbook |
| [Audit log](audit-log.md) | Who changed what: what is recorded, how to read it, retention |
| [Single sign-on](single-sign-on.md) | Staff sign in with Keycloak, Entra, Okta or Google (OpenID Connect): set-up, roles, deprovisioning |
| [Upgrade and migrations](upgrade-and-migrations.md) | Moving to the next release, going back |
| [Capacity and scaling](capacity-and-scaling.md) | What one workspace can do; what limits replicas |
| [Observability and logging](observability-and-logging.md) | What is recorded, what can be monitored, what is not available |
| [Object storage](storage-backends.md) | S3 stores that work |
| [Public sandbox](sandbox.md) | The restricted demo profile, rebuilt every three hours |
| [Deployment guide (bare metal)](deployment.md), [miniguide](miniguide-deployment.md) | Native-service installs under PM2; **not re-verified**, the container workspace is the tested path |

## Not covered yet

Kubernetes manifests, a high-availability reference architecture, a managed-database compose variant (use `DB_HOST` and `DB_SSL`), rehearsed
runbooks for restore on a new host, upgrade and workspace re-creation.
