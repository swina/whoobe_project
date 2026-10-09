# Secrets and key management

Inventory of every secret a Whoobe installation holds, what each one protects, what happens if it is **lost** and if
it is **leaked**, and how to rotate it. Background on encryption levels and backups: [encryption](encryption.md); variable
details: [configuration reference](configuration-reference.md). There is no built-in key-management service, key
versioning or automated rotation: everything below is a manual procedure.

## 1. Where secrets live

- **Environment file** `.env.<slug>` (mode 600, created by `provision-workspace.sh`, never in git, excluded from the
  images): all keys of sections 2 and 3. Anyone who can read it, or run a command inside a container, has them.
  For stricter setups, inject the variables into the containers from a secret manager and keep the file empty of them.
- **Database** (`users`, `websites.settings`, `gateway_endpoints`, `mail_settings` ...): hashes and ciphertext - and,
  until F-055 is fixed, AI/Figma/push keys in clear text.
- **Operator's machine**: the backup private key (age identity or GPG secret key), TLS account data, SSH keys.
- **Let's Encrypt certificates**: on the host (`/etc/letsencrypt`), renewed by `scripts/renew-certs.sh`.

## 2. Infrastructure secrets

| Secret | Generated | Used by | If lost | If leaked | Rotate |
|---|---|---|---|---|---|
| `POSTGRES_PASSWORD` / `DB_PASSWORD` | `provision-workspace.sh` (random) | postgres, core-api, asset-processor, gateway | restore from the env backup; or `ALTER USER` as the container's superuser | full database access (needs network reach: loopback only by default) | `ALTER USER … PASSWORD`, update both variables, recreate the three backends |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | random (`GK`+24 hex / 64 hex for Garage) | garage, asset-processor, core-api | create a new key in the store | read/write/delete of every asset and log | create a second key, switch the variables, recreate asset-processor and core-api, delete the old key; Garage: `garage key` commands inside the container |
| `DAM_SERVICE_TOKEN` | random | core-api, asset-processor (and the logger of every backend) | none: set a new one | read of private files and logs through asset-processor, and the attach endpoint of form uploads | set a new value in the env file, recreate **all** backends at once; no data impact |

## 3. Application keys

| Secret | Protects | If lost | If leaked | Rotate |
|---|---|---|---|---|
| `GATEWAY_AUTH_ENCRYPTION_KEY` | upstream credentials of gateway endpoints | the credentials are unreadable: the endpoints stop authenticating upstream; re-enter them on each endpoint | with a database copy, all stored upstream credentials | no re-key tool: change the key, then re-enter the credential of every endpoint |
| `MIGRATION_SOURCE_ENCRYPTION_KEY` | credentials of saved Pimcore sources | re-enter the sources | with a database copy, those credentials | same as above |
| `MAIL_SETTINGS_ENCRYPTION_KEY` | SMTP password, mail-provider API keys | re-enter them in Settings > Mail | with a database copy, the mail credentials (sending as your domain) | change the key, re-enter the secrets |
| `TOTP_ENCRYPTION_KEY` | users' TOTP secrets | **every user with MFA must enrol again** (an admin can clear MFA with the reset script) | with a database copy, the ability to generate valid codes for every user | change the key, users re-enrol |
| `SITE_API_KEY_PEPPER` | hashes of per-website site keys | all site keys stop working | with a database copy, offline guessing of site keys | change the value, regenerate the key of each website (dashboard) and redeploy the sites that use it |
| `UPLOAD_TOKEN_SECRET` | the one-file upload tickets | none: set a new one | forging upload tickets within the website's own limits | change at any time; tickets in flight (10 minutes) fail; no stored data depends on it |
| `SEED_ADMIN_PASSWORD` | the first administrator | reset with the reset script | until changed | change it at first login; the variable is only read when no user exists |

**Same rule for all of them:** one key per area, never shared between areas or workspaces, 32 random bytes (`openssl rand -hex 32`).
`provision-workspace.sh` does that. The `change_me…` values in `.env.example` are placeholders, not secrets: Compose refuses
to start when the database and S3 credentials are unset, but does not recognise a placeholder, so replace them (only
`UPLOAD_TOKEN_SECRET` treats its placeholder as "not set").

## 4. Credentials stored through the dashboard

| Secret | Stored | Note |
|---|---|---|
| Gateway upstream credentials | encrypted (`GATEWAY_AUTH_ENCRYPTION_KEY`) | never returned by the API |
| SMTP password, mail-provider keys | encrypted (`MAIL_SETTINGS_ENCRYPTION_KEY`) | write-only |
| **AI provider keys, Figma token, push-provider key** | **clear text** in the database (F-055) | write-only in the API; protect database access and backups until fixed |
| Per-website site keys | hash with pepper; the clear key is shown once at creation | |
| User passwords | argon2id hash | |
| Preview-link tokens | stored as issued in `data_object_preview_tokens`, with an expiry | |

## 5. Other secrets of the operator

| Secret | Handling |
|---|---|
| Backup decryption key (age identity / GPG secret key) | **not on the server**; password manager or KMS plus a second custodian. Without it the backups are unreadable by design |
| TLS private keys | certbot on the host; `renew-certs.sh` (cron) |
| GitHub token / SSH keys used to deploy | never in git remotes (F-002); use SSH keys or a credential helper |
| `CMS_SITE_API_KEY` of a published site | on the site's server side only, never in the browser bundle |

## 6. Procedures

### Rotate a secret that was **not** leaked
Pick the row above; change the value in `.env.<slug>`; recreate the services that use it
(`docker compose -p ws-<slug> --env-file .env.<slug> up -d --force-recreate <services>`); do the data step in "Rotate" if
there is one; keep the **old** env file until the data step is done and verified. Record the date.

### Suspected leak of the env file or a backup
1. Treat every key in it as compromised. Generate new values for all of section 2 and 3.
2. Revoke all sessions: `UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL;` (or change the password of
   the affected users, which revokes theirs).
3. Re-enter gateway, mail and migration credentials; ask users to re-enrol MFA; regenerate site keys.
4. Rotate the **upstream** credentials themselves (AI, Figma, push, SMTP, ERP/CRM keys): the leak includes what was
   stored in clear text (F-055).
5. Rotate the S3 key and the database password; check the S3 and database access logs of the provider for the period.
6. Re-encrypt backups made with a leaked backup key (generate a new recipient) and destroy the old ones.

### Lost the env file with no backup
The database can be restored but encrypted values cannot be read. Generate a new env file, restore the database,
then re-enter all credentials (gateway, mail, migration sources), have users re-enrol MFA, regenerate site keys. This is
why the backup script stores `.env.<slug>` (encrypted) next to the database dump.

### Before a new customer or environment
Never copy an env file from another workspace. Findings F-001 and F-009 are the record of what happens when one is
committed or left on a host.

## 7. Gaps (for the security office)

No automated rotation, no key versioning (`enc:v1:` values carry a format version but one key), no KMS/Vault integration,
no secret scanning of the database content, AI/Figma/push keys unencrypted (F-055), sessions unhashed (F-056).
