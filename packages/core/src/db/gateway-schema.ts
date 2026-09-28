import { pgTable, text, jsonb, uuid, timestamp, integer, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const gatewayEndpoints = pgTable('gateway_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  baseUrl: text('base_url').notNull(),
  authType: text('auth_type').notNull().default('none'),
  /** Deprecated - plaintext legacy column, kept only so a row written before
   *  the auth_config_encrypted migration (0039_gateway_auth_encrypted.sql)
   *  still reads correctly until it's next saved or backfilled (see
   *  gateway-records.ts's toRecord()/toRow()). Every write now clears this
   *  and stores ciphertext in authConfigEncrypted instead - never read or
   *  write this column directly outside gateway-records.ts. Drop once all
   *  environments have backfilled (packages/core/src/db/scripts/backfill-
   *  gateway-auth-encryption.ts) and this column is confirmed empty. */
  authConfig: jsonb('auth_config').$type<Record<string, unknown>>().default({}),
  authConfigEncrypted: text('auth_config_encrypted'),
  /** OAuth2 client-credentials token cache (authType='oauth2' only) - see
   *  0040_gateway_oauth_tokens.sql and gateway-auth-headers.ts's
   *  buildAuthHeaders(). Kept separate from authConfigEncrypted because it's
   *  server-managed state rewritten on refresh, not user-entered config. */
  oauthTokenEncrypted: text('oauth_token_encrypted'),
  oauthTokenExpiresAt: timestamp('oauth_token_expires_at', { withTimezone: true }),
  requestTimeoutMs: integer('request_timeout_ms').notNull().default(30000),
  rateLimitRps: integer('rate_limit_rps').notNull().default(0),
  rateLimitBurst: integer('rate_limit_burst').notNull().default(0),
  requiredPermission: text('required_permission'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  nameIdx: uniqueIndex('gateway_endpoint_name_idx').on(table.name),
}));

export const gatewayRoutes = pgTable('gateway_routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpointId: uuid('endpoint_id').notNull().references(() => gatewayEndpoints.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  method: text('method').notNull().default('GET'),
  description: text('description').notNull().default(''),
  requestBodySchema: jsonb('request_body_schema').$type<Record<string, unknown>>(),
  responseSchemaId: uuid('response_schema_id'),
  pluginChain: text('plugin_chain').array().notNull().default([]),
  autoUpdateSchema: boolean('auto_update_schema').notNull().default(false),
  cacheTtlSeconds: integer('cache_ttl_seconds').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  endpointRouteIdx: uniqueIndex('gateway_endpoint_route_idx').on(table.endpointId, table.path, table.method),
}));

export const gatewaySchemas = pgTable('gateway_schemas', {
  id: uuid('id').primaryKey().defaultRandom(),
  routeId: uuid('route_id').notNull().references(() => gatewayRoutes.id, { onDelete: 'cascade' }),
  schema: jsonb('schema').$type<Record<string, unknown>>().notNull(),
  samplePayload: jsonb('sample_payload').$type<unknown>(),
  inferredAt: timestamp('inferred_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  routeIdIdx: uniqueIndex('gateway_schema_route_idx').on(table.routeId),
}));

/** A published Website's authored gateway usage (a Form's gateway target, or
 *  a container's gatewayBinding), pinned server-side at page-save time to one
 *  fixed (endpointId, routeId) - see docs/plans/api-gateway/gateway-auth-
 *  authz.md. This row's `id` is the opaque "bindingId" published site content
 *  carries instead of the raw endpointName/routePath, so a visitor can never
 *  choose which endpoint/route/website a request actually reaches - the
 *  public gateway routes (submit-handler.ts/resolve-handler.ts) resolve
 *  everything from this row, never from the client's own request body. */
export const gatewayBindings = pgTable('gateway_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpointId: uuid('endpoint_id').notNull().references(() => gatewayEndpoints.id, { onDelete: 'cascade' }),
  routeId: uuid('route_id').notNull().references(() => gatewayRoutes.id, { onDelete: 'cascade' }),
  websiteId: uuid('website_id').notNull(),
  /** 'resolve' bindings may only reference a GET route; 'submit' bindings may
   *  only reference a non-GET route - enforced in gateway-records.ts's
   *  findOrCreateGatewayBinding(), not just trusted from the caller. */
  kind: text('kind').notNull(),
  /** resolve only - dot-path into the upstream response, applied server-side
   *  before the value ever reaches the client. */
  fieldPath: text('field_path'),
  /** resolve only - the placeholder names (e.g. "id" for a route path
   *  containing `{id}`) the client is allowed to fill in per-request; any
   *  other key in a request's `params` is dropped server-side. */
  paramKeys: text('param_keys').array().notNull().default([]),
  /** resolve only - result filters, fixed at authoring time (no longer
   *  client-suppliable). */
  filters: jsonb('filters').$type<unknown>(),
  /** Content-addressed dedup key (hash of endpointId+routeId+kind+fieldPath+
   *  paramKeys+filters+websiteId) so re-saving a page with the same authored
   *  gateway config reuses one row instead of growing this table unbounded. */
  configHash: text('config_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  configHashIdx: uniqueIndex('gateway_binding_config_hash_idx').on(table.websiteId, table.configHash),
}));