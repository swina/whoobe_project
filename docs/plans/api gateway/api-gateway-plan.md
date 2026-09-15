# API Gateway — Implementation Plan

**Status:** Draft · **Branch:** `api-gateway`

## 1. Context & Goals

The CMS currently exposes two independent Express services (`core-api` on port 3003, `asset-processor` on port 3002) directly to the admin-dashboard SPA and to headless clients. There is no unified entry point, no mechanism to proxy external/remote services through the CMS, and no way to auto-discover the shape of external API responses so they can be bound to CMS components (data objects, page blocks). The admin-dashboard hardcodes `VITE_CORE_API_URL` and `VITE_ASSET_PROCESSOR_URL` in `.env` — any new backend service requires a new env var and a new CORS/path config.

Goals:
1. **Unified entry point** — a single public-facing gateway that routes to internal services (`core-api`, `asset-processor`) and external remote APIs, with consistent auth/authorization, rate limiting, and logging.
2. **Remote endpoint configuration** — admin UI to define external API endpoints (URL, method, headers, auth type: none / API key / Bearer token / Basic auth) and associate them with permission checks.
3. **Auto-discover response shapes** — on the first request to a configured remote endpoint, introspect the response JSON, store the inferred field schema, and make it available for data binding in the CMS block editor (like `dataBinding` on CMS components).
4. **Plugin system** — a convention-based autoloading mechanism for custom TypeScript/JavaScript middleware and handlers that can intercept, transform, or augment gateway requests/responses.

### Non-goals (v1)

- Full OpenAPI/Swagger spec generation (response shape discovery is pragmatic inference, not formal schema parsing).
- GraphQL federation or schema stitching.
- Service mesh / sidecar proxy patterns (Envoy, Linkerd).
- HTTPS termination (assumes a reverse proxy like nginx/Caddy sits in front, same as today).

---

## 2. Architecture

```
                        ┌──────────────────────────────────┐
                        │       Reverse Proxy (nginx)       │
                        │   (terminates TLS, static assets) │
                        └──────────────┬───────────────────┘
                                       │
                        ┌──────────────▼───────────────────┐
                        │       API Gateway (express)       │
                        │   port 3001 (new apps/gateway)   │
                        │                                  │
                        │  ┌────────────────────────────┐  │
                        │  │  Router                     │  │
                        │  │  /api/internal/* → core-api │  │
                        │  │  /dam/*         → asset-proc│  │
                        │  │  /api/remote/*  → external  │  │
                        │  │  /health         → gateway  │  │
                        │  └────────────────────────────┘  │
                        │                                  │
                        │  Middleware pipeline:            │
                        │  auth → rate-limit → log → route │
                        │                                  │
                        │  ┌────────────────────────────┐  │
                        │  │  Plugin loader              │  │
                        │  │  (autoload from ./plugins)  │  │
                        │  └────────────────────────────┘  │
                        │                                  │
                        │  ┌────────────────────────────┐  │
                        │  │  Schema registry            │  │
                        │  │  (stores inferred response  │  │
                        │  │   shapes for data binding)  │  │
                        │  └────────────────────────────┘  │
                        └──────────────┬───────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
   │   core-api       │    │ asset-processor  │    │  External APIs   │
   │   port 3003      │    │ port 3002        │    │  (remote, auth)  │
   └──────────────────┘    └──────────────────┘    └──────────────────┘
```

### 2.1 New workspace: `apps/gateway`

A new Express application in the monorepo at `apps/gateway/`, registered in `pnpm-workspace.yaml` and `turbo.json`. It:

- Shares the same `.env` via `loadRootEnv()` from `@whoobe-cms/core/server`.
- Reuses existing `requireAuth`, `requirePermission`, session validation from `@whoobe-cms/core/server`.
- Does **not** replicate the full core-api route surface — it proxies to core-api for internal routes. It only owns:
  - Gateway-specific admin routes (remote endpoint CRUD, schema registry queries, plugin management).
  - The proxy engine itself.
  - The plugin loader.

### 2.2 Proxy engine

A lightweight, generic HTTP proxy function (no external proxy library — `node:http` `fetch` is sufficient):

```
gatewayFetch(url, method, headers, body, timeout) → { status, headers, body }
```

- Streams request body to the upstream, streams response back to the client.
- Applies per-route timeout (configurable per endpoint).
- Rewrites `Location` headers in redirect responses to point back to the gateway.
- Strips internal-only headers (`x-internal-*`) from responses.
- Logs request/response metadata (method, path, status, durationMs).

### 2.3 Service registry (internal, static)

Internal services (`core-api`, `asset-processor`) are configured via environment variables, not the admin UI:

```
GATEWAY_CORE_API_URL=http://core-api:3003
GATEWAY_ASSET_PROCESSOR_URL=http://asset-processor:3002
```

These are wired at startup — no DB round-trip needed for internal routing. The gateway mounts them at fixed prefixes:

| Gateway path | Upstream | Auth required |
|---|---|---|
| `/api/internal/*` | `$GATEWAY_CORE_API_URL` | Inherits existing per-route guards |
| `/dam/*` | `$GATEWAY_ASSET_PROCESSOR_URL` | Inherits existing per-route guards |
| `/public/*` | `$GATEWAY_CORE_API_URL` | No auth (public content) |

Internal routes pass through the original `requireAuth`/`requirePermission` checks **at the gateway** before proxying, so the guard logic is centralized and internal services can (optionally) trust the gateway's `X-Authenticated-User` header instead of re-checking sessions.

### 2.4 Remote endpoint registry (dynamic, DB-backed)

A new Drizzle table `gateway_endpoints` for user-configured external APIs:

```sql
CREATE TABLE gateway_endpoints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,          -- display label, e.g. "Shopify Products"
  description   text NOT NULL DEFAULT '',
  base_url      text NOT NULL,                  -- e.g. https://api.shopify.com/admin/api/2024-01
  auth_type     text NOT NULL DEFAULT 'none'    -- none | api-key | bearer | basic
    CHECK (auth_type IN ('none','api-key','bearer','basic')),
  auth_config   jsonb NOT NULL DEFAULT '{}',    -- { keyHeader: 'X-API-Key', keyValue: '...' }
                                                 --   or { token: '...' }
                                                 --   or { username: '...', password: '...' }
  request_timeout_ms integer NOT NULL DEFAULT 30000,
  rate_limit_rps    integer NOT NULL DEFAULT 0, -- 0 = unlimited
  rate_limit_burst  integer NOT NULL DEFAULT 0,
  required_permission text,                     -- null = any authed user; else a permission key
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

And a child table for individual routes under each endpoint:

```sql
CREATE TABLE gateway_routes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id   uuid NOT NULL REFERENCES gateway_endpoints(id) ON DELETE CASCADE,
  path          text NOT NULL,                  -- relative path template, e.g. /products.json
  method        text NOT NULL DEFAULT 'GET',
  description   text NOT NULL DEFAULT '',
  request_body_schema jsonb,                    -- optional Zod-ish field hints for admin UI
  response_schema_id  uuid,                     -- FK to gateway_schemas — set after first request
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, path, method)
);
```

### 2.5 Schema registry (auto-inferred response shapes)

A Drizzle table `gateway_schemas` stores the inferred field structure of external API responses:

```sql
CREATE TABLE gateway_schemas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id      uuid NOT NULL REFERENCES gateway_routes(id) ON DELETE CASCADE,
  schema        jsonb NOT NULL,                 -- inferred field tree (see §3.3)
  sample_payload jsonb,                         -- first response, for reference
  inferred_at   timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id)
);
```

The `schema` JSON shape:

```json
{
  "type": "object",
  "fields": [
    { "key": "id", "type": "string", "nullable": false, "sample": "12345" },
    { "key": "title", "type": "string", "nullable": true, "sample": "Energy Drink Pro" },
    { "key": "price", "type": "number", "nullable": false, "sample": 29.99 },
    { "key": "variants", "type": "array", "nullable": true,
      "items": {
        "type": "object",
        "fields": [
          { "key": "sku", "type": "string", "nullable": false, "sample": "EDP-001" },
          { "key": "stock", "type": "number", "nullable": true, "sample": 42 }
        ]
      }
    },
    { "key": "metadata", "type": "object", "nullable": true,
      "fields": [
        { "key": "created_at", "type": "string", "nullable": false, "sample": "2026-01-15T10:00:00Z" },
        { "key": "tags", "type": "array", "nullable": true,
          "items": { "type": "string", "nullable": true, "sample": "featured" }
        }
      ]
    }
  ]
}
```

Inference rules:
- Scalar values → `string`, `number`, `boolean`, `null`.
- Arrays → `array` with `items.type` inferred from the first element.
- Nested objects → recursed into `object` with `fields`.
- Mixed-type arrays → `items.type = "any"` with the union of observed types.
- Null values → `nullable: true` on the field.
- First request stores the raw response as `sample_payload`; subsequent requests can optionally update the schema if `auto_update` is enabled on the route.

### 2.6 Plugin system

**Convention-based autoloading**: at startup, the gateway scans `apps/gateway/plugins/` (and optionally an additional path from `GATEWAY_PLUGINS_PATH` env) for `.ts`/`.js` files.

Each plugin exports a factory:

```ts
// apps/gateway/plugins/my-transform.ts
import type { GatewayPlugin } from '../plugin-types';

