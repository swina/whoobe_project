# Whoobe as a hub for applications: client access to the Gateway, data objects and assets

Status: **decided 2026-10-12; phase 1 implemented the same day** (gateway for clients, keys, scopes, limits, Valkey, dashboard page; documented in the Integrations guide, section 4). The decisions are in section 11.

## 1. The idea

Today Integrations (the API Gateway), Data Objects and the asset manager (DAM) are used **by the websites Whoobe builds**. The
question is whether a third application (a native app written in Flutter, a mobile app, a back-office tool, another company's
service) can use them directly, so that a workspace which has no websites at all becomes a **hub**:

- one place that holds the credentials of the third-party services (CRM, mail, payments, ERP) and is the only one that talks to them;
- one place that holds the application's structured data (Data Classes and Data Objects) with a dashboard to edit it;
- one place that holds the files (assets), kept private while the app is in development and **mirrored to a CDN** for production;
- one gate in front of all that, with keys, scopes, limits and a log, so each application gets exactly what it needs.

This fits the deployment model ("one workspace per organisation", see the [architecture overview](../../release/architecture/architecture-overview.md)):
an organisation that does not want the content side can still run a workspace for the integration side.

## 2. What exists today (checked in the code, 2026-10-12)

| Capability | Who can use it now | Gap for an external application |
|---|---|---|
| Gateway, call a configured route: `/api/remote/:endpoint/*` (`apps/gateway/src/remote-router.ts`) | a signed-in dashboard user with `gateway:manage` | needs a session **cookie**; no machine identity. All routes of an endpoint are reachable; there is no per-caller scope |
| Gateway, `/api/v1/gateway/resolve` and `/submit` | visitors of published pages | work only through a `bindingId` made by saving a page; they read one pinned field or send one pinned form. They are not a generic proxy |
| Data objects, authenticated CRUD (`/data-objects`, `requireAnyPermission`) | a signed-in user | cookie session; permission is by role (`data_objects:*`, `objects:*`), not by class |
| Data objects, `/public/data-objects`, `/public/data-objects/query` | anyone | **published records only**, no authentication, no per-caller scope, no writes |
| Assets, `/public/assets/:uuid`, the `/dam-asset/*` proxy | anyone for public assets; a session for private ones | no way for an app to read private assets; no short-lived links for an app |
| CDN mirror of assets (`cdnMirrors` per asset, `/public/dam/assets/mirror-status`) | the publish tooling | not exposed as "give me the best URL for this asset" |
| Rate limiting | per client address and per website (public gateway paths); per endpoint (`/api/remote`), in memory | no limit, quota or log **per application** |
| Identity | users with roles; sessions; TOTP | no API keys, no service accounts, no tokens |

Two smaller problems in `/api/remote`, relevant if it becomes the base of the new surface:

- a route is matched by **exact path** (`r.path === wildcardPath`), so a route with a parameter (`customers/{id}`) can never be
  called through it;
- the query string and the response headers are not carried over, and a non-JSON reply is returned as JSON text. An application
  needs query parameters, status codes and, at times, binary replies.

## 3. Goals and non-goals

Goals

1. An application authenticates with a **key**, not with a person's session.
2. Each key has an explicit **scope**: which gateway routes (and methods), which data classes (read / write), which asset folders.
   Nothing is allowed by default.
3. Everything passes through the same protections that exist today: credentials only on the server, the SSRF guard, redaction, fixed
   error messages, encryption at rest.
4. Each application has its own **limits, usage figures and log**, and a key can be revoked or rotated without touching the others.
5. Development and production are separate workspaces, with the **same API shape**, so the application changes a base URL and a key.
6. An application can learn what it may call: a generated **OpenAPI document per key**, useful for Dart / Kotlin / Swift code generation.

Non-goals (for now)

