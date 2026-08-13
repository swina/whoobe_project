# Plan: Single Root `.env` for All Configuration

Planning document to consolidate the five per-app `.env` files spread across the monorepo into one unique `.env` at the repo root, and point every consumer (docker-compose, two Node backends, the migration-tool CLI, and two Vite apps) at it. Consolidates existing configuration only — no new vars are introduced.

---

## 1. Why This Comes First

Configuration is currently scattered across five files, each with its own loading mechanism and its own copy of overlapping values:

| File | Consumers | Vars |
| --- | --- | --- |
| `.env` (repo root) | `docker-compose.yml` (Postgres container) | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| `apps/core-api/.env` | `process.loadEnvFile()` in `apps/core-api/src/server.ts` | `PORT=3003`, `DB_*`, `MIGRATION_SOURCE_ENCRYPTION_KEY` |
| `apps/asset-processor/.env` | `process.loadEnvFile()` in `apps/asset-processor/src/server.ts` | `PORT=3002`, `DB_*`, `S3_*` |
| `apps/admin-dashboard/.env.local` | Vite (env files are only read from the app project root) | `VITE_ASSET_PROCESSOR_URL`, `VITE_CORE_API_URL` |
| `apps/whoobe-one-spike/.env` | Vite (same constraint) | `VITE_FONT_FAMILIES` |

Problems this creates:

- **Duplicated values with drift risk**: `DB_*` is copied in three places (root `.env` for compose, `core-api`, `asset-processor`) and `README.md` documents them a fourth time. Any change (e.g. a new `DB_NAME`) must be made in lockstep across all copies.
- **No single place to look**: discovering what a service is configured with means opening several files plus `README.md`.
- **Inconsistent mechanisms**: Node's `process.loadEnvFile()` loads whatever `.env` happens to be in the process cwd; Vite only loads env files from its own project root; docker-compose reads the repo-root `.env`. The unified root file standardizes the location even though the mechanisms necessarily stay different.

---

## 2. Scope & Non-Goals

- **In scope**: a single root `.env` holding exactly the vars that exist today across the five files; loader changes in the three Node entry points; `envDir` in the two Vite configs; deletion of the per-app files; README + CHANGES updates.
- **Out of scope** (explicitly deferred): adding optional vars that only have code defaults today (`PIMCORE_DB_*` for the Pimcore migration source, `SEED_ADMIN_*`, `PUBLIC_SITE_URL`); renaming any existing var; touching historical plan docs under `docs/plans/*` that reference per-app `.env` files (archival records).

---

## 3. Core Concepts

### 3.1 One root `.env`, grouped with comment headers

The root `.env` becomes the single source of truth, organized into commented sections matching each consumer:

```
# Read by docker-compose.yml for variable interpolation (Postgres container
# config).
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgrespassword
POSTGRES_DB=whoobe_db

# Shared Postgres connection - consumed by both apps/core-api and
# apps/asset-processor (session validation reads the same table).
DB_HOST=develop.local
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgrespassword
DB_NAME=whoobe_db

# core-api only - encryption key for stored migration sources.
MIGRATION_SOURCE_ENCRYPTION_KEY=my_secret_key_sanbenedetto

# asset-processor only - S3/MinIO connection, owned exclusively by the
# backend; never exposed to the browser.
S3_ENDPOINT=http://develop.local:9000
S3_BUCKET=whoobe-cms
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadminpassword
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=http://develop.local:3002/dam-asset

# admin-dashboard (Vite) - API base URLs for the SPA.
VITE_ASSET_PROCESSOR_URL=http://develop.local:3002
VITE_CORE_API_URL=http://develop.local:3003

# whoobe-one-spike (Vite) - font families offered in the editor font picker.
VITE_FONT_FAMILIES=Alfa+Slab+One|Asap+Condensed|...
```

### 3.2 Ports stay in code defaults

`core-api` (3003) and `asset-processor` (3002) both read `PORT`, which a single shared `.env` can only define once. Decision: **drop `PORT` from the env entirely** and keep the existing code defaults (`process.env.PORT || 3003` / `|| 3002`). Ports are a per-process concern; moving them into code defaults removes the collision without renaming any var.

### 3.3 Node loaders point at the root file explicitly

All three Node entry points currently call `process.loadEnvFile()` with no path, which loads `.env` from `process.cwd()` (the package dir under pnpm). They must instead load the repo-root file via an `import.meta.url`-relative URL — this works identically from `src/` (tsx dev) and `dist/` (compiled), because both sit three levels below the repo root:

- `apps/core-api/src/server.ts`
- `apps/asset-processor/src/server.ts`
- `packages/migration-tool/src/cli.ts`

Each becomes:

```ts
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // No .env file present - fall back to whatever is already in process.env.
}
```

### 3.4 Vite apps get `envDir` pointing at the repo root

Vite only reads env files from its project root by default. Adding `envDir: '../../'` to both `vite.config.ts` files makes Vite load the repo-root `.env` (relative to each app's project root). Both apps will see every `VITE_*` var, but each only consumes its own — harmless.

- `apps/admin-dashboard/vite.config.ts`
- `apps/whoobe-one-spike/vite.config.ts`

### 3.5 Deletions

- `apps/core-api/.env`
- `apps/asset-processor/.env`
- `apps/admin-dashboard/.env.local`
- `apps/whoobe-one-spike/.env`
- `apps/whoobe-one-spike/.env.example` (tracked in git, now stale — `README.md` documents the values for fresh clones)
- `:Zone.Identifier` junk files next to each deleted file (Windows download artifacts, currently untracked)

Root `.env` stays gitignored (already the case via the `.env` pattern in `.gitignore`).

---

## 4. Files Touched

| File | Change |
| --- | --- |
| `.env` (root) | Rewritten as the single unified config (grouped sections, no `PORT`) |
| `apps/core-api/src/server.ts` | `loadEnvFile` with explicit `../../../.env` path; comment update |
| `apps/asset-processor/src/server.ts` | Same |
| `packages/migration-tool/src/cli.ts` | Same |
| `apps/admin-dashboard/vite.config.ts` | Add `envDir: '../../'` |
| `apps/whoobe-one-spike/vite.config.ts` | Add `envDir: '../../'` |
| `README.md` | Replace the five-file setup section with the single root `.env` block |
| `CHANGES.md` | Dated entry summarizing the consolidation |

## 5. Verification

1. `pnpm typecheck` (turbo, whole workspace) — confirms the loader changes compile.
2. Boot everything with `./dev-cms.sh --build` and spot-check all four consumers:
   - core-api up on 3003, asset-processor on 3002 (code defaults)
   - admin-dashboard reaches core-api/asset-processor at `develop.local` (VITE_ vars loaded from root)
   - whoobe-one-spike font picker lists the `VITE_FONT_FAMILIES` set
   - `docker compose config` resolves the Postgres vars from root `.env`

## 6. Risks / Caveats

- `process.loadEnvFile(new URL(...))` requires Node ≥ 20.12 (already in use via the bare call, so no new baseline).
- Vite `envDir` outside the project root is supported, but the shared file means a `VITE_` var name collision between apps would silently bleed; namespacing discipline (per-app prefixes) is required going forward.
- `docs/plans/*` historical references to per-app `.env` files are left untouched as archival records; only `README.md` reflects the new layout.