# Scheduling backups

[Backup, restore and DR](backup-restore-and-dr.md) says what has to be recoverable and gives the tools. This page makes them
run by themselves: a nightly job on the host that runs the workspace, a second machine that keeps its own copy, and a check that
tells you when a night was missed. The product does not schedule anything on its own; without this page's steps nothing is
backed up between two upgrades.

## The design

```
workspace host                                     another machine of yours
──────────────                                     ────────────────────────
03:00  nightly.sh                                  04:30  pull.sh
       dump + env file, encrypted with age  ──ssh──►      keeps the files, prunes after 30 days,
       copy of the bucket                                 optionally copies them into an S3 bucket
       marker "last success"                              check: is the newest backup recent?
```

- **The copy is pulled, not pushed.** The workspace host has no credentials for the second machine, so someone who takes over the
  host cannot delete or encrypt the copies. It also means no port is opened on the second machine: it connects out, with an ssh key
  that can only read the backup folder.
- **Dumps are encrypted before they reach a disk** (age, or GnuPG). The decryption key is not on the host and not on the machine that
  keeps the copies; the first one that holds it is the machine on which you restore.
- **The bucket copy is not encrypted** (it holds the same files that are in the live bucket on the same disk). It travels over ssh. If
  the second machine is shared or its disk is not encrypted, put the folder on an encrypted volume.
- Nothing is deleted on the host by the pull, and the pull only copies or adds to an S3 bucket (never `sync`), so a mistake or an
  attack on the host cannot empty the copies.

## 1. The key (once, on the machine where you will restore)

```bash
sudo apt install age                       # or download the binary from github.com/FiloSottile/age/releases
umask 077 && age-keygen -o ~/whoobe-backup.key
# prints:  Public key: age1...
```

Only the **public** key (`age1…`) goes to the host. Keep `whoobe-backup.key` in a password manager or on a USB key, and give a
copy to a second person: without it every backup is unreadable, by design.

## 2. On the workspace host

Settings file, read by the script and by the timer (`/etc/whoobe/backup.env`, mode 600):

```bash
sudo install -d -m 755 /etc/whoobe
sudo tee /etc/whoobe/backup.env >/dev/null <<'EOF'
BACKUP_AGE_RECIPIENT=age1...your public key...
BACKUP_DIR=/home/ubuntu/backups/nightly
BACKUP_KEEP=14
EOF
sudo chmod 600 /etc/whoobe/backup.env
```

Try it once by hand, then check the result:

```bash
cd /opt/whoobe/whoobe_cms
./scripts/backup/nightly.sh dashboard
./scripts/backup/check.sh /home/ubuntu/backups/nightly dashboard
ls -la /home/ubuntu/backups/nightly/db
```

`nightly.sh` writes, under `BACKUP_DIR`: `db/<slug>-<stamp>.sql.gz.age` and `db/<slug>-<stamp>.env.age` (the last `BACKUP_KEEP`),
`bucket/<slug>-bucket/` (a mirror of the bucket) and `<slug>.last-success` (the time when both succeeded). With an external S3
bucket set `BACKUP_S3_ENDPOINT` as in [backup, restore and DR](backup-restore-and-dr.md#2-what-is-provided); with a managed S3 that
has its own versioning and replication the bucket step can be left to the provider.

Schedule it with a systemd timer (examples in `scripts/backup/systemd/`; change `User`, the path and the time):

```bash
sudo cp scripts/backup/systemd/whoobe-backup@.service scripts/backup/systemd/whoobe-backup@.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whoobe-backup@dashboard.timer
systemctl list-timers 'whoobe-backup@*'
```

`Persistent=true` runs a missed night when the host comes back. One timer per workspace (`whoobe-backup@<slug>.timer`). The same
with cron: `0 3 * * * cd /opt/whoobe/whoobe_cms && ./scripts/backup/nightly.sh dashboard >> /home/ubuntu/backup.log 2>&1`.

## 3. On the machine that keeps the copies

An ssh key used only for this, so that it can be limited. On the second machine: `ssh-keygen -t ed25519 -f ~/.ssh/whoobe_backup -N ''`,
and on the host add the public key to `~/.ssh/authorized_keys` with a restriction so that it can do nothing else:

```
restrict,command="rrsync -ro /home/ubuntu/backups/nightly" ssh-ed25519 AAAA... backup-pull
```

(This restriction is not exercised by the self-test; try the pull by hand after setting it. `rrsync` comes with the `rsync` package: `/usr/bin/rrsync`, in some distributions `/usr/share/doc/rsync/scripts/rrsync` to copy to
`/usr/local/bin`. It makes the key read-only and confined to that folder. Then `PULL_REMOTE_DIR` is `/`.)

Settings (`/etc/whoobe/pull.env`, mode 600):

```bash
PULL_REMOTE=ubuntu@dashboard.example.org
PULL_REMOTE_DIR=/                       # with rrsync; without it, the BACKUP_DIR of the host
PULL_SLUG=dashboard
PULL_LOCAL_DIR=/srv/whoobe-backups
PULL_RETAIN_DAYS=30
PULL_SSH_OPTS="-i /home/me/.ssh/whoobe_backup"
```

Run it once by hand (`scripts/backup/pull.sh`), then schedule it with `scripts/backup/systemd/whoobe-backup-pull.service` and
`.timer` (after the host's 03:00 run; set `User` and the path), or cron.

`pull.sh` brings the dumps, the bucket copy and then the marker, checks that the source is recent **before** deleting anything,
and removes local dumps older than `PULL_RETAIN_DAYS`, always keeping the newest three.

### Into an S3 bucket (for example a Garage of your own)

Add to `pull.env` and the same files are copied there too (needs Docker on that machine):

```bash
PULL_S3_ENDPOINT=http://localhost:3900
PULL_S3_BUCKET=whoobe-backups
PULL_S3_KEY=GK...
PULL_S3_SECRET=...
PULL_S3_REGION=garage
```

Create the bucket and a key with its tools (for Garage: `garage bucket create`, `garage key create`, `garage bucket allow`).
Garage has **no object versioning and no object lock**: the pull only adds, and removes dumps older than `PULL_RETAIN_DAYS` under
`db/`; protect the bucket's key like any other secret. A provider with versioning or object lock (S3, R2, B2) protects better.

Other destinations are the same thing with another tool: the encrypted files in `PULL_LOCAL_DIR/db` can be copied wherever you
keep archives.

## 4. Know when a night is missed

`scripts/backup/check.sh <dir> <slug> [hours]` exits non-zero when the marker is missing or older than the limit (26 hours by
default) or the newest dump is missing or empty. It is the last step of `pull.sh`, so a failed pull shows as a failed unit. Use it also
where you already watch things:

```bash
# on the host, mail on failure (needs a working mail command)
*/30 * * * * /opt/whoobe/whoobe_cms/scripts/backup/check.sh /home/ubuntu/backups/nightly dashboard 26 || echo "backup of dashboard is late" | mail -s "whoobe backup" you@example.org
```

or from a monitor that runs a command. `systemctl status whoobe-backup@dashboard.service` and `journalctl -u` show the last run.

## 5. Prove it works

- Every month: `AGE_IDENTITY=~/whoobe-backup.key ./scripts/restore-workspace-db.sh --check <newest dump>` on the machine that holds the key.
- Every quarter, or after a change of host or version: restore into a scratch workspace
  ([runbook](backup-restore-and-dr.md#5-runbook-restore-a-workspace-on-a-new-host)) and log in.
- `scripts/restore/rehearse.sh` runs the whole cycle with these scripts on a throwaway workspace (`nightly.sh`, destroy, restore).
  `scripts/backup/selftest.sh` tests `check.sh` and `pull.sh` without Docker.

## What this does not do

- No point-in-time recovery: you can lose up to a day (the interval between two nightly runs).
- No alert unless you wire `check.sh` to something that reaches you.
- It does not save the nginx files and certificates (re-created by the scripts of [creating workspaces](creating-workspaces.md)),
  nor what lives only in an external provider.
- Erasing a person ([data subject requests](data-subject-requests.md)) does not reach these copies: after a restore, erase again.
