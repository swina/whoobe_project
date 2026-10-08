import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { getDb } from './client.js';
import { mailSettings } from './mail-settings-schema.js';
import {
  decryptMailProviderConfig, decryptMailSecret, encryptMailProviderConfig, encryptMailSecret, mailEncryptionConfigured,
} from './mail-settings-crypto.js';
import type { MailProviderDefinition } from '../mail/providers.js';

/** The outgoing-mail configuration as the server uses it: secrets decrypted. Never send this to a browser
 *  (publicMailSettings() is the view for that). */
export interface MailSettingsRecord {
  id: string;
  /** null = the installation's default; otherwise the website this configuration belongs to */
  websiteId: string | null;
  /** `smtp` or the id of a mail provider (mail/providers.ts) */
  provider: string;
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  password: string | null;
  providerConfig: Record<string, unknown>;
  fromAddress: string | null;
  fromName: string | null;
  bccFromAddress: boolean;
  updatedAt: Date;
}

export class MailEncryptionKeyMissingError extends Error {
  constructor() {
    super('MAIL_SETTINGS_ENCRYPTION_KEY is not set on the server: outgoing-mail passwords and API keys are stored encrypted and cannot be saved without it.');
  }
}

type Row = typeof mailSettings.$inferSelect;

function toRecord(row: Row): MailSettingsRecord {
  return {
    id: row.id,
    websiteId: row.websiteId,
    provider: row.provider,
    host: row.host,
    port: row.port,
    secure: row.secure,
    user: row.user,
    // the encrypted column wins; a row from before encryption still has its password in the old plaintext column
    password: row.passwordEncrypted ? decryptMailSecret(row.passwordEncrypted) : row.password,
    providerConfig: decryptMailProviderConfig(row.providerConfigEncrypted),
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    bccFromAddress: row.bccFromAddress,
    updatedAt: row.updatedAt,
  };
}

const scope = (websiteId: string | null) => (websiteId ? eq(mailSettings.websiteId, websiteId) : isNull(mailSettings.websiteId));

/** The configuration of exactly this scope (`null` = the default), or null when there is none. */
export async function getMailSettingsFor(websiteId: string | null): Promise<MailSettingsRecord | null> {
  const [row] = await getDb().select().from(mailSettings).where(scope(websiteId)).limit(1);
  return row ? toRecord(row) : null;
}

/** The installation's default configuration (kept for callers that never meant a website). */
export function getMailSettings(): Promise<MailSettingsRecord | null> {
  return getMailSettingsFor(null);
}

/** What a message of this website is sent with: the website's own configuration if it has one, otherwise the default. */
export async function resolveMailSettings(websiteId?: string | null): Promise<{ settings: MailSettingsRecord; scope: 'website' | 'default' } | null> {
  if (websiteId) {
    const own = await getMailSettingsFor(websiteId);
    if (own) return { settings: own, scope: 'website' };
  }
  const base = await getMailSettingsFor(null);
  return base ? { settings: base, scope: 'default' } : null;
}

export interface MailSettingsInput {
  provider: string;
  smtp?: { host: string; port: number; secure: boolean; user?: string | null; password?: string | null; clearPassword?: boolean };
  /** values of the provider's config fields; a blank secret keeps the stored one */
  providerConfig?: Record<string, unknown>;
  /** the provider definition, to know which config fields are secret */
  providerDefinition?: MailProviderDefinition;
  fromAddress?: string | null;
  fromName?: string | null;
  bccFromAddress?: boolean;
}

/** True upsert for one scope: updates the row if there is one, otherwise inserts it. Secrets are encrypted here, and a
 *  blank one means "keep what is stored". Throws MailEncryptionKeyMissingError when a secret has to be stored and the
 *  server has no key. */
export async function upsertMailSettings(websiteId: string | null, input: MailSettingsInput): Promise<MailSettingsRecord> {
  const db = getDb();
  const [existingRow] = await db.select().from(mailSettings).where(scope(websiteId)).limit(1);
  const existing = existingRow ? toRecord(existingRow) : null;
  const isSmtp = input.provider === 'smtp';

  let passwordEncrypted: string | null = null;
  if (isSmtp && input.smtp) {
    const keep = !input.smtp.password && !input.smtp.clearPassword;
    const plain = keep ? existing?.password ?? null : input.smtp.clearPassword ? null : input.smtp.password ?? null;
    if (plain) {
      if (!mailEncryptionConfigured()) throw new MailEncryptionKeyMissingError();
      passwordEncrypted = encryptMailSecret(plain);
    }
  }

  let providerConfigEncrypted: string | null = null;
  if (!isSmtp) {
    const secretNames = new Set((input.providerDefinition?.configFields ?? []).filter((f) => f.secret).map((f) => f.name));
    const stored = existing?.provider === input.provider ? existing.providerConfig : {};
    const merged: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input.providerConfig ?? {})) {
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
      merged[k] = secretNames.has(k) && (v === '' || v == null) ? stored[k] : v;
    }
    for (const name of secretNames) if (merged[name] === undefined && stored[name] !== undefined) merged[name] = stored[name];
    for (const [k, v] of Object.entries(merged)) if (v === undefined || v === '') delete merged[k];
    if (Object.keys(merged).length) {
      if (!mailEncryptionConfigured()) throw new MailEncryptionKeyMissingError();
      providerConfigEncrypted = encryptMailProviderConfig(merged);
    }
  }

  const values = {
    websiteId,
    provider: input.provider,
    host: isSmtp ? input.smtp?.host ?? null : null,
    port: isSmtp ? input.smtp?.port ?? null : null,
    secure: isSmtp ? input.smtp?.secure ?? false : false,
    user: isSmtp ? input.smtp?.user ?? null : null,
    password: null as string | null,           // the old plaintext column is never written again
    passwordEncrypted,
    providerConfigEncrypted,
    fromAddress: input.fromAddress ?? null,
    fromName: input.fromName ?? null,
    bccFromAddress: input.bccFromAddress ?? false,
    updatedAt: new Date(),
  };
  if (existingRow) {
    const [row] = await db.update(mailSettings).set(values).where(eq(mailSettings.id, existingRow.id)).returning();
    return toRecord(row);
  }
  const [row] = await db.insert(mailSettings).values(values).returning();
  return toRecord(row);
}

/** Removes a website's own configuration, so its mail goes out with the default again. The default row is not removable. */
export async function deleteMailSettings(websiteId: string): Promise<boolean> {
  const rows = await getDb().delete(mailSettings).where(and(eq(mailSettings.websiteId, websiteId), isNotNull(mailSettings.websiteId))).returning({ id: mailSettings.id });
  return rows.length > 0;
}

export interface PublicMailSettings {
  scope: 'website' | 'default';
  websiteId: string | null;
  provider: string;
  smtp: { host: string | null; port: number | null; secure: boolean; user: string | null; hasPassword: boolean };
  /** only the non-secret fields */
  providerConfig: Record<string, unknown>;
  /** which secret fields have a value stored */
  secretsSet: Record<string, boolean>;
  fromAddress: string | null;
  fromName: string | null;
  bccFromAddress: boolean;
  updatedAt: Date;
}

/** The view for a browser: no password, no API key - only whether they are set. */
export function publicMailSettings(s: MailSettingsRecord, sc: 'website' | 'default', def?: MailProviderDefinition): PublicMailSettings {
  const secretNames = new Set((def?.configFields ?? []).filter((f) => f.secret).map((f) => f.name));
  const providerConfig: Record<string, unknown> = {};
  const secretsSet: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(s.providerConfig)) {
    if (secretNames.has(k)) secretsSet[k] = !!v;
    else providerConfig[k] = v;
  }
  return {
    scope: sc,
    websiteId: s.websiteId,
    provider: s.provider,
    smtp: { host: s.host, port: s.port, secure: s.secure, user: s.user, hasPassword: !!s.password },
    providerConfig,
    secretsSet,
    fromAddress: s.fromAddress,
    fromName: s.fromName,
    bccFromAddress: s.bccFromAddress,
    updatedAt: s.updatedAt,
  };
}
