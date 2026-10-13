# For DevOps and operators

## Your questions
| Question | Answer and where |
|---|---|
| How do I install it? | [Creating workspaces](../operations/creating-workspaces.md): `scripts/provision-workspace.sh`, TLS, first administrator |
| What is the order of things? | [Operations: start here](../operations/README.md) |
| What does each variable do? | [Configuration reference](../operations/configuration-reference.md) |
| Which secrets exist and how do I rotate them? | [Secrets and keys](../operations/secrets-and-keys.md) |
| What is encrypted, and how do backups work? | [Encryption](../operations/encryption.md), [backup, restore and DR](../operations/backup-restore-and-dr.md) |
| How do I upgrade, and roll back? | [Upgrade and migrations](../operations/upgrade-and-migrations.md); migrations run when core-api starts |
| What do I monitor? | [Observability and logging](../operations/observability-and-logging.md): health endpoints and logs; no metrics endpoint |
| How much load can it take? | [Capacity and scaling](../operations/capacity-and-scaling.md) (no load test has been run) |
| How do I run shared rate limits across gateway processes? | Optional Valkey: [API clients, section 9](../communication/api-clients.md) |
| How do I create a demo instance? | [Public sandbox](../operations/sandbox.md) |
| Which object stores work? | [Object storage](../operations/storage-backends.md) |

## Runbooks never rehearsed
Restore on a new host, upgrade, workspace removal and re-creation are written from the code and not yet run end to end: rehearse each once and record the date.
