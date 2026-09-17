# System Logger — Implementation Plan

## Overview

A structured, app-scoped logging system for Whoobe CMS. Server apps log via **pino** with file rotation and DAM upload. Browser apps use a lightweight console wrapper. All log files are persisted as managed assets in **DAM's private S3 storage** via the asset-processor.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   @whoobe-cms/logger                         │
│  createLogger(appName, config) → pino instance               │
│  ├─ Console transport (pino-pretty in dev, JSON in prod)     │
│  ├─ File transport via pino-roll                             │
│  │   └─ writes to logs/<app-name>/<app-name>-YYYY-MM-DD.log  │
│  └─ Rotation callback → upload rotated file to DAM (S3)      │
│       via POST /dam-asset/upload?folder=private/logs/...     │
└──────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
┌────────┴────────┐ ┌────────┴────────┐ ┌────────┴────────┐
│  core-api       │ │ asset-processor  │ │  gateway        │
│  (Express)      │ │  (Express)       │ │  (Express)       │
│  pino instance  │ │  pino instance   │ │  pino instance   │
└─────────────────┘ └─────────────────┘ └─────────────────┘

┌─────────────────────┐ ┌─────────────────────┐
│ admin-dashboard     │ │ whoobe-editor       │
│ (Vue 3 browser)     │ │ (Vue 3 browser)     │
│ wrapper/console     │ │ wrapper/console     │
└─────────────────────┘ └─────────────────────┘
```

Browser apps: thin console wrapper only — no file transport, no HTTP shipping to DAM.

---

## Logger Targets

| App | Package | Type | Logger Name | Transport |
|-----|---------|------|-------------|-----------|
| admin-dashboard | `@whoobe-cms/admin-dashboard` | Vue 3 browser | `admin-dashboard` | browser console (structured) |
| core-api | `@whoobe-cms/core-api` | Express server | `core-api` | pino file + stdout + DAM upload |
| whoobe-editor | `@whoobe-cms/whoobe-one-spike` | Vue 3 browser | `whoobe-editor` | browser console (structured) |
| asset-processor | `@whoobe-cms/asset-processor` | Express server | `asset-processor` | pino file + stdout + DAM upload |
| gateway | `@whoobe-cms/gateway` | Express server | `gateway` | pino file + stdout + DAM upload |

DAM and AI-generation are covered by their host apps (asset-processor and core-api), using a `module` field to distinguish sub-domains when needed.

---

## New Package: `packages/logger`

### Structure

```
packages/logger/
  src/
    index.ts              # createLogger(appName, opts?) → Logger
    types.ts              # LogLevel, LoggerConfig, LogPayload
    transports.ts         # pino-roll config, file path resolver
    dam-upload.ts         # rotation callback: uploads file to asset-processor API
    dam-upload.types.ts   # API types for DAM upload
    browser-logger.ts     # pino.browser() wrapper for Vue apps
  package.json            # deps: pino, pino-roll, pino-pretty (dev)
  tsconfig.json
```

### Dependencies

- `pino` — fast JSON logger for Node
- `pino-roll` — file rotation (daily, pattern `YYYY-MM-DD`)
- `pino-pretty` — dev console formatting (dev dependency)
- `pino.browser` — browser bundle for client-side apps (built into pino)

### Types

```ts
type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

interface LoggerConfig {
  level: LogLevel
  prettyPrint?: boolean    // enable pino-pretty in dev
  file?: boolean           // enable file transport
  damUpload?: boolean      // upload rotated files to DAM
  redact?: string[]        // paths to redact (passwords, tokens, API keys)
}

interface LogPayload {
  module?: string          // sub-module tag: dam, ai, auth, gateway, mail, search, workflow
  requestId?: string
  userId?: string
  latency?: number
  [key: string]: unknown
}
```

### Server API

```ts
import { createLogger } from '@whoobe-cms/logger'

const logger = createLogger('core-api', {
  level: process.env.LOG_LEVEL ?? 'info',
  file: true,
  damUpload: true,
  redact: ['req.headers.authorization', 'config.apiKey']
})

logger.info({ module: 'auth', userId: '123' }, 'User logged in')
logger.error({ err, module: 'ai', requestId: 'req_abc' }, 'AI generation failed')
logger.warn({ module: 'dam' }, 'Metadata extraction incomplete')
```

### Browser API

```ts
import { createBrowserLogger } from '@whoobe-cms/logger/browser'