export default {
  name: 'my-transform',
  // Optional: register additional routes on the gateway
  routes: (router) => {
    router.get('/api/v1/custom/transform', async (req, res) => { ... });
  },
  // Optional: intercept a proxied request before it's sent upstream
  requestMiddleware: async (ctx) => {
    // ctx: { req, endpoint, route, upstreamUrl, upstreamHeaders, upstreamBody }
    ctx.upstreamHeaders['X-Custom'] = 'value';
    return ctx;
  },
  // Optional: transform the upstream response before returning to client
  responseMiddleware: async (ctx) => {
    // ctx: { req, res, endpoint, route, upstreamResponse, body }
    ctx.body = transformBody(ctx.body);
    return ctx;
  },
} satisfies GatewayPlugin;
```

Plugin interface (`apps/gateway/src/plugin-types.ts`):

```ts
export interface GatewayPlugin {
  name: string;
  routes?: (router: Router) => void;
  requestMiddleware?: (ctx: RequestContext) => Promise<RequestContext>;
  responseMiddleware?: (ctx: ResponseContext) => Promise<ResponseContext>;
}
```

Plugins are loaded into named middleware chains: each remote route can have an ordered list of plugin names to apply (stored in `gateway_routes` as `plugin_chain text[]`). The default chain is empty — no transformation.

---

## 3. Admin UI (admin-dashboard)

### 3.1 New sidebar section: "API Gateway"

- **Endpoints** — CRUD table: name, base_url, auth_type, status (active/inactive). Create/edit form with auth config fields (API key header name + value, bearer token, basic user/password).
- **Routes** — per-endpoint nested list: path, method, description, response schema status (inferred / not yet). "Test" button to fire a request and trigger schema inference.
- **Schema viewer** — read-only tree view of the inferred response schema, with copy-to-clipboard for the field key paths (for use in CMS data binding `{{ gateway:endpointName:routePath:field.key }}`).
- **Plugins** — listing of loaded plugins from the autoloader (name, routes registered, middleware count). No CRUD — plugins are files on disk. Future: enable/disable toggle per plugin.

### 3.2 Data binding integration

The block editor's data binding picker (used today to bind data object fields to components) gains a new source type: `gateway`. When the user selects a gateway endpoint + route, the schema registry populates the available fields (flat list of dot paths from the inferred schema). The binding syntax:

```
{{ gateway:endpointName:routePath:field.path }}
```

The renderer (at publish/serve time) resolves these by calling the gateway's internal `/api/v1/gateway/resolve` endpoint, which proxies to the remote endpoint and extracts the field value from the response using a JSON path expression.

### 3.3 Client SDK impact

The headless SDK renderers (Nuxt, Next, Svelte, Vue, React) need to handle the new `gateway:` binding prefix. Details in §6.

---

## 4. Gateway API routes

All mounted on the gateway Express app (port 3001), admin routes protected by `requirePermission` with a new permission key `GATEWAY_MANAGE: 'gateway:manage'`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | none | Gateway health |
| `GET`  | `/api/v1/gateway/endpoints` | `gateway:manage` | List configured remote endpoints |
| `POST` | `/api/v1/gateway/endpoints` | `gateway:manage` | Create endpoint |
| `GET`  | `/api/v1/gateway/endpoints/:id` | `gateway:manage` | Get endpoint detail |
| `PATCH`| `/api/v1/gateway/endpoints/:id` | `gateway:manage` | Update endpoint |
| `DELETE`| `/api/v1/gateway/endpoints/:id` | `gateway:manage` | Delete endpoint (cascades routes + schemas) |
| `GET`  | `/api/v1/gateway/endpoints/:id/routes` | `gateway:manage` | List routes for endpoint |
| `POST` | `/api/v1/gateway/endpoints/:id/routes` | `gateway:manage` | Create route |
| `PATCH`| `/api/v1/gateway/routes/:id` | `gateway:manage` | Update route |
| `DELETE`| `/api/v1/gateway/routes/:id` | `gateway:manage` | Delete route |
| `POST` | `/api/v1/gateway/routes/:id/test` | `gateway:manage` | Fire request, infer/return schema |
| `GET`  | `/api/v1/gateway/routes/:id/schema` | `gateway:manage` | Get inferred schema |
| `POST` | `/api/v1/gateway/routes/:id/refresh-schema` | `gateway:manage` | Re-fire and re-infer schema |
| `GET`  | `/api/v1/gateway/plugins` | `gateway:manage` | List loaded plugins |
| `POST` | `/api/v1/gateway/resolve` | `gateway:manage` | Resolve a binding expression (`{endpoint, route, fieldPath}`) by proxying the remote and extracting the value |

### Proxy routes (internal)

| Pattern | Destination | Notes |
|---|---|---|
| `/api/internal/*` | `core-api` on `GATEWAY_CORE_API_URL` | Strips `/api/internal` prefix before forwarding; `requireAuth` enforced at gateway |
| `/dam/*` | `asset-processor` on `GATEWAY_ASSET_PROCESSOR_URL` | Proxies directly; `requireAuth` enforced at gateway |
| `/public/*` | `core-api` on `GATEWAY_CORE_API_URL` | No gateway-level auth (public routes) |

### Remote proxy route

Any `GET`/`POST`/`PUT`/`PATCH`/`DELETE` to `/api/remote/:endpointName/*` is matched against the `gateway_routes` table — the gateway looks up the endpoint by name, finds the matching route by method + path, checks the required permission (if any), applies rate limiting, and proxies the request with configured auth headers.

---

## 5. Rate limiting & security

Per-endpoint rate limiting (sliding window, in-memory for single-process; Redis-backed for multi-instance — selected by `GATEWAY_RATE_LIMIT_BACKEND=memory|redis` env var):

- **Per-endpoint**: `gateway_endpoints.rate_limit_rps` requests per second, `rate_limit_burst` burst.
- **Global fallback**: `GATEWAY_DEFAULT_RATE_LIMIT_RPS=10` for endpoints without explicit limits.
- **Auth failures on remote**: if a remote returns 401/403, the gateway logs it and returns a generic 502 with `X-Gateway-Error: upstream-auth-failed`.

Secrets stored in `auth_config` (API keys, bearer tokens, passwords) are encrypted at rest in the DB using the existing `MIGRATION_SOURCE_ENCRYPTION_KEY` (aes-256-gcm). They are decrypted only at proxy time, never logged or returned in API responses.

---

## 6. Binding resolution & rendering

The binding syntax `{{ gateway:endpointName:routePath:field.path }}` is resolved by the CMS at two points:

### 6.1 At edit time (admin-dashboard)

The block editor calls `POST /api/v1/gateway/resolve` with `{ endpointName, routePath, fieldPath, params }` (params are optional query/path parameters the user can configure per binding). The gateway proxies the remote, extracts the field using a simple JSON path resolver (dot-separated, with `[n]` for array indices), and returns the value for live preview.

### 6.2 At render time (published site)

Two approaches, in order of recommendation:

**A. Server-side resolution (recommended for Nuxt/Next SSR):** The publish CLI generates a gateway client module that the SSR server imports. At render time, it calls the gateway's internal `/api/v1/gateway/resolve` endpoint (from the render server, not the browser). The gateway must be network-reachable from the render server.

**B. Client-side resolution (fallback for static/SPA):** The renderer emits a `<whoobe-gateway-data>` script tag with the endpoint config, and the client SDK resolves bindings by calling the gateway's public `/api/remote/...` endpoint directly. Requires the gateway's public URL to be configured in the published site's env.

Both approaches share the same binding resolver module in `packages/core` (or `packages/sdk/schema`):

```ts
// packages/core/src/cms/gateway-binding.ts
interface GatewayBinding {
  endpointName: string;
  routePath: string;
  fieldPath: string;
  params?: Record<string, string>;
}

function parseGatewayBinding(expression: string): GatewayBinding | null;
function resolveGatewayBinding(binding: GatewayBinding, gatewayUrl: string): Promise<unknown>;
```

---

## 7. Files & modules

### New: `apps/gateway/`

```
apps/gateway/
  package.json                # name: "@whoobe-cms/gateway"
  tsconfig.json
  src/
    server.ts                 # Express app, middleware, bootstrap
    config.ts                 # Env loading, GATEWAY_* constants
    router.ts                 # Main router: internal, dam, remote, admin
    proxy-engine.ts           # Generic HTTP proxy function
    remote-router.ts          # Dynamic route matching for gateway_routes
    schema-inferrer.ts        # Response JSON → field tree inference
    plugin-loader.ts          # Autoload plugins/ directory
    plugin-types.ts           # GatewayPlugin type definitions
    admin-routes.ts           # CRUD routes for endpoints, routes, schemas, plugins
    resolve-handler.ts        # POST /api/v1/gateway/resolve
    rate-limiter.ts           # Sliding-window rate limiter
    auth.ts                   # requireAuth/requirePermission re-export/wrapper
  plugins/                    # Autoloaded plugin directory (initially empty)
    .gitkeep
```

### Updated: `packages/core/`

```
packages/core/src/
  db/gateway-schema.ts        # Drizzle schemas for gateway_endpoints, gateway_routes, gateway_schemas
  db/gateway-records.ts       # CRUD records for the three tables
  cms/gateway-binding.ts      # Binding parser + resolver (browser-safe, in index.ts barrel)
```

### Updated: `packages/core/src/server.ts`

Add barrel exports:
- `./db/gateway-schema.js`
- `./db/gateway-records.js`
- `./cms/gateway-binding.js` (Node-only portions)

### Updated: `packages/core/src/index.ts`

Add barrel export:
- `./cms/gateway-binding.js` (browser-safe: parser only, no fetch)

### Updated: `packages/core/src/auth/permissions.ts`

Add:
```ts
GATEWAY_MANAGE: 'gateway:manage',
```

Add `PERMISSIONS.GATEWAY_MANAGE` to the `admin` default role (already has `ALL_PERMISSION_KEYS` — no change needed).

### Updated: `apps/admin-dashboard/`

New components:
- `views/GatewayEndpointsView.vue` — endpoint CRUD
- `views/GatewayEndpointDetail.vue` — endpoint detail + route list
- `views/GatewayRouteDetail.vue` — route detail + schema viewer + test button
- `views/GatewayPluginsView.vue` — plugin listing
- `components/GatewaySchemaTree.vue` — recursive schema tree display
- `components/GatewayBindingPicker.vue` — data source picker for block editor

New store:
- `stores/gatewayStore.ts` — endpoints, routes, schemas, plugins state

Updated:
- `src/router/index.ts` — add gateway routes under `/gateway/*`
- `DashboardLayout.vue` — add "API Gateway" sidebar item (gated behind `gateway:manage`)

### Updated: `packages/sdk/schema/`

- `gateway-binding.ts` — shared binding resolver for all renderers (Nuxt, Next, Svelte, Vue, React)

---

## 8. Environment variables (new)

```
# apps/gateway
GATEWAY_PORT=3001
GATEWAY_CORE_API_URL=http://localhost:3003
GATEWAY_ASSET_PROCESSOR_URL=http://localhost:3002
GATEWAY_PLUGINS_PATH=          # optional, additional plugin directory outside the app
GATEWAY_DEFAULT_RATE_LIMIT_RPS=10
GATEWAY_RATE_LIMIT_BACKEND=memory  # memory | redis
GATEWAY_REDIS_URL=             # only if backend=redis
```

Added to `.env.example` and `docker-compose.yml` (new `gateway` service).

---

## 9. Docker & deployment

New service in `docker-compose.yml`:

```yaml
services:
  gateway:
    build:
      context: .
      dockerfile: Dockerfile
      target: gateway
    ports:
      - "3001:3001"
    env_file: .env
    depends_on:
      - core-api
      - asset-processor
```

Dockerfile gets a new build target `gateway` (multi-stage: build → `gateway` stage copies only `apps/gateway` and `packages/core`).

The reverse proxy (nginx) can then point the public entry point at the gateway instead of individual services:

```nginx
location /api/ {
    proxy_pass http://gateway:3001;
}
location /dam/ {
    proxy_pass http://gateway:3001;
}
location /public/ {
    proxy_pass http://gateway:3001;
}
```

---

## 10. Phased rollout

| Phase | Files | Deliverable |
|---|---|---|
| **1** | `apps/gateway/` scaffold + `package.json` + `server.ts` + `config.ts` + `proxy-engine.ts` + `router.ts` (internal + dam proxy) | Gateway starts, proxies `/api/internal/*` → core-api and `/dam/*` → asset-processor. Admin dashboard can point to gateway:3001 instead of two separate URLs. |
| **2** | `gateway-schema.ts`, `gateway-records.ts`, `admin-routes.ts`, `remote-router.ts`, `rate-limiter.ts`, `auth.ts`, new permission | Remote endpoint CRUD in admin UI; gateway proxies `/api/remote/:name/*` with auth injection and rate limiting. |
| **3** | `schema-inferrer.ts`, `resolve-handler.ts`, `GatewaySchemaTree.vue`, `GatewayBindingPicker.vue`, `gatewayStore.ts` | Schema inference on first test request; binding picker in block editor shows remote fields. |
| **4** | `plugin-loader.ts`, `plugin-types.ts`, `GatewayPluginsView.vue`, sample plugin | Plugin autoloading; plugin list UI; at least one working plugin (e.g. response pagination flattener). |
| **5** | `gateway-binding.ts` in `packages/core` + `packages/sdk/schema`; renderer integration in Nuxt/Next SDKs | `{{ gateway:... }}` bindings render on published sites (server-side preferred, client-side fallback). |
| **6** | Dockerfile target, docker-compose service, nginx config | Gateway containersized; reverse proxy routes through gateway; admin-dashboard `.env` reduced to single `VITE_GATEWAY_URL`. |
| **7** | Tests, curl verification, `CHANGES.md`, this doc | Verified round-trip: create endpoint → test → schema inferred → bind in page → render published site → value resolved. |

---

## 11. Risks & open items

1. **Session sharing** — The gateway validates sessions using the same `sessions` table (shared Postgres). If the gateway and core-api each independently check sessions, that's two DB round-trips per authed request. Mitigation: the gateway can pass `X-Authenticated-UserId` and `X-Authenticated-Permissions` headers to internal services, which can skip their own session check when these headers are present and the request originated from a trusted IP (the gateway's container IP). This is Phase 1 refinement, not a blocker.

2. **Response schema inference accuracy** — For deeply nested or polymorphic JSON, a single-response inference can be misleading. Mitigation: the schema viewer clearly shows "inferred from N samples"; users can manually adjust field types in a future phase.

3. **Remote endpoint auth secret storage** — API keys in the database (even encrypted) are a risk. The `MIGRATION_SOURCE_ENCRYPTION_KEY` env var is already used for Pimcore source credentials — same pattern, same caveat. The plan explicitly avoids logging or returning decrypted secrets in any API response.

4. **Plugin isolation** — Plugins run in-process with full access to the gateway. No sandboxing in v1. Mitigation: plugins must be reviewed before deployment; the plugin list UI is read-only (no upload from admin dashboard).

5. **Binding resolution latency** — Published sites that use `{{ gateway:... }}` bindings introduce remote API latency into page rendering. Mitigation: server-side SSR resolution caches responses (configurable TTL per route, stored in `gateway_schemas.cache_ttl_seconds` — added in Phase 5 refinement).

6. **Mixed-type arrays** — Real-world APIs sometimes return arrays with heterogeneous element types. The inferrer marks these as `"type": "any"` with an observed-type list — binding picker warns the user about potentially unstable field access.