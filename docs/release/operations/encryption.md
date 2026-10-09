# Encryption: at rest, in transit, backups and keys

What Whoobe encrypts itself, what the infrastructure must encrypt, and how to answer an enterprise security
questionnaire about it. Short version: **Whoobe encrypts the secrets it stores in its database (field level), can
connect to Postgres over TLS, and produces encrypted backups; encrypting the database files themselves is done by the
disk/volume or the managed database service underneath, not by Whoobe.**

## The four levels

| Level | Protects against | Who provides it | Status |
|---|---|---|---|
| 1. Disk / volume encryption (LUKS, cloud volume encryption) | Theft of a disk, a snapshot or decommissioned hardware | The infrastructure | You enable it; checklist below |
| 2. TLS in transit (app to Postgres, app to object storage, browser to proxy) | Sniffing on the network | Whoobe (configuration) + the proxy | `DB_SSL` (below); HTTPS at the proxy (`enable-tls.sh`) |
| 3. Database engine encryption (TDE) | Same as level 1, inside the engine | Not in community PostgreSQL. Managed services (RDS, Cloud SQL, Azure Database) encrypt the storage; Percona/EDB/Crunchy ship TDE | Out of Whoobe's scope |
| 4. Field-level encryption | A DBA, a leaked dump, a stolen backup | Whoobe | For secrets: done (set all the keys). For page/data content: not done (see "What is not encrypted") |

Most enterprise checklists ("database encryption at rest") are satisfied by level 1 or by the managed database's own
encryption, plus level 2 and encrypted backups. Ask which of them the customer actually requires before building more.

## What Whoobe encrypts in the database (field level)

AES-256-GCM, one key per area, from the environment (never from the database). The value stored is the ciphertext; the
screens never show a secret again after it is saved.

| Data | Variable | Notes |
|---|---|---|
| Two-factor (TOTP) secrets of users | `TOTP_ENCRYPTION_KEY` | |
| Gateway endpoint credentials (auth of the external service) | `GATEWAY_AUTH_ENCRYPTION_KEY` | |
| Credentials of migration sources | `MIGRATION_SOURCE_ENCRYPTION_KEY` | |
| Outgoing mail: SMTP password and provider API keys | `MAIL_SETTINGS_ENCRYPTION_KEY` | F-054; an old plaintext password is encrypted at startup |
| AI provider keys (text, image, translation), Figma token, push provider (OneSignal) key | `INTEGRATION_SECRETS_ENCRYPTION_KEY` | F-055; values saved before the key was set are encrypted at the next start; without the key they stay in clear text and a warning is logged |

An installation that has **not set `INTEGRATION_SECRETS_ENCRYPTION_KEY`** keeps those credentials in clear text (finding F-055): set it
(`provision-workspace.sh` does for new workspaces) and restart; existing values are encrypted at the start.

User passwords are not encrypted but hashed with argon2id (one-way); password-reset tokens are stored as SHA-256 hashes. Session ids are stored as SHA-256 hashes of the cookie value (F-056), so a leaked copy of the database or of a backup does not allow session hijacking.

`provision-workspace.sh` generates all these keys per workspace into `.env.<slug>` (mode 600).

### What is not encrypted

Pages, snippets, data objects, form submissions, user profiles (name, e-mail), the audit and mail logs, and the files in
object storage are stored as they are: the application has to search, filter and index them. Encrypting them at field
level would break search, bindings and sorting, and is not planned. If a customer needs it for specific personal-data
fields (for instance form submissions), the way is an opt-in per data class, with the limits above; ask before building.
Until then, levels 1 to 3 are the answer.

## Level 1: encrypt the disk or volume

Do it where the data lives, not in Whoobe:

- **Cloud VM** (AWS, OCI, GCP, Azure): create the block volumes encrypted (provider-managed or customer-managed key) and
  keep Docker's data root (`/var/lib/docker`) and the backup directory on them. Snapshots of an encrypted volume are
  encrypted.
- **Own server / VM without cloud encryption**: LUKS (`cryptsetup`) on the partition that holds `/var/lib/docker`, or on a
  dedicated one mounted there. The key is released at boot (passphrase, TPM or a network key server such as Tang/Clevis).
- **Managed PostgreSQL** (RDS, Cloud SQL, Azure, Aiven ...): "encryption at rest" is a switch at creation time; it cannot be
  turned on later for an existing instance on some providers, so decide early. Point Whoobe at it with `DB_HOST` and `DB_SSL`.
- **Object storage**: with a cloud S3, enable default bucket encryption (SSE-S3 or SSE-KMS). With Garage or MinIO the
  data directory is on the encrypted volume (do not rely on server-side encryption features of these two without checking the version you run).

How to verify, for an audit: `lsblk -f` showing `crypto_LUKS` under the data path, or the provider's console/CLI showing the
volume as encrypted. Keep that evidence with the deployment record.

## Level 2: TLS to Postgres

Inside a workspace the database is only reachable on its private Docker network and the connection is plain: that is
normal for a container next to its client. TLS is for a database on another host or a managed service.

Environment (any service that reads `DB_*`: core-api, asset-processor, the CLI tools):

| Variable | Meaning |
|---|---|
| `DB_SSL` | `disable` (default), `require` (encrypted; the server's certificate is not checked) or `verify-full` (encrypted and the certificate chain and host name are checked). `verify-ca` is accepted and treated as `verify-full`. |
| `DB_SSL_CA` | The CA that signed the server's certificate: a path to a PEM file or the PEM text. Needed for a private CA or a provider that publishes its own (RDS `global-bundle.pem`...); not needed when the certificate comes from a public CA. |

`DATABASE_URL` with `?sslmode=require` (or `verify-full`) works too; `DB_SSL` wins if both are set. An unreadable
`DB_SSL_CA` or an unknown value stops the start: it never falls back to a plain connection. The startup log says
`tls: off | encrypted, certificate not checked | verified`.

**Use `verify-full` for anything that crosses a network you do not control.** `require` only defeats passive sniffing.

For `drizzle-kit` (migrations from a developer machine) put `?sslmode=require` in `DATABASE_URL`; it does not read `DB_SSL_CA`.

On the server side (self-managed Postgres): `ssl = on`, `ssl_cert_file`, `ssl_key_file` and, to force it, a
`hostssl` line instead of `host` in `pg_hba.conf`. Verified here against PostgreSQL 16 with a private certificate:
plain, `require` and `verify-full` (with and without the CA) behave as described.

Other links: browser to proxy is HTTPS (`enable-tls.sh`, Let's Encrypt); proxy to the apps is on the host's loopback
or the private network; apps to object storage use the URL you give (`https://` for any S3 outside the host).

## Encrypted backups

`scripts/backup-workspace.sh` never writes a clear-text backup: it refuses to run without a recipient.

```bash
# once, on the machine that will RESTORE (not on the server): age-keygen -o backup-key.txt  (prints the public key)
export BACKUP_AGE_RECIPIENT=age1...        # public key, or a file with one per line (several people can decrypt)
./scripts/backup-workspace.sh client-a --out-dir /var/backups/whoobe --keep 14
```

It writes, mode 600 in a mode 700 directory:

- `client-a-<UTC stamp>.sql.gz.age` - `pg_dump | gzip | age`, nothing touches the disk in clear;
- `client-a-<UTC stamp>.env.age` - the workspace's `.env.<slug>` (its only copy of the credentials **and of every encryption key**; without it a restored database cannot decrypt its own secrets). `--no-env` skips it.

With GnuPG instead of age: `BACKUP_GPG_RECIPIENT=<key id or e-mail>` (public key in the keyring) gives `.gpg` files.

The decryption key (age identity, GPG secret key) must **not** live on the server: whoever takes the server's backups
must not be able to read them. Keep it in a password manager/HSM/KMS and with a second person.

Check and restore:

```bash
AGE_IDENTITY=backup-key.txt ./scripts/restore-workspace-db.sh --check client-a-20261008T120000Z.sql.gz.age     # decrypts and tests, restores nothing
AGE_IDENTITY=backup-key.txt ./scripts/restore-workspace-db.sh client-a client-a-20261008T120000Z.sql.gz.age   # asks you to type the slug; drops and recreates the database
```

**Test a restore on a scratch workspace before you need it** (a backup nobody has restored is a hope, not a backup), and
schedule it: `0 3 * * * cd /opt/whoobe/whoobe_cms && BACKUP_AGE_RECIPIENT=age1... ./scripts/backup-workspace.sh client-a --out-dir /var/backups/whoobe --keep 14` in cron.
Copy the files off the host (object storage with versioning/object lock, another site): they are safe to store there
because they are encrypted. Retention and offsite copy are yours to set.

Assets in object storage are not in these files: back them up with the provider's tools (versioning/replication for a
cloud S3; `rclone`/`mc` for Garage/MinIO into an encrypted location). See [creating workspaces](creating-workspaces.md#backups).

## Keys

- Each key is 32 random bytes in hex: `openssl rand -hex 32`. Never reuse one for two areas; never commit one.
- Losing a key means losing the data it encrypts (mail credentials, TOTP secrets, gateway credentials): users must enrol two-factor
  again and credentials must be typed again. **Back up `.env.<slug>` together with the database** (the script does).
- **Rotation is not automated yet.** Changing a key without re-encrypting makes the existing values unreadable. The current
  procedure is manual: decrypt with the old key and save again from the screens (mail, gateway endpoints), and have users
  re-enrol TOTP. A rotation command with key versions and a KMS/Vault source for the keys are the next steps if a customer needs them.
- The keys live in the environment of the containers (`.env.<slug>`, mode 600). Anyone who can read it, or run commands in the
  container, has them. For stricter setups pass them from a secret manager into the environment at start.

## For a security questionnaire

| Question | Answer |
|---|---|
| Is data encrypted at rest? | Disk/volume or managed-database encryption (level 1/3) on the customer's or provider's infrastructure; secrets additionally AES-256-GCM at field level (gateway, mail, migration sources, MFA, AI/Figma/push keys; the last group needs `INTEGRATION_SECRETS_ENCRYPTION_KEY`). |
| Is it encrypted in transit? | HTTPS at the edge; TLS to Postgres with `DB_SSL=verify-full`; HTTPS to object storage and to the external providers (mail, gateway). |
| Are backups encrypted? | Yes: `backup-workspace.sh` (age or GPG), public-key encryption, the decryption key is not on the server. |
| Who holds the keys? | The operator: environment variables per workspace (field level), the volume/KMS key (level 1), the backup private key (offline). |
| Key rotation? | Manual today (see Keys). |
| Are passwords stored? | Only as argon2id hashes. |