const logger = createBrowserLogger('admin-dashboard')
logger.warn({ module: 'dam', url: '/assets' }, 'Failed to fetch assets')
logger.error({ err, module: 'editor' }, 'Block render error')
```

Browser output uses `console.groupCollapsed` + structured data in devtools — no file transport, no HTTP shipping.

---

## Log File & DAM Storage Paths

| Scope | Path |
|-------|------|
| Local file | `logs/<app-name>/<app-name>-YYYY-MM-DD.log` |
| DAM private folder | `private/logs/<app-name>/YYYY-MM/<app-name>-YYYY-MM-DD.log` |

- `logs/` added to `.gitignore`
- `logs/` created automatically by pino-roll on first write

---

## Rotation & DAM Upload Flow

1. **pino-roll** rotates daily at midnight using `pattern: 'YYYY-MM-DD'`
2. Rotation callback fires with the rotated file path
3. The callback:
   - Reads the rotated file
   - Checks its size (skip if empty)
   - Calls `POST /dam-asset/upload` on the **asset-processor** with:
     - `file` (multipart)
     - `folder` = `private/logs/<app-name>/YYYY-MM/`
     - `filename` = `<app-name>-YYYY-MM-DD.log`
     - `public` = `false`
   - On success: deletes the local rotated file
   - On failure: logs the error and keeps the local file for retry on next rotation
4. The logger package discovers the asset-processor URL from env: `ASSET_PROCESSOR_URL`
5. Authenticates via an internal service token: `DAM_SERVICE_TOKEN`

---

## Admin Dashboard Log Viewer

**View**: `/admin/system/logs`

### Features

| Feature | Detail |
|---------|--------|
| App filter | dropdown: core-api, asset-processor, gateway, whoobe-editor, admin-dashboard |
| Date range picker | from/to calendar, default last 7 days |
| Log level filter | error, warn, info, debug |
| Module filter | auth, dam, ai, gateway, mail, search, workflow |
| Free text search | searches `msg`, `err.message`, `errorMessage` fields |
| Result viewer | monospace inline viewer, syntax-highlighted JSON, expandable long lines |
| Download | download raw `.log` file from DAM for each result |
| Pagination | lazy-loaded, paginated results |

### Data Source

- `GET /dam-asset/list?folder=private/logs/<app-name>` — list available log files
- `GET /dam-asset/download/<id>` — fetch file content for a given log date

---

## Environment Variables

Add to `.env.example`:

```sh
# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# DAM Upload (for server-side logger file transport)
ASSET_PROCESSOR_URL=http://localhost:3002
DAM_SERVICE_TOKEN=<auto-generated-token>
```

---

## Implementation Phases

### Phase 1 — Foundation

Create `packages/logger` with:
- `createLogger(appName, config?)` factory
- Console transport (pretty in dev, JSON in prod)
- File transport via pino-roll (daily rotation)
- `types.ts` — `LogLevel`, `LoggerConfig`, `LogPayload`

### Phase 2 — DAM Upload

Add to `packages/logger`:
- `dam-upload.ts` — rotation callback that uploads to asset-processor
- `dam-upload.types.ts` — API request/response types
- Wire into pino-roll rotation handler

### Phase 3 — Wire Into Server Apps

In each server app's entry point (`src/server.ts`):
- core-api: replace `console` calls with `logger`
- asset-processor: replace `console` calls with `logger`
- gateway: replace `logGatewayError()` helper with `logger`

### Phase 4 — Replace Server-Side `console` Calls

- core-api: all route/controller files — migrate `console.error` → `logger.error`, `console.warn` → `logger.warn`
- asset-processor: same
- gateway: same

### Phase 5 — Browser Logging

- `packages/logger/src/browser-logger.ts` — `createBrowserLogger(appName)` wrapper
- admin-dashboard: wire into `main.ts` and replace `console` calls
- whoobe-one-spike: wire into `main.ts` and replace `console` calls

### Phase 6 — Log Viewer UI

- `apps/admin-dashboard/src/views/SystemLogsView.vue` — log viewer page
- `apps/admin-dashboard/src/stores/logStore.ts` — Pinia store for log fetching
- `apps/admin-dashboard/src/router/index.ts` — add `/admin/system/logs` route
- Leverage existing DAM store (`damStore.ts`) for asset listing/download

---

## Key Principles

- **Backward compatible**: `console` calls remain until explicitly migrated in Phases 4 and 5
- **Zero sensitive data leaks**: pino `redact` paths for passwords, API keys, auth tokens
- **stdout is always active**: production deployments capture stdout from PM2/Docker regardless of file transport
- **DAM as single source of truth for persisted logs**: local files are ephemeral; DAM holds the archive
- **Daily rotation**: avoids unbounded local disk usage; DAM upload clears rotated files locally