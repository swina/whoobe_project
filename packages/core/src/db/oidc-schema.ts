import { pgTable, integer, boolean, text, uuid, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './auth-schema.js';

export interface OidcRoleMapping { value: string; roleId: string }

// The one OpenID Connect provider of the installation and the people it signed in (docs/plans/system/oidc-login-plan.md).
export const oidcSettings = pgTable('oidc_settings', {
  id: integer('id').primaryKey().default(1),
  enabled: boolean('enabled').notNull().default(false),
  label: text('label').notNull().default('Single sign-on'),
  issuer: text('issuer'),
  clientId: text('client_id'),
  /** encrypted with INTEGRATION_SECRETS_ENCRYPTION_KEY; null = a public client (PKCE alone) */
  clientSecretEncrypted: text('client_secret_encrypted'),
  redirectBaseUrl: text('redirect_base_url'),
  /** where people land after signing in (the dashboard); null = the redirect base */
  dashboardUrl: text('dashboard_url'),
  scopes: text('scopes').notNull().default('openid email profile'),
  roleClaim: text('role_claim'),
  roleMapping: jsonb('role_mapping').$type<OidcRoleMapping[]>().notNull().default([]),
  defaultRoleIds: uuid('default_role_ids').array().notNull().default([]),
  autoProvision: boolean('auto_provision').notNull().default(false),
  linkByEmail: boolean('link_by_email').notNull().default(true),
  /** 'all' = the password form works for everybody; 'admins' = only for users who can manage users */
  localLogin: text('local_login').notNull().default('all'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userIdentities = pgTable('user_identities', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  issuer: text('issuer').notNull(),
  subject: text('subject').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
}, (t) => ({
  bySubject: uniqueIndex('user_identities_issuer_subject_idx').on(t.issuer, t.subject),
  byUser: index('user_identities_user_idx').on(t.userId),
}));
