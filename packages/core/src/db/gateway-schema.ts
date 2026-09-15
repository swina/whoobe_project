import { pgTable, text, jsonb, uuid, timestamp, integer, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const gatewayEndpoints = pgTable('gateway_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  baseUrl: text('base_url').notNull(),
  authType: text('auth_type').notNull().default('none'),
  authConfig: jsonb('auth_config').$type<Record<string, unknown>>().default({}),
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