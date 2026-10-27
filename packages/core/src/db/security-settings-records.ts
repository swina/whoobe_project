import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { securitySettings } from './security-settings-schema.js';
import { roles, userRoles } from './auth-schema.js';
import { DEFAULT_PASSWORD_POLICY, PASSWORD_MIN_LENGTH_LIMITS, userMustUseMfa, type PasswordPolicy } from '../auth/password-policy.js';

export interface SecuritySettings {
  /** users with one of these roles must have a second factor; empty = nobody */
  requireMfaRoleIds: string[];
  passwordPolicy: PasswordPolicy;
  /** days after which a row of the mail log is deleted; null = keep */
  mailLogRetentionDays: number | null;
  /** token usage of the AI functions recorded per user; off by default */
  aiUsageTracking: boolean;
  /** days after which a row of the AI usage is deleted (the monthly totals stay); null = keep */
  aiUsageRetentionDays: number | null;
  /** days after which a recorded AI generation (prompt and answer) is deleted; null = keep */
  aiGeneratedRetentionDays: number | null;
  updatedAt: Date | null;
}

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  requireMfaRoleIds: [],
  passwordPolicy: DEFAULT_PASSWORD_POLICY,
  mailLogRetentionDays: null,
  aiUsageTracking: false,
  aiUsageRetentionDays: 90,
  aiGeneratedRetentionDays: null,
  updatedAt: null,
};

/** The settings in force; the defaults when nothing was ever saved. Read on every login and password change: one row, one query. */
export async function getSecuritySettings(): Promise<SecuritySettings> {
  const [row] = await getDb().select().from(securitySettings).where(eq(securitySettings.id, 1)).limit(1);
  if (!row) return DEFAULT_SECURITY_SETTINGS;
  return {
    requireMfaRoleIds: row.requireMfaRoleIds,
    passwordPolicy: { minLength: row.passwordMinLength, requireClasses: row.passwordRequireClasses },
    mailLogRetentionDays: row.mailLogRetentionDays,
    aiUsageTracking: row.aiUsageTracking,
    aiUsageRetentionDays: row.aiUsageRetentionDays,
    aiGeneratedRetentionDays: row.aiGeneratedRetentionDays,
    updatedAt: row.updatedAt,
  };
}

export type SecuritySettingsPatch = Partial<{ requireMfaRoleIds: string[]; passwordMinLength: number; passwordRequireClasses: boolean; mailLogRetentionDays: number | null;
  aiUsageTracking: boolean; aiUsageRetentionDays: number | null; aiGeneratedRetentionDays: number | null }>;

export type SecuritySettingsInput = {
  requireMfaRoleIds?: unknown;
  passwordMinLength?: unknown;
  passwordRequireClasses?: unknown;
  mailLogRetentionDays?: unknown;
  aiUsageTracking?: unknown;
  aiUsageRetentionDays?: unknown;
  aiGeneratedRetentionDays?: unknown;
};

/** Validates a PUT body (only the keys present are changed). `error` names the first bad field. */
export async function parseSecuritySettingsInput(
  body: SecuritySettingsInput
): Promise<{ ok: true; value: SecuritySettingsPatch } | { ok: false; error: string }> {
  const value: SecuritySettingsPatch = {};
  if (body.requireMfaRoleIds !== undefined) {
    const ids = body.requireMfaRoleIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return { ok: false, error: 'requireMfaRoleIds must be an array of role ids' };
    const unique = [...new Set(ids as string[])];
    if (unique.length) {
      const known = new Set((await getDb().select({ id: roles.id }).from(roles)).map((r) => r.id));
      const unknown = unique.find((id) => !known.has(id));
      if (unknown) return { ok: false, error: `Unknown role id: ${unknown}` };
    }
    value.requireMfaRoleIds = unique;
  }
  if (body.passwordMinLength !== undefined) {
    const n = body.passwordMinLength;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < PASSWORD_MIN_LENGTH_LIMITS.min || n > PASSWORD_MIN_LENGTH_LIMITS.max) {
      return { ok: false, error: `passwordMinLength must be a whole number from ${PASSWORD_MIN_LENGTH_LIMITS.min} to ${PASSWORD_MIN_LENGTH_LIMITS.max}` };
    }
    value.passwordMinLength = n;
  }
  if (body.passwordRequireClasses !== undefined) {
    if (typeof body.passwordRequireClasses !== 'boolean') return { ok: false, error: 'passwordRequireClasses must be true or false' };
    value.passwordRequireClasses = body.passwordRequireClasses;
  }
  if (body.mailLogRetentionDays !== undefined) {
    const n = body.mailLogRetentionDays;
    if (n === null) value.mailLogRetentionDays = null;
    else if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 36500) return { ok: false, error: 'mailLogRetentionDays must be a whole number of days from 1 to 36500, or null to keep the log' };
    else value.mailLogRetentionDays = n;
  }
  if (body.aiUsageTracking !== undefined) {
    if (typeof body.aiUsageTracking !== 'boolean') return { ok: false, error: 'aiUsageTracking must be true or false' };
    value.aiUsageTracking = body.aiUsageTracking;
  }
  for (const key of ['aiUsageRetentionDays', 'aiGeneratedRetentionDays'] as const) {
    const n = body[key];
    if (n === undefined) continue;
    if (n === null) value[key] = null;
    else if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 36500) return { ok: false, error: `${key} must be a whole number of days from 1 to 36500, or null to keep the rows` };
    else value[key] = n;
  }
  return { ok: true, value };
}

export async function updateSecuritySettings(
  patch: SecuritySettingsPatch
): Promise<SecuritySettings> {
  const set = { ...patch, updatedAt: new Date() };
  await getDb().insert(securitySettings).values({ id: 1, ...set }).onConflictDoUpdate({ target: securitySettings.id, set });
  return getSecuritySettings();
}

/** The ids of the roles a user holds. */
export async function getUserRoleIds(userId: string): Promise<string[]> {
  const rows = await getDb().select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows.map((r) => r.roleId);
}

/** True when the settings require a second factor of this user (one of their roles is on the list). */
export async function userMustUseMfaNow(userId: string): Promise<boolean> {
  const settings = await getSecuritySettings();
  if (settings.requireMfaRoleIds.length === 0) return false;
  return userMustUseMfa(await getUserRoleIds(userId), settings.requireMfaRoleIds);
}
