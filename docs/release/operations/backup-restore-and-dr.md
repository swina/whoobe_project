# Backup, restore and disaster recovery

What has to be recoverable, what the product gives you to do it, what it does **not** give you, and a runbook for the
usual disasters. The encrypted-backup mechanics (age/GPG, key custody) are in [encryption](encryption.md#encrypted-backups);
this page is about completeness and recovery. Recovery objectives are **not** defined by the product: they follow from
how often you run the steps below.

## 1. What a workspace consists of

| Part | Where | Recreated from | Backed up by |
|---|---|---|---|
| Database | PostgreSQL volume `pgdata` | nothing: it is the system of record | `scripts/backup-workspace.sh` (`pg_dump \| gzip \| age`) |
| Assets and logs | the S3 bucket (Garage volume `garagedata`, or an external bucket) | nothing | **not scripted**: provider versioning/replication, or `rclone`/`mc`/`aws s3 sync` into encrypted storage |
| Secrets and keys | `.env.<slug>` | nothing (without it encrypted values are unreadable) | `backup-workspace.sh` (`.env.<slug>.age`, unless `--no-env`) |
| Application | the git tag and the images | `git checkout vX.Y.Z`, `docker compose up -d --build` | the repository; keep the tag/digests of what ran |
| Edge configuration | `deploy/nginx/_locations-<slug>.inc`, the vhost files, certificates | `provision-workspace.sh`, `render-workspace-nginx.sh`, `enable-tls.sh` | rebuilt by the scripts; keep any local edits and `/etc/letsencrypt` |
| Published sites / mobile apps | generated output elsewhere | regenerated from the CMS with `publish-site.sh` / `publish-mobile.sh` | the customer's own hosting |

The database and the bucket must be restored **to the same moment** as closely as you can: asset records point to
object keys, and a record without its object (or an object without a record) is a broken asset, not data loss of the
rest. Form uploads waiting in `private/_uploads/` are disposable (they expire after two hours).

## 2. What is provided

| Tool | Does | Does not |
|---|---|---|
| `scripts/backup-workspace.sh <slug>` | encrypted dump of the database and of `.env.<slug>`, `--keep N` pruning, refuses to run without a recipient | back up the bucket, the nginx files, certificates or logs; run itself (use cron/systemd timer) |
| `scripts/restore-workspace-db.sh --check <file>` | decrypts and test-reads a backup without touching a workspace or Docker | |
| `scripts/restore-workspace-db.sh <slug> <file>` | drops and recreates the workspace database from the dump after you type the slug | restore the bucket or the env file; run while the apps are up (stop them first) |
| Page/snippet history (`content_versions`, the editor's *History*) | undo of editing mistakes inside the application | protect against deletion of the whole object or table |
| Website export (`.zip` bundle) | portable copy of one website (pages, snippets, module pages, data classes and objects, asset files) | users, roles, gateway endpoints/keys, mail and AI settings, domains, version history (see [website bundle](../guides/website-bundle.md)) |
| `docker compose down` / `scripts/remove-workspace.sh` | remove a workspace (with `-v` the volumes): **destructive**, asks for the slug | |

Not provided: point-in-time recovery (WAL archiving, `pg_basebackup`), replication or a standby, backup monitoring or
alerting, an automated restore test, scripted bucket backup.

## 3. A backup plan that covers everything

Per workspace, daily unless the business needs better:

1. `BACKUP_AGE_RECIPIENT=age1… ./scripts/backup-workspace.sh <slug> --out-dir /var/backups/whoobe --keep 14` (cron, 03:00).
2. Bucket: versioning + cross-region replication (cloud S3), or `rclone sync` of the bucket to an encrypted location
   (Garage). Run it **right after** step 1 so the two are as close as possible.
3. Copy everything off the host (object storage with versioning or object lock, a second site). The files are encrypted,
   so the copy can be on infrastructure you do not fully trust.
4. Keep the backup **private key off the host** and with a second person.
5. For a database larger than a few GB or an RPO below a day: use your database platform's own PITR (managed PostgreSQL,
   WAL archiving) and point `DB_HOST`/`DB_SSL` at it.
6. Once a month, restore into a scratch workspace (section 5) and log in: a backup nobody restored is unverified.

Rough sizing: the dump is small (JSON content, a few MB to some hundreds of MB); the bucket is large (assets).

## 4. Recovery objectives you can promise

| With this plan | RPO (data you can lose) | RTO (time to be back) |
|---|---|---|
| nightly encrypted dump + nightly bucket sync | up to about 24 h | hours: provision, restore, point DNS; dominated by bucket size |
| managed PostgreSQL with PITR + versioned/replicated bucket | minutes | an hour or less once a runbook has been rehearsed |
| no backup | everything | rebuild from the repository and re-enter content |

Nothing is measured by the product; these are consequences of the plan, to be confirmed by your own restore test.

## 5. Runbook: restore a workspace on a new host

Prerequisites: Docker + Compose, the repository at the tag that ran, `age` and the private key, the encrypted files.

1. `git checkout vX.Y.Z` (the version recorded for the workspace). Restoring into an **older** version than the dump's
   schema is not supported; into a newer one is the normal upgrade path (migrations run at start) but has **not yet been
   tested end to end** ([upgrade](upgrade-and-migrations.md)).
2. Decrypt the env file: `age -d -i key.txt <slug>-….env.age > .env.<slug>`; `chmod 600 .env.<slug>`. Check
   `WHOOBE_HOSTNAME`, `ADMIN_PUBLIC_URL` and the ports for the new host. Do **not** generate new keys: the restored
   data needs the old ones.
3. Create the stack without the application: `docker compose -p ws-<slug> --env-file .env.<slug> up -d postgres garage`
   (or only `postgres` with an external bucket). Garage creates the bucket and key named in the env file.
4. Restore the bucket contents into it (your sync tool, with the workspace's S3 key).
5. `AGE_IDENTITY=key.txt ./scripts/restore-workspace-db.sh --check <dump>`, then
   `./scripts/restore-workspace-db.sh <slug> <dump>`.
6. Start everything: `docker compose -p ws-<slug> --env-file .env.<slug> up -d --build`. core-api applies any newer migrations.
7. Edge: `./scripts/render-workspace-nginx.sh <slug>`, the vhost from `workspace.conf.template`, `./scripts/enable-tls.sh <slug>`;
   DNS to the new host.
8. Verify: log in, open a page in the editor, open a public page, load an image, submit a test form, check
   `docker compose … ps` shows `healthy`, check the core-api log for migration errors.
9. Revoke old sessions if the old host may be compromised (see [secrets and keys](secrets-and-keys.md)).

## 6. Scenarios

| Scenario | Action |
|---|---|
| Container or host crash | `docker compose up -d`; volumes survive; data loss none |
| Host lost | section 5 on a new host |
| Database corrupted or a bad migration | stop the apps, `restore-workspace-db.sh` from the last good dump; a migration cannot be undone any other way (expand-only policy means the old code still runs on the new schema for one step) |
| Page or snippet edited by mistake | editor *History* (version restore) |
| Object, page or website deleted by mistake | no undelete: restore the dump into a scratch workspace and export/import the website bundle, or copy the rows |
| Bucket lost or an asset deleted | restore from versioning/replication/sync; records without objects show broken images until then |
| Ransomware / destructive operator | backups are encrypted and off-host; use object lock or versioning with a separate account for the copies |
| Encryption key (`.env`) lost | restore it from the backup; if there is none, restore the data and re-enter credentials ([secrets and keys](secrets-and-keys.md) section 6) |
| Backup key lost | the backups are unreadable by design; this is the failure the second custodian exists for |
| Provider region outage | only recoverable with a replicated bucket and a restored database elsewhere (section 5) |
| Certificate expired | `scripts/renew-certs.sh`; check the cron job |

## 7. Monitoring the backups

Nothing in the product alerts on a failed backup. At minimum: have the cron job mail on non-zero exit, alert when the
newest file in the backup folder is older than 26 hours, and keep the monthly restore test in a calendar. The script prints the file
names it wrote and prunes only with `--keep`.
