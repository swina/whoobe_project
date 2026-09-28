import { pgTable, text, jsonb, uuid, timestamp, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const websites = pgTable('websites', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull().default(''),
  domains: text('domains').array().notNull().default([]),
  defaultLocale: text('default_locale').notNull().default('en'),
  supportedLocales: text('supported_locales').array().notNull().default(['en']),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  themeId: uuid('theme_id'),
  pwaEnabled: boolean('pwa_enabled').notNull().default(false),
  pwaConfig: jsonb('pwa_config').$type<Record<string, unknown>>().default({}),
  /** Optional per-site static key a published site presents to the Gateway
   *  (X-Whoobe-Site-Key header) for scoping/rate-limiting/revocation on top
   *  of the mandatory gateway_bindings check - see docs/plans/api-gateway/
   *  gateway-auth-authz.md. Only a salted hash is ever stored; the plaintext
   *  is shown once at generation time (site-key-crypto.ts) and never again.
   *  Null means this website hasn't generated one (or had it cleared) - the
   *  binding-only check still applies in that case. */
  gatewayApiKeyHash: text('gateway_api_key_hash'),
  /** First few chars of the plaintext key, for display/identification in the
   *  admin UI without ever storing or re-deriving the full secret. */
  gatewayApiKeyPrefix: text('gateway_api_key_prefix'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  rootPathIdx: uniqueIndex('root_path_idx').on(table.rootPath),
}));