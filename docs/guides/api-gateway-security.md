# API Gateway security

The API Gateway (`apps/gateway`, port 3001) stores per-endpoint credentials for third-party APIs — API keys, bearer tokens, basic-auth username/password — and injects them server-side on every proxied call. Those credentials are the gateway's core sensitive asset: anyone who obtains one gets whatever access the configured endpoint grants, at the third party, outside this system entirely. This doc covers how that asset is protected today, and what's intentionally deferred.

## Threat model

- **A DB read** (a backup, a read replica, a compromised service sharing the database, SQL injection elsewhere) should not hand over usable third-party credentials.
- **A client with `GATEWAY_MANAGE`** (the admin-dashboard's Gateway Endpoints page) should be able to *configure* credentials without the API ever having to *return* them — nothing legitimately needs to read a stored secret back once it's set.
- **An error response** should never be a side channel for internal detail — an upstream URL (which can embed a secret if someone pastes one into a query string instead of `authConfig`), an internal hostname, or a stack trace.
- **An upstream response relayed back to a browser** (the "Try it"/execute tool, a captured schema sample) should not carry the upstream's own secrets — a `Set-Cookie`, a session token, a field that happens to be named `password` — along for the ride.

## Credentials at rest: encryption

`gateway_endpoints.auth_config` used to be a plain `jsonb` column. It's now encrypted:

- **`packages/core/src/db/gateway-auth-crypto.ts`** — AES-256-GCM, authenticated (a tampered/corrupted ciphertext fails to decrypt rather than silently returning garbage credentials). The key is derived via `scryptSync` from the `GATEWAY_AUTH_ENCRYPTION_KEY` env var, so an operator doesn't have to hand-generate exactly-32-byte key material. Ciphertext is stored as `iv (12 bytes) + authTag (16 bytes) + ciphertext`, base64-encoded, in `gateway_endpoints.auth_config_encrypted`.
- This mirrors an existing pattern in this codebase — `packages/core/src/db/migration-sources-crypto.ts` encrypts a stored Pimcore DB password the same way — but uses its **own** env var rather than reusing `MIGRATION_SOURCE_ENCRYPTION_KEY`, so a leak of one secret class doesn't compromise the other.
- Encryption/decryption happens at the **records layer** (`packages/core/src/db/gateway-records.ts`'s `toRow`/`toRecord`), not at each call site. Every function outside that file (`admin-routes.ts`, `resolve-handler.ts`, `remote-router.ts`) still just reads `endpoint.authConfig` as a plain object — they don't know or care that it's encrypted on disk.

### Migration state: expand → backfill → contract

Changing how a live secret column is stored is not a one-shot edit. This shipped as:

1. **Expand** (`packages/core/drizzle/0039_gateway_auth_encrypted.sql`) — add `auth_config_encrypted`, additive only. The old plaintext `auth_config` column stays in place.
2. **Backfill** (`packages/core/src/db/scripts/backfill-gateway-auth-encryption.ts`, run via `pnpm --filter @whoobe-cms/core run db:backfill-gateway-auth`) — encrypts any row still holding a plaintext `auth_config` into `auth_config_encrypted`, then clears the plaintext column. Idempotent; safe to re-run.
3. **App-layer write-through** — as of this change, every `createGatewayEndpoint`/`updateGatewayEndpoint` call encrypts and clears the legacy column immediately, so a row touched even once is no longer exposed there.
4. **Contract** (not yet done) — a future migration drops `gateway_endpoints.auth_config` entirely, once every environment has run the backfill script. It's deliberately not bundled with step 1: applying migrations on a checkout with existing plaintext data, without running the backfill first, would otherwise delete credentials with no encrypted copy to fall back to.

**Operational note:** any environment that already had gateway endpoints configured before this change (including this repo's own local dev DB, which it was run against) must run the backfill script once, after setting `GATEWAY_AUTH_ENCRYPTION_KEY`, before the eventual contract migration ships.

## Credentials never round-trip to a client

`GET /api/v1/gateway/endpoints`, `GET /api/v1/gateway/endpoints/:id`, `POST /api/v1/gateway/endpoints`, and `PATCH /api/v1/gateway/endpoints/:id` all strip `authConfig` before responding (`admin-routes.ts`'s `redactEndpoint()`). This matters even for an authorized `GATEWAY_MANAGE` caller: previously, just opening the admin-dashboard's Gateway Endpoints list fetched every endpoint's raw credentials to the browser, whether or not anyone intended to view or edit them — visible in DevTools' network tab, to any browser extension with page access, to error-tracking tools that capture responses, regardless of the edit form's `type="password"` masking (which only affects display, not what already crossed the wire).

Because credentials no longer come back from the API, editing is **write-only**:

- The admin-dashboard's edit form (`GatewayEndpointsView.vue`) starts credential fields blank on Edit, with a note that a blank field keeps the current stored value.
- `PATCH /api/v1/gateway/endpoints/:id` merges the incoming `authConfig` onto the existing stored one, ignoring blank/omitted keys, rather than overwriting wholesale — so renaming an endpoint, or changing just one credential field, can't accidentally wipe the rest.

## Response sanitization

- **`apps/gateway/src/redact.ts`**:
  - `pickSafeResponseHeaders()` — the admin "Try it" tool (`POST /routes/:id/execute`) only relays an allow-list of upstream response headers (`content-type`, `content-length`, `cache-control`, `etag`, `last-modified`, `date`, `x-request-id`) to the browser, instead of every header the upstream sent. A raw pass-through would hand a `Set-Cookie`, a trace/rate-limit token, or — on a misconfigured upstream — an echoed `Authorization` header straight to the client.
  - `redactSensitiveValues()` — recursively scrubs any JSON key matching a credential-shaped pattern (`password`, `secret`, `token`, `api[_-]?key`, `authorization`, `access[_-]?key`, `client[_-]?secret`, `session[_-]?id`, `cookie`, etc.) to `[REDACTED]`. Applied to the sample response captured by "Test route" and "Refresh schema" **before** it's persisted as `gateway_schemas.sample_payload` and before it's returned in the response — this is a heuristic (key-name matching), not a guarantee that every sensitive value in every possible upstream shape is caught, so avoid testing routes against endpoints whose responses carry sensitive data you don't want retained at all.

## Error handling

Every gateway route that proxies an upstream call, or performs a DB operation, logs the real error server-side (`apps/gateway/src/log-error.ts`'s `logGatewayError()`) and returns a fixed, generic message to the caller. Previously, catch blocks returned `details: String(err)` directly — a failed `fetch`'s error message typically includes the full request URL, which (for an endpoint whose credentials were pasted into `baseUrl`/a route path instead of `authConfig`) could include that secret, plus internal hostnames and stack detail with no benefit to the caller.

## Access control (unchanged, noted for completeness)

- All admin CRUD/test/execute routes require the `GATEWAY_MANAGE` permission (`apps/gateway/src/auth.ts`).
- `/api/internal/*` and `/dam/*` (internal service proxies) require a valid session (`requireAuth`).
- `/public/*` requires no auth by design — it proxies to `core-api`'s own already-public routes, injecting no gateway-managed credentials.
- The resolve endpoint used by page rendering (`/api/v1/gateway/resolve`) only ever returns `{ endpointName, fieldPath, value, found }` — never headers, never `authConfig` — regardless of the caller.

## Known gaps / deliberate follow-ups

- **Key custody**: `GATEWAY_AUTH_ENCRYPTION_KEY` lives in process env (`.env` / the container's environment). Anyone who can read the gateway process's runtime config can decrypt every stored credential. A managed KMS (envelope encryption, per-secret data keys, centralized rotation/audit) would remove that single point of compromise, at the cost of a new external dependency and a network call per decrypt — not something this repo has any existing integration for, so it's a larger, separate piece of work.
- **No key rotation**: rotating `GATEWAY_AUTH_ENCRYPTION_KEY` today means re-encrypting every row by hand (decrypt with the old key, re-encrypt with the new one) — there's no tooling for this yet.
- **The legacy `auth_config` column still exists** pending the contract migration described above.
- **Sample-payload redaction is heuristic**, not exhaustive (see above).
