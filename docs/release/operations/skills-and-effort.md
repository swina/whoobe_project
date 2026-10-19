# Who can run and maintain Whoobe: skills and effort

Whoobe is self-hosted: nobody patches, backs up or monitors it for you. This page says which skills that takes, what the regular work is, and
what is better not to leave to a single person. The effort figures are **estimates from running it ourselves** (a few workspaces on one host),
not measurements; use them to plan, then correct them with your own numbers.

## What you are running

Five application containers (core API, asset processor, gateway, admin dashboard, editor), PostgreSQL 16 and an S3-compatible store (Garage, or
your own bucket), behind nginx. One installation is one **workspace** for **one organisation**; many can share a host. Everything is started by
Docker Compose and the scripts in `scripts/`; there is no Kubernetes, no managed service and no agent to install. See the
[architecture overview](../architecture/architecture-overview.md).

## The profiles

| Profile | What they do | Skills that matter |
|---|---|---|
| **Operator / DevOps** (the one you cannot do without) | Installs workspaces, patches the host, upgrades Whoobe, takes and restores backups, renews certificates, watches health, answers an incident | Linux administration and ssh; Docker and Compose (logs, volumes, rebuilds); nginx as a reverse proxy and TLS (Let's Encrypt); PostgreSQL basics (`pg_dump`, restore, reading a failed migration); cron or systemd timers; an S3 store (buckets, keys); handling secrets and encryption keys; reading logs |
| **Developer (integrations and sites)** | Connects Whoobe to the ERP/CRM/mail, writes the site front end, builds automations on the events | JavaScript/TypeScript and REST (the API is described by `openapi.yaml`); for a published site Next.js, Nuxt or Vue (or plain static HTML for documentation sites); webhooks and HMAC signatures; the automation engine you chose (Whoobe is [engine-neutral](../communication/object-events.md)) |
| **Platform developer** (only if you change Whoobe itself) | Adds a feature, fixes a bug, writes a provider | TypeScript, Node.js/Express, a pnpm monorepo, Vue 3 and Pinia (dashboard), Drizzle ORM and SQL migrations, vitest and Playwright. The [security test suite](../security/security-test-suite.md) is the safety net: a change has to keep it green |
| **Data owner / editor** | Models data classes, writes pages, manages files | No code: the dashboard and the [user manual](../guides/user-manual/README.md) |
| **Security / compliance contact** | Reviews roles, two-factor and sign-in rules, the audit log, retention, data subject requests | The [security documentation](../security/README.md) and the product's screens under *Security*; knowledge of your own policies |

One person can cover Operator and Developer on a small installation. Platform developer is a different job: if you only configure and
integrate, you never open the source.

## The regular work

| When | Task | Rough effort |
|---|---|---|
| Every night (automatic) | Backup, copy elsewhere, freshness check: [scheduling backups](scheduling-backups.md) | none once installed; a few minutes to look at an alert |
| Weekly | Look at health and the system log, disk space, that the newest backup is recent, pending operating system updates | 15 to 30 minutes |
| Monthly | Operating system and Docker updates with a planned restart; test that a backup can be read (`restore-workspace-db.sh --check`); review accounts and roles; certificate renewal check | 1 to 2 hours |
| Each Whoobe release | Read the [release notes](../release-process.md), back up, upgrade, re-render the nginx include if the notes say so, check the screens that changed: [upgrade and migrations](upgrade-and-migrations.md) | about 1 hour per workspace, plus reading; more if the notes list behaviour changes |
| Each quarter | Restore into a scratch workspace and log in; review secrets and keys that should rotate ([secrets and keys](secrets-and-keys.md)) | half a day |
| New workspace or client | [Creating workspaces](creating-workspaces.md): provision, DNS, TLS, first administrator, mail, backup timer | 1 to 2 hours once the host is ready |
| An incident | Restore, rollback (restore from backup: migrations are not undone), certificate expiry, a full disk, a provider outage | depends on the runbook you rehearsed |

## What to be careful about

- **A single person is a risk.** Keys, the backup decryption key and the ssh access should each be held by at least two people. Without the
  backup key every backup is unreadable by design; without `.env.<slug>` stored secrets cannot be decrypted.
- **Upgrades are yours to schedule.** Migrations run when core-api starts and the product does not roll them back: always back up first. Skipping many
  releases makes the next upgrade bigger; upgrading each release keeps each step small.
- **Monitoring and alerts are yours to add.** The product exposes health and (optionally) Prometheus metrics and keeps logs; it does not page anyone.
- **A change of provider or engine is development work.** The CDN, mail and automation engines are the operator's choice; Whoobe supports the ones listed
  in the guides and does not excuse any of them from being kept up to date.
- **What has not been rehearsed by you has not been rehearsed.** The restore, the upgrade and the removal of a workspace are tested by scripts on our side;
  the first time on your host and your data is the real test. Do it before you need it.

## If you do not have these people

- **No one to run a server:** Whoobe is not a fit as a self-hosted product; ask a technical partner to run it for you, or use it for a short-lived
  or internal purpose until you do.
- **An operator but no developer:** you can run it and use the dashboard, the editor and the published sites; integrations with other systems wait for
  someone who can write against the API.
- **A developer but no operator:** common and risky; the application will work and nobody will notice the full disk or the failed backup. Put the
  [backup schedule and its check](scheduling-backups.md) in first and give someone the weekly list.
