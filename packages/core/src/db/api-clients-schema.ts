import { pgTable, text, jsonb, uuid, timestamp, integer, uniqueIndex, index } from 'drizzle-orm/pg-core';

// Applications that call Whoobe with a key (docs/plans/api-gateway/client-access-hub.md). Keys are in their own table so a client
// can have several (rotation: add, move the application, revoke the old one). Only a keyed hash of a key is stored.
export const apiClients = pgTable('api_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  /** Deprecated, unused (0057): the old 'server' | 'public' kind. Read `authMode`. */
  kind: text('kind').notNull().default('server'),
  /** How the client proves itself: 'key' (a static key, held by a server only) | 'jwt' (a token of the organisation's identity provider). */
  authMode: text('auth_mode').notNull().default('key'),
  /** The registration of the identity provider, when authMode is 'jwt' (see gateway/client-jwt.ts). */
  jwtConfig: jsonb('jwt_config').$type<Record<string, unknown>>(),
  /** 'active' | 'suspended' */
  status: text('status').notNull().default('active'),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  rateLimitRps: integer('rate_limit_rps').notNull().default(10),
  /** Calls per UTC day, null = no quota. */
  dailyQuota: integer('daily_quota'),
  /** Caller addresses allowed (exact IPs or CIDR); null = any. */
  allowedIps: text('allowed_ips').array(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameIdx: uniqueIndex('api_client_name_idx').on(t.name),
}));

export const apiClientKeys = pgTable('api_client_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => apiClients.id, { onDelete: 'cascade' }),
  /** The lookup id inside the key (wbk_<prefix>_...), unique. */
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  label: text('label').notNull().default(''),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  prefixIdx: uniqueIndex('api_client_key_prefix_idx').on(t.prefix),
  clientIdx: index('api_client_key_client_idx').on(t.clientId),
}));
