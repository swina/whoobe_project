# Security findings register

Phase 0 (static baseline) - 2026-10-02. Raw reports: `scripts/security/reports/2026-10-02/` (gitignored). Values of secrets are never recorded here.

| ID | Sev | Component | Finding | Status |
|---|---|---|---|---|
| F-001 | Medium (was High) | repo / git | `.env.aura` was **tracked in git** (added in `94f18fb`, now untracked and gitignored) with DB passwords, `MIGRATION_SOURCE_ENCRYPTION_KEY`, `GATEWAY_AUTH_ENCRYPTION_KEY`, S3/MinIO keys, `DAM_SERVICE_TOKEN`, `SEED_ADMIN_PASSWORD`. All values are for local services (`localhost` Postgres/MinIO, `aura.local`); no third-party provider keys in that commit. Repo is private and history stays as is. Severity lowered because exposure is limited to repo readers - **but** `swina/whoobe_project` was a public mirror of this history: High until it is deleted (owner decided on 2026-10-02 to delete it; remote `project` removed locally). Remaining risk: the Oracle test instance may use these values. **Plan: destroy and rebuild the Oracle instance with newly generated secrets**, and generate new local values at next local reset. | partly fixed (untracked); rotation pending |
| F-002 | High | git config | The `origin` remote URL embeds a GitHub personal access token in clear text (`.git/config`). Revoke and replace it (use a credential helper / SSH). It was also printed in this session's output. Remotes `origin` and `project` switched to SSH on 2026-10-02 (key verified); token revoked on GitHub by the owner on 2026-10-02. | fixed |
| F-003 | High | deps | `pnpm audit --prod`: 11 high, 12 moderate. Notable: `drizzle-orm` 0.36.4 SQL injection via escaped identifiers (core), `exiftool-vendored` argument injection (asset-processor), `xlsx` 0.18.5 prototype pollution + ReDoS (admin), `sharp`/libheif, `nodemailer` ReDoS, `postcss` source-map file read (build-time), `underscore`. | open |
| F-004 | High | Docker | Root `Dockerfile` runs as root (`DS-0002`), no `HEALTHCHECK`. Same for `sites/aura-network/Dockerfile*`. | open |
| F-005 | Low | shell | shellcheck: 10 minor items (unused vars, `$?` style) in tracked `*.sh`; no quoting/injection warnings. | open |
| F-006 | Info | Dockerfile | hadolint DL3059 (consecutive `RUN`). | open |
| F-007 | Low | admin/spike | 2x `postMessage` with `*` target origin (semgrep). Check the payload carries nothing sensitive (SEO resolved values only?) and pin to `window.location.origin`. | open |
| F-008 | Info | static | `v-html`/`innerHTML` inventory: 46 sites (`vhtml-inventory.txt`) - each to be checked for sanitisation in Phase 3 (3.6). | open |
| F-009 | Medium | deploy | `deploy.sh` excluded only the exact name `.env` from rsync, so `.env.aura`, `.env.test` and any `.env.<slug>` were copied to the Oracle host on every deploy (and workspace env files were exposed to `--delete` handling). Fixed 2026-10-02: `--include .env.example --exclude .env --exclude '.env.*'` (dry-run verified: only `.env.example` is synced). Existing copies on Oracle are not removed. Also unexcluded: `.claude/` (worktrees). | fixed (script); Oracle copies pending |

Triaged as false positives (no action): gitleaks hit in `docs/plans/security/security-testing-plan.md` and `packages/core/src/dam/s3-provider.ts:269` (prose/comment); semgrep `tainted-sql-string` at `apps/core-api/src/server.ts:886` and `apps/asset-processor/src/server.ts:594` (no SQL there, parameterised helpers called); semgrep `gcm-no-tag-length` in `gateway-auth-crypto.ts` / `migration-sources-crypto.ts` (auth tag is a fixed-length slice, `setAuthTag` always receives 16 bytes).

Exit criterion of Phase 0 ("secrets/CVE blockers fixed or ticketed"): **not met** until F-001..F-003 are handled.
