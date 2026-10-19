# For DevOps and operators

## Your questions
| Question | Answer and where |
|---|---|
| Who do I need, and how much work is it? | [Skills and effort](../operations/skills-and-effort.md) |
| How do I install it? | [Creating workspaces](../operations/creating-workspaces.md): `scripts/provision-workspace.sh`, TLS, first administrator |
| What is the order of things? | [Operations: start here](../operations/README.md) |
| What does each variable do? | [Configuration reference](../operations/configuration-reference.md) |
| Which secrets exist and how do I rotate them? | [Secrets and keys](../operations/secrets-and-keys.md) |
| What is encrypted, and how do backups work? | [Encryption](../operations/encryption.md), [backup, restore and DR](../operations/backup-restore-and-dr.md) |
| How do I upgrade, and roll back? | [Upgrade and migrations](../operations/upgrade-and-migrations.md); migrations run when core-api starts |
| What do I monitor? | [Observability and logging](../operations/observability-and-logging.md): readiness (`/health`) and liveness (`/health/live`), logs, and Prometheus metrics that stay off until `METRICS_TOKEN` is set; nothing sends alerts |
| How much load can it take? | [Capacity and scaling](../operations/capacity-and-scaling.md) (one load test on a development machine, 2026-10-18; yours will differ) |
| How do I run shared rate limits across gateway processes? | Optional Valkey: [API clients, section 9](../communication/api-clients.md) |
| How do I create a demo instance? | [Public sandbox](../operations/sandbox.md) |
| Which object stores work? | [Object storage](../operations/storage-backends.md) |

## Runbooks: what has been run, and what is yours to rehearse
Run by scripts on a throwaway workspace: the restore of a destroyed workspace (`scripts/restore/rehearse.sh`, last passed 2026-10-20) and the upgrade from the previous release (`scripts/upgrade/upgrade-test.sh`, v0.1.1 to v0.2.0). The upgrade of the public host was done by hand on 2026-10-19. What no one has run for you: a restore on **your** host with **your** data, and your own timings. Rehearse each once and record the date.
