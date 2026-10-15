# Upgrading and migrations

How a workspace is moved from one release to the next, what happens to the database, and how to go back. Release
numbering and support policy: [release process](../release-process.md). **Status: the upgrade path is written from the
code and has not been tested end to end** - release 0.1.0 is the first release, so there is no earlier version to
upgrade from, and the automated upgrade test is still listed as missing in the release process. The first real upgrade
(0.1.0 → 0.2.0) is the test; follow this page with a fresh backup and a scratch copy first.

## 1. What changes between releases

| Layer | How it changes | Who applies it |
|---|---|---|
| Application code and images | new git tag; `docker compose up -d --build` rebuilds the five images | operator |
| Database schema | SQL files in `packages/core/drizzle/`, listed in `meta/_journal.json`; applied **automatically by core-api when it starts** (drizzle `migrate`, in journal order, each once) | core-api |
| Data backfills | idempotent code at start (for example encryption of an old plaintext secret) | core-api |
| Configuration | new or changed environment variables, new defaults | operator, from the release notes and `.env.example` |
| Edge configuration | the nginx routing template (`deploy/nginx/_locations.conf.template`) | operator: `scripts/render-workspace-nginx.sh <slug>` per workspace |
| Browser builds | `VITE_*` values are baked into the images | rebuild |

## 2. Migration policy

- Migrations are **plain SQL, forward only**; there is no down migration and no tool to undo one.
- Since the mail-provider work (migration 0050) the rule is **expand only** inside a release: new tables, new columns
  that are nullable or have a default, `CREATE … IF NOT EXISTS`. A column that stops being used stays until a later
  release has been through the backfill, then a separate migration drops it. Examples: 0050 (mail providers), 0051
  (`locked` on snippets), 0052 (`form_uploads`).
- Earlier migrations (0000-0044) are the development history of 0.1.0 and include destructive steps: 0035 drops and
  recreates `ai_settings` (per user), 0017 renames `menus` to `website_paths`, 0044 adds a unique page slug per website
  (it **fails if duplicate slugs exist** in a database that predates it). They matter only for installations that ran a
  development build; a fresh 0.1.0 install applies them to an empty database.
- Consequence for rollback: because new releases only expand, the **previous application version keeps working on the
  newer schema** for one step. Data written by the new version in new columns is ignored by the old one.
- A migration that fails stops core-api at start (the container restarts in a loop; asset-processor and gateway wait for
  its health). The failed statement is in the core-api log.
- **No lock**: never start two core-api processes against a database that needs migrating.

## 3. Upgrade procedure (one workspace)

Before: read the release notes of every version you skip ("Behaviour changes to check"), and check the support window
(security fixes only for the latest two minor versions).

1. **Back up**: `BACKUP_AGE_RECIPIENT=… ./scripts/backup-workspace.sh <slug>` and a bucket sync; run
   `restore-workspace-db.sh --check` on the new file. Note the running tag (`git describe`) and the image ids
   (`docker compose -p ws-<slug> images`).
2. **Rehearse** on a scratch workspace restored from that backup (see [backup](backup-restore-and-dr.md) section 5) with
   the new tag; log in and click through. Mandatory for a minor release while the version starts with `0.`.
3. **Fetch the release**: `git fetch --tags && git checkout vX.Y.Z`.
   On a host without a `.git` directory (code copied with `git archive`), do **not** unpack the new tag over the old
   tree with `tar -x`: files removed in the new release stay behind and can break the build (a leftover source file
   that imports a dependency no longer declared failed the `admin-dashboard` / `whoobe-one-spike` build when 0.1.0 was
   deployed over a pre-release tree). Unpack the tag into an empty directory and mirror it, keeping the files that
   exist only on the host:
   ```bash
   git archive vX.Y.Z | tar -x -C /tmp/release-vX.Y.Z      # on the machine that has the repository, then copy it over
   rsync -rt --delete --exclude='/.env*' --exclude='/deploy/certbot' \
     --exclude='/deploy/nginx/_locations-*.inc*' --exclude='/deploy/nginx/*.conf' \
     --exclude=node_modules --exclude=dist --exclude=.svelte-kit \
     /tmp/release-vX.Y.Z/ <host>:/opt/whoobe/whoobe_cms/
   ```
   Run it once with `-n --itemize-changes` first and read the `*deleting` lines. If the host keeps other files of its
   own inside the tree, add an `--exclude` for them.
4. **Configuration**: compare `.env.example` with the workspace's env file for new variables
   (`diff <(grep -oE '^#? ?[A-Z][A-Z0-9_]+=' .env.example | tr -d '# ' | sort -u) <(grep -oE '^[A-Z][A-Z0-9_]+=' .env.<slug> | sort -u)`),
   add what the release notes require (for 0.1.0: `MAIL_SETTINGS_ENCRYPTION_KEY`, `UPLOAD_TOKEN_SECRET`,
   `TOTP_ENCRYPTION_KEY`) **with newly generated values, never copied from another workspace**; read the
   [configuration reference](configuration-reference.md) for changed defaults.
5. **Build and start**: `docker compose -p ws-<slug> --env-file .env.<slug> up -d --build`. Expect a short outage: the
   containers are recreated; core-api runs the migrations; the others wait for it.
6. **Edge**: if the nginx template changed (release notes say so), `./scripts/render-workspace-nginx.sh <slug>`
   (shows the diff, keeps `.inc.bak`, reloads nginx).
7. **Verify**: all containers `healthy`; log in; open and save a page; open a public page and an image; send a test
   form; read the core-api log for migration or backfill warnings; run the manual checks of the release notes.
8. **Record** the new tag and the date next to the workspace's backup.

For a fleet of workspaces: do one canary, wait a day, then the rest; they are independent stacks, so a failed upgrade
affects one customer.

## 4. Rollback

| Situation | Action |
|---|---|
| New release misbehaves, schema changed only by expansion | `git checkout <previous tag>`, `docker compose … up -d --build`; the old code runs on the new schema |
| A migration failed half-way, or the release contained a destructive step, or data was corrupted | stop the apps, `restore-workspace-db.sh <slug> <dump from step 1>`, check out the previous tag, rebuild. Data created since the backup is lost |
| Only configuration was wrong | restore the previous env file (keep a copy in step 1) |
| Only nginx changed | `cp deploy/nginx/_locations-<slug>.inc.bak deploy/nginx/_locations-<slug>.inc` and reload |

## 5. Supported paths

Only upgrades between consecutive minor versions (0.1 → 0.2 → 0.3) are the intended path; skipping versions applies all
migrations in order and is probably fine but is not what will be tested. Downgrading across a minor version is not
supported without a restore.

## 6. What is missing

- The automated upgrade test (install N-1, load data, upgrade, check migrations and a login) - the most valuable gate
  not yet built.
- A migration lock and a way to run migrations as a one-off job before the application starts.
- A compatibility statement for the API (the API reference is generated per release; there is no versioned URL or
  deprecation policy while the version starts with `0.`).
- A published changelog per release with the exact migration range (derive it from `CHANGES.md` and the journal).
