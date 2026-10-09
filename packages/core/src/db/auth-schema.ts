import { pgTable, text, boolean, timestamp, primaryKey, uuid, jsonb } from 'drizzle-orm/pg-core';

// One hashed (argon2, via ../auth/password.ts) one-time recovery code per
// entry - same shape mfa.ts's hashRecoveryCodes()/consumeRecoveryCode()
// produce/consume. `usedAt` marks a code as spent without removing it, so
// "8 codes generated, 3 remaining" stays reconstructable for a future
// "regenerate codes" UI, rather than only ever shrinking the array.
export interface MfaRecoveryCode {
  hash: string;
  usedAt: string | null;
}

/**
 * Auth & RBAC schema. See docs/plans/backend/auth-permissions-plan.md.
 * Permissions are opaque "resource:action" strings (e.g. "objects:publish"),
 * not a fixed enum - new features add new permission rows and attach them
 * to whichever roles should have them, without a schema change.
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  // TOTP (Authenticator app) MFA. `totpSecret` is written as soon as setup
  // starts (see mfa.ts/POST /auth/mfa/setup) but doesn't mean anything is
  // enforced yet - only `totpEnabledAt` being non-null does that (set once
  // the user actually confirms a valid code, POST /auth/mfa/verify-setup).
  // An abandoned, unconfirmed setup just leaves an unused secret sitting
  // here, which is harmless - simpler than a separate "pending setup"
  // table/state machine for what's otherwise a two-request flow.
  totpSecret: text('totp_secret'),
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  mfaRecoveryCodes: jsonb('mfa_recovery_codes').$type<MfaRecoveryCode[]>(),
  // Password-reset flow: a random token stored when /auth/forgot-password is
  // called; /auth/reset-password consumes it. An expired or already-used
  // token is treated as "not found" - no separate consumed-at column needed.
  resetToken: text('reset_token'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at', { withTimezone: true }),
});

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description'),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  description: text('description'),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })]
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })]
);

// `id` is the SHA-256 of the session token (auth/session.ts hashSessionToken): the token itself is a long random string from
// crypto.randomBytes, used as the cookie value, and is never stored. Revocation/expiry is a plain row check, not JWT-denylist
// bookkeeping.
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