- Authenticating the **end users of the application**. A key identifies the *application*, not a person. See 6.3 and section 12 (tokens of the organisation's own identity provider).
- Making Whoobe a shared multi-tenant platform. One workspace stays one organisation.
- Replacing an API management product (billing plans, a developer portal, monetisation).
- A workflow engine. Automations stay in Activepieces / n8n.

## 4. Proposal

### 4.1 A new entity: API client

A **client** is an application that may call Whoobe. Dashboard name: **API clients**.

```
api_clients
  id, name, description
  kind              'server' | 'public'          -- see 6.3
  status            'active' | 'suspended' | 'revoked'
  key_prefix        first characters, shown in the list
  key_hash          hash of the key (never the key); a second slot for rotation
  key_hash_next     optional: both keys work during a rotation
  scopes            jsonb, see 4.2
  rate_limit_rps    integer, per client
  daily_quota       integer or null
  allowed_ips       cidr[] or null          -- server clients
  allowed_origins   text[] or null          -- browser clients
  expires_at        timestamp or null
  created_by, created_at, last_used_at
```

- Key format `wbk_<8 char prefix>_<32 bytes random, base64url>`. Shown **once** at creation, like the existing website site key
  (`gatewayApiKeyHash` / `gatewayApiKeyPrefix` in `packages/core/src/db/websites-records.ts`; the same hashing helper is reused).
- Sent as `Authorization: Bearer <key>` (never in the query string, which ends up in logs).
- Verified in `packages/core` (shared by core-api and the gateway), so no service has to ask another over HTTP.
- Needs a new permission `clients:manage` (administrators by default). Only a person with it can create, change or revoke clients.

### 4.2 Scopes

A scope is a short text, matched by exact value or a trailing `*`:

| Scope | Allows |
|---|---|
| `gateway:call:<endpoint>:<METHOD>:<route>` | one route of one endpoint, `*` for all routes of the endpoint |
| `data:read:<class>` | list, get and query published records of a class, plus drafts if `data:read-draft:<class>` |
| `data:write:<class>` | create and update records of a class; created as **draft**, publishing needs `data:publish:<class>` |
| `assets:read:<folder>` | list assets of a folder, get metadata and a URL |
| `assets:write:<folder>` | upload into a folder (size and type limits apply) |

Rules: deny by default; a request outside the scope, an unknown endpoint and an unknown route all answer the **same** `404 Not found`
(no enumeration; `403` only for an address that the key does not allow); scopes are checked on every request, not cached past a revocation (cache at most a few seconds).

### 4.3 The client surface

One public prefix, `/client/v1`, served by the service that owns the data, behind the existing reverse proxy (path routing already
sends `/api/v1/gateway/` to the gateway). Enforcement stays **in each owning service**, so the gateway never acts as a deputy that
forwards the client's identity to core-api.

| Call | Service | What it does |
|---|---|---|
| `ANY /client/v1/gateway/:endpoint/<route path>` | gateway | calls a configured route; route templates (`customers/{id}`) are matched; query string and JSON body are forwarded; status code is kept; response headers pass an allow-list; credentials are added by the gateway |
| `GET /client/v1/data/:class`, `GET /client/v1/data/:class/:id`, `POST /client/v1/data/:class/query` | core-api | same query engine as `/public/data-objects`, with the client's scope and its draft rule |
| `POST /client/v1/data/:class`, `PATCH /client/v1/data/:class/:id` | core-api | write, validated against the Data Class definition |
| `GET /client/v1/assets`, `GET /client/v1/assets/:id` | core-api | metadata and URL: the **CDN mirror URL** when the asset is mirrored and the workspace prefers it; a **short-lived signed URL** for a private asset; the normal URL for a public one |
| `POST /client/v1/assets` | asset-processor | upload to a permitted folder |
| `GET /client/v1/openapi.json` | core-api | the document of what **this key** may call, generated from the scopes, the route schemas and the Data Classes |
| `GET /client/v1/me` | core-api | name, scopes, limits and usage of the calling key (for diagnostics) |

The existing `/api/remote/*` stays as it is, for dashboard users, but its core (build the URL, add credentials, call, run plugins)
is moved to one function, `callRoute()`, used by both. This also fixes the template and query-string problems above for both.

### 4.4 Limits, usage and log

- Rate limit per client (requests per second) and an optional daily quota; `429` with `Retry-After`. The counters are in memory per
  process like the existing ones; the gap is already documented ("the Redis backend is not implemented") and becomes more
  important here, see question 6.
- A log line per call: client id, scope used, method, route or class, status, duration, bytes. **No bodies, no query values, no
  credentials.**
- A small table of hourly counters per client (calls, errors, `429`s) for the dashboard; kept 90 days.
- The dashboard **API clients** page shows prefix, kind, status, last used, usage of the last 24 hours and 30 days, and lets an
  administrator edit scopes (pickers over the existing endpoints, routes, classes and folders), suspend, rotate and revoke.

### 4.5 Development and production

The model is two workspaces, **dev** and **prod**, each its own installation (that is how Whoobe is deployed), with the same
endpoints, classes and folders, and its own keys.

- The application has two configurations: base URL and key. Nothing else changes.
- **Assets:** in dev they stay in the workspace's private storage and are served by signed URLs. For prod, the existing CDN mirror
  copies them to the CDN; with "prefer mirror" on, `/client/v1/assets` returns the CDN URL, so the app never has to know.
- **Third-party credentials differ per workspace** (a sandbox key in dev, the real one in prod). They are never copied.
- **Definitions travel, secrets do not.** A *configuration bundle* (endpoints, routes, presets used, data classes, folder rules,
  client definitions **without keys**) is exported from dev and imported into prod, in the spirit of the existing
  [website bundle](../../release/guides/website-bundle.md). Phase 4.

### 4.6 A workspace that is only a hub

A "modules" setting in the workspace (Content on/off, Hub on/off) that hides websites, pages, snippets, themes and publishing from
the dashboard of a workspace that does not use them. Pure presentation: permissions already control access. Phase 5, optional.

## 5. What it looks like for a Flutter app

```dart
final api = Dio(BaseOptions(
  baseUrl: 'https://hub.example.com/client/v1',
  headers: {'Authorization': 'Bearer $whoobeKey'},
));

// a third-party service, credentials stay in Whoobe
final orders = await api.get('/gateway/shop/orders.json', queryParameters: {'status': 'open'});

// own data
final products = await api.post('/data/product/query', data: {'filters': [...], 'limit': 20});

// a file, the best URL for the environment
final photo = await api.get('/assets/$assetId');   // CDN URL in prod, signed URL in dev
```

The client generated from `/client/v1/openapi.json` gives typed calls for exactly the routes and classes the key may use.

## 6. Security considerations

1. **Confused deputy.** The gateway has broad power (it holds every credential). The client surface must check the scope **before**
   the route is resolved, and use the route's own record, never a name taken from the request without matching it to the scope.
   Tests: a client with scope for route A cannot reach route B of the same endpoint, even through path tricks (`..`, encoded
   slashes, a different method).
2. **Keys.** High-entropy random value; stored hashed; shown once; constant-time comparison; prefix for identification; expiry;
   optional IP allow-list; rotation with an overlap; revocation effective within seconds; a leaked key is useful only within its
   scopes and limits.
3. **A key inside a mobile app is not a secret.** Anyone can extract it from the binary. So there are two kinds:
   - `server`: kept in a back-end or a build pipeline. Any scope.
   - `public`: may be shipped in an app or a web page. Only **read** scopes, plus write scopes explicitly marked and given a very low
     limit (a form-like use). Calls with side effects at a third party are refused to a `public` key.

   The consequence, said plainly: **a public key does not identify a person.** If the app has user accounts and each user must see
   only their own data, the key is not enough; section 12.
4. **Abuse of write scopes.** Data writes go in as drafts, are validated against the class, and are limited by size; uploads check
   the declared type against the content, as form uploads already do.
5. **No new outbound paths.** Gateway calls keep the SSRF guard, timeouts and the credentials-never-returned rule. Replies relayed
   to a client keep the header allow-list and the redaction of credential-shaped keys is **not** applied to the body (it would break
   legitimate data), so scopes, not scrubbing, are what protects a reply; document it.
6. **Logging** never contains a key, a body or a query value.
7. **Threat model.** The [threat model](../../release/security/threat-model.md) gets a new actor ("an application holding a key") and the
   controls above; the security suite gets an authorisation matrix (every scope against every route, method and class).

## 7. Alternatives considered

| Option | Why not (now) |
|---|---|
| A service user with a normal login (cookie session) | MFA and expiry get in the way, a cookie jar in an app is awkward, no scopes finer than a role, no per-app limits or log |
| Signed tokens (JWT) as the only mechanism | revocation and scope changes are slow; a rotation story is still needed. Kept as a later addition |
| Whoobe as an OAuth2 authorisation server (client credentials, then short-lived access tokens) | the standard answer and where it should end up; but it is more to build and secure. The design leaves room: `POST /client/v1/token` can later exchange a key for a short token without changing the scopes |
| A separate "hub" service | one more service to run and to keep consistent with the data; no benefit while the owning services can enforce the scopes themselves |
| Reusing the website site key | it is a different thing: it ties a published site to its own bindings. Mixing the two would widen what a leaked site key can do |

## 8. Phases

Each phase ends in something usable, with tests and documentation.

| Phase | Content | Size |
|---|---|---|
| **1. Gateway for clients** (done 2026-10-12) | `api_clients` table and migration (expand only); key creation, hashing, verification in `packages/core`; `callRoute()` extracted from `/api/remote` (templates, query string, status, header allow-list, binary); `/client/v1/gateway/*` with route-level scopes; per-client rate limit; usage log; dashboard page (create, scopes, revoke, rotate); `clients:manage` permission | the largest; this alone answers the original question |
| **2. Data objects** | read done 2026-10-13: `GET /client/v1/data/:class[/:id]`, scope `data:read:<Class>`, published only. Write (class scopes, validation, draft rule) still to do | medium |
| **3. Assets and OpenAPI** | `/client/v1/assets` read with CDN-mirror and signed URLs, upload with folder scope; per-key `openapi.json`; hourly usage counters in the dashboard | medium |
| **4. Environments** | configuration bundle export / import without secrets or keys; "prefer CDN mirror" workspace setting | medium |
| **5. Hub-only workspace** | module switches in the dashboard | small |
| **2b. Identity provider tokens** | section 12 | medium |
| **6. Whoobe-issued tokens (optional)** | `POST /client/v1/token`, short-lived tokens | decided later |

Cross-cutting, every phase: update `docs/release/api/gen-api-docs.py` (the route table the documentation gate reads) and
`scripts/security/routes.expected.json`; add the unit and API tests, including the authorisation matrix; log in `CHANGES.md`; update the
[Integrations guide](../../release/guides/integrations/integrations.md), the [authentication document](../../release/architecture/authentication-and-authorization.md),
the [threat model](../../release/security/threat-model.md) and the [configuration reference](../../release/operations/configuration-reference.md)
for any new variable.

## 9. Documentation and tests that prove it

- Unit: key generation and verification, scope matching (exact, wildcard, no match, malformed), expiry, rotation overlap.
- API: every endpoint of `/client/v1` against a matrix of keys (no key, wrong key, revoked, expired, suspended, right scope, wrong
  scope, wrong method, other endpoint's route, other class, other folder, `public` key with a write scope).
- Path tricks on `/client/v1/gateway`: `..`, `%2e%2e`, double slash, a different case, a trailing dot.
- Limits: `429` and `Retry-After`; a revoked key stops working within the cache time.
- A check that no log line or error body contains a key or a credential.

## 10. Risks

- **Scope creep into an API management product.** Hold the line at: keys, scopes, limits, log. No plans, billing or portal.
- **A broad `gateway:call:<endpoint>:*` scope** hands a client every route of that endpoint, including writes at the third party. The
  dashboard should warn when a scope is that wide and default to listing routes one by one.
- **In-memory counters** under several gateway processes undercount. Acceptable for a first release if documented; a shared store
  is a prerequisite before relying on quotas for protection.
- **Drift.** `/api/remote` and `/client/v1/gateway` must share `callRoute()` or they will diverge, as the older duplicated auth code did.

## 11. Decisions (2026-10-12)

1. ~~Both kinds of client, `server` and `public`.~~ **Revised 2026-10-13: no secret or static key ever travels from a browser or an app.**
   A static key is accepted only from a **server** (server-to-server). A browser or a mobile app sends only a **token issued by the
   organisation's identity provider**, which Whoobe validates against that provider (section 12). The `public` kind of phase 1 is
   removed (see 14).
2. **No end-user accounts in Whoobe.** The organisation already has an identity system (Keycloak, Entra ID / Azure AD, AWS Cognito,
   Auth0, ...) that issues JWTs. Whoobe does not store or authenticate people; it **validates** the identity provider's tokens when a
   client asks for it (section 12). Server-to-server use stays the main model: the organisation's back-end authenticates its users and
   calls Whoobe with a `server` key.
3. **Phase 1 first, alone:** `/client/v1` for the gateway, keys, scopes, limits, log, dashboard page.
4. **Rate limiting with a shared store**: Valkey (BSD-licensed Redis fork), see section 13. It also fixes the "Redis backend is not
   implemented" gap of the existing per-endpoint limit.
5. **Development and production are two workspaces.**

Details settled while implementing phase 1:

- Keys live in their own table (`api_client_keys`, several per client): rotation is "add a key, move the app, revoke the old one".
  The key carries a lookup prefix (`wbk_<8>_<secret>`), the hash is HMAC-SHA-256 with `SITE_API_KEY_PEPPER` (already required and
  provisioned), compared in constant time.
- Managing clients needs `gateway:manage` for now (a client is gateway access). A separate `clients:manage` permission can follow with
  the data and asset scopes.
- A `public` client may only hold **read** scopes (`GET`); this is enforced when scopes are saved and again on every call.
- The scope names the endpoint by its **name** and the route by its **template** (`customers/{id}`). The request path is matched to a
  configured route first and the scope is checked against that route, never against the raw path. Renaming an endpoint removes access
  until the scope is updated (fails closed).
- Upstream replies: the status is kept for `2xx` to `4xx`; an upstream `5xx` becomes `502` with a fixed message. JSON and text only;
  binary replies come later.
- Usage: `last_used_at` and one structured log line per call in phase 1; the hourly counters of 4.4 come with phase 3.
- Equally specific templates (`products/{id}` and `products/{name}`, which exist in real configurations) are resolved among the routes the
  client may call; `/api/remote` takes the first one listed.
- Failed keys: 20 from one address lock that address for a minute, before any database work.
- Not done in phase 1 and still open: data objects and assets on `/client/v1` (phases 2 and 3), binary and multipart bodies, hourly usage
  counters, the identity-provider tokens of section 12.

## 12. Identity provider tokens (phase 2)

A client may be configured with a **trust** in an identity provider:

```
issuer      https://idp.example.com/realms/acme
jwks_uri    taken from the issuer's OIDC discovery document, or set by hand
audience    the value the tokens must carry in `aud`
algorithms  RS256 / ES256 (never `none`, never HS256 with a public key)
claims      which claim holds roles / scopes, and how they map to Whoobe scopes
```

- The request carries the **client key** (which application is calling) in `X-Whoobe-Key` and the **user's token** in
  `Authorization: Bearer <jwt>`. Whoobe verifies signature (keys from the JWKS, cached with a short life and re-read on an unknown
  `kid`), `iss`, `aud`, `exp` and `nbf` with a small clock tolerance. Refreshing a token is the application's job with its identity
  provider; Whoobe never sees a refresh token.
- The effective scopes are the **intersection** of the client's scopes and what the token's claims grant. The token's subject is
  written to the log and can be passed to a plugin, so an upstream request can carry it; no user is created in Whoobe.
- A `server` client may also be configured to accept **only** a token (client credentials of the identity provider, "machine to
  machine"), with no Whoobe key at all.
- Library: `jose` (MIT). Tests: expired, wrong audience, wrong issuer, unknown `kid`, algorithm confusion, a token for another client.

## 13. Rate limiting (shared store)

Requirements: correct across several processes, open source, easy to install and configure, safe by default.

- **Valkey 8** (BSD-3, Linux Foundation) as the shared counter store; any Redis-protocol server works (Redis, KeyDB, a managed
  service). Client library `ioredis` (MIT).
- **Install:** one extra service in the compose files, no published port, a generated password, data not persisted (counters are
  disposable). `provision-workspace.sh` generates the password. Configuration is two variables that already exist:
  `GATEWAY_RATE_LIMIT_BACKEND=redis` and `GATEWAY_REDIS_URL=redis://:password@valkey:6379` (`rediss://` for TLS).
- **Algorithm:** sliding-window counter (current and previous window weighted), one **Lua script** so the check and the increment are
  atomic; per-client requests per second and a per-client daily quota; the answer carries the remaining count and the time to wait,
  returned as `429` with `Retry-After` and `RateLimit-*` headers.
- **Failure behaviour:** if the store is unreachable the gateway falls back to the in-process limiter, logs it (once per minute) and
  reports `degraded` on its health endpoint. It does not stop serving, and it does not silently let everything through.
- The same store then serves the existing per-endpoint limit of `/api/remote`. The public `resolve` and `submit` limiters remain in
  process for now (they are synchronous and sit before any database access); moving them is a later step.

## 14. Revision of 2026-10-13: two ways in, no shipped keys

Phase 1 was tested by the owner and works. The decision that follows from it: a key that a client (browser or app) carries can be read by
anyone, and nothing a third party can verify stands behind it. So:

| Caller | Credential | Who vouches for it |
|---|---|---|
| A back-end, a job, another system (server-to-server) | an API client key, kept in that server | Whoobe (hash, scopes, limits, address list) |
| A browser or a mobile app | the **access token of the organisation's identity provider** (JWT), sent as `Authorization: Bearer` | the identity provider (signature, issuer, audience, expiry), checked by Whoobe against the provider's published keys |

Consequences for the design:

- **The `public` kind is removed.** A client is either `key` (server-to-server) or `jwt` (identity-provider token); a client has one
  way in, not both, so a client's blast radius is clear. Existing `public` clients are converted or refused on migration (none are in use).
- **A `jwt` client holds no secret at all.** It is a *registration* of an application: issuer, audience, accepted algorithms, the scopes it
  grants, and the claims a token must carry. Nothing in it can be used by someone who does not hold a valid token.
- **Scopes can follow the token.** The client's scopes are the ceiling; a claim (role, group or scope of the identity provider) can
  narrow them per user: `orders-reader` grants `gateway:call:Shop:GET:orders.json`, `orders-admin` adds the writes. A token with none
  of the mapped claims is refused.
- **Static keys are refused from a browser.** A request carrying a key and an `Origin` header (what browsers add) is refused for a
  `key` client, and a `key` client's address list is the recommended control. (Not a perfect test, since a script can omit `Origin`,
  but it stops the common mistake and is logged.)
- **Refresh and sign-in are the identity provider's job.** Whoobe never sees a refresh token, a password or a client secret of the user.
- **Opaque tokens.** An identity provider that issues non-JWT access tokens needs token introspection (RFC 7662), which needs a secret of
  Whoobe's own at the provider. Out of scope for now; JWT is what Keycloak, Entra ID, Cognito and Auth0 issue by default.
- **No user is created in Whoobe.** The token's `sub` (and a configurable name claim) go in the log line of each call and are available
  to a plugin; that is all.

What the validation does (section 12 stays the specification): signature with a key from the provider's JWKS (cached, re-read once on an
unknown `kid`, never more often than every 30 seconds), `alg` only from the allow-list, `iss` equal to the registered issuer, `aud`
containing the registered audience, `exp` and `nbf` with 60 seconds of tolerance, `typ`/`azp` when registered; the JWKS address is taken
from the issuer's discovery document over HTTPS through the same outbound guard as every other call (`safeFetch`).

Delivery, replacing the phase list of section 8 for what remains:

| Step | Content |
|---|---|
| **2a** (done 2026-10-13) | remove `public`; `auth_mode` on a client (`key` or `jwt`); refuse a key from a browser; the dashboard form follows |
| **2b** (done 2026-10-13) | JWT validation with `jose`: client registration (issuer, audience, algorithms, claims), JWKS cache, claim-to-scope mapping, log of `sub`; tests with generated keys (expired, wrong audience, wrong issuer, unknown `kid`, `alg: none`, HS256 with a public key, a token for another client) and one end-to-end run against a local Keycloak |
| **2c** (done 2026-10-13, Keycloak tested; Entra ID, Cognito and Auth0 documented but not tested) | the guide: how to set it up with Keycloak, Entra ID and Cognito |

Implementation notes (2026-10-13): registration and claim rules in `packages/core/src/gateway/client-jwt.ts`; verification in
`apps/gateway/src/jwt-verify.ts` (`jose` 5, own JWKS cache through `safeFetch`); `api_clients.jwt_config` (migration 0058). A token that is
valid but gives no access answers `403`; any other failure `401`. Several token clients may share an issuer (different audiences or
authorized parties): the gateway tries each active client of the issuer until one accepts. Verified against Keycloak 26 (realm roles,
audience mapper, tampered and foreign-application tokens, a user without a role, suspension, CORS preflight, per-user limit).

## 14. Assets for API clients (phase 3, read part) — 2026-10-13

A Data Object stores an asset as `{ "assetId" }`; a public address does not exist for private files and, in a local installation, the
storage is not reachable from the application. Decisions:

- Scope `assets:read:<folder | *>`; a folder includes its sub-folders (`/products` does not match `/products-old`). The scope decides,
  not the DAM's public / private flag.
- `GET /client/v1/assets?folder=`, `GET /client/v1/assets/:id`: facts (no storage key) plus `url` (CDN mirror, or the public address of a
  public asset, else `null`) and `contentPath`.
- `GET /client/v1/assets/:id/content`: the gateway streams the file from the asset processor with `DAM_SERVICE_TOKEN` (works for private
  assets and for local installs), passes `Range`, and sends active content (HTML, SVG) as a download. Always available, so the application
  chooses between `url` and `contentPath`.
- `?expand=assets` on the data calls adds `asset` next to each `{ assetId }`, only for folders the scopes allow; otherwise the bare id stays.
- Left for later: upload (`assets:write`), short-lived signed links (they need the storage origin to be reachable by the application),
  hourly usage counters, per-key `openapi.json`.

