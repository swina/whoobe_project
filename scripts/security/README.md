# Security tests

Plan: `docs/plans/security/security-testing-plan.md`; findings: `docs/plans/security/findings.md`.

## Quick start

```
scripts/security/stack.sh up          # throwaway stack (own DB/volumes, ports = dev +100)
pnpm security:api                     # API suites (vitest) against that stack
pnpm security:static                  # docker-based static scans, no stack needed
scripts/security/stack.sh down        # remove stack and its volumes
```

Reports go to `scripts/security/reports/<date>/` (gitignored).

## How it works

- `lib/config.ts` - target and **safety rules**: refuses to run unless the core-api, gateway and
  asset-processor hosts are `localhost`/`*.local` (or listed in `SECURITY_TEST_ALLOW_HOSTS`) and the
  DB name in the env file contains `_sec_test`. Override the target with `SECURITY_TEST_TARGET`,
  `SECURITY_TEST_GATEWAY`, `SECURITY_TEST_ASSET_PROCESSOR`, the env file with `SEC_ENV_FILE`.
- `setup.ts` (vitest globalSetup) - waits for `/health`, logs in as the seeded admin and
  idempotently creates roles/users `sec-none`, `sec-read`, `sec-write`, `sec-users`
  (see `lib/roles.ts`; password derived from the admin password).
- `lib/client.ts` - HTTP client with a cookie jar per role: `clientFor('anon'|'none'|'read'|'write'|'users'|'admin')`.
- `extract-routes.ts` - static route table of `apps/core-api/src/server.ts` (method, path, access
  guard, permission). `routes.expected.json` is the checked-in source of truth;
  `api/route-drift.test.ts` fails when a route is added, removed or changes access without updating it.
  Entries with a `REVIEW` note are unauthenticated routes still to be assessed.
- `api/harness.test.ts` - the harness itself (target up, roles log in, 401/403/200 as expected).

## Adding a suite

Put `api/<topic>.test.ts` next to the others; use `clientFor(role)`. Tests share one stack and run
serially (`fileParallelism: false`) because lockout/rate-limit checks are order-sensitive.
