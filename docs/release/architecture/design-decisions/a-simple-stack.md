# A simple stack

## Decision
Whoobe runs as five application containers (core API, asset processor, gateway, admin dashboard, editor) plus **PostgreSQL** and an
**S3-compatible object store**. There is no message queue, no cache service and no search engine. Search is done inside the application,
background work is a few timers inside the services, and the three backends share one database schema through a shared library instead of
calling each other over an internal RPC layer. One optional extra, **Valkey**, holds shared rate-limit counters when you run several gateway
processes.

## Why
- **Fewer things to run, secure and back up.** Every extra service is something to patch, monitor, restore and explain to a reviewer. For the
  size of workload a workspace serves, PostgreSQL and S3 are enough.
- **One state to restore.** Backup and disaster recovery are a database dump and a bucket, nothing else ([backup and DR](../../operations/backup-restore-and-dr.md)).
- **Boring technology.** Node.js, PostgreSQL, nginx and S3 are widely known; any IT team can operate them without a new skill set.
- **Optional parts stay optional.** Valkey is a Compose profile you turn on only when you need counters shared between gateway processes; without it the
  limits are counted in the process and everything works.

## What it costs
- **Scaling is vertical first.** There is no horizontal scaling story for the stateful pieces yet ([capacity and scaling](../../operations/capacity-and-scaling.md)).
- **Long work runs inside request-serving processes.** Without a queue, a heavy job competes with requests; the product keeps such work small or
  moves it to build-time tools (publishing, imports).
- **Search is basic.** It covers published pages, objects and assets, not a full-text engine with ranking tuning.

## When to revisit
When a workspace's load or availability needs exceed what one node and one database can do; the likely first additions are a job queue and
a search service, kept optional like Valkey.

## Where it shows in the product
[Architecture overview](../architecture-overview.md) sections 1 and 4, [configuration reference](../../operations/configuration-reference.md)
(`GATEWAY_RATE_LIMIT_BACKEND`), `docker-compose.yml`.
