import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { encryptIntegrationSecret, decryptIntegrationSecret } from './integration-secrets-crypto.js';
import { deleteMailSettings } from './mail-settings-records.js';
import { websites } from './websites-schema.js';
import { generateSiteApiKey, hashSiteApiKey, siteApiKeyDisplayPrefix, verifySiteApiKeyHash } from './site-key-crypto.js';

export interface WebsiteRecord {
  id: string;
  name: string;
  rootPath: string;
  domains: string[];
  defaultLocale: string;
  supportedLocales: string[];
  settings: Record<string, unknown> | null;
  themeId: string | null;
  pwaEnabled: boolean;
  pwaConfig: Record<string, unknown> | null;
  /** Display-only prefix of the site's Gateway API key, or null if none has
   *  been generated - see setWebsiteGatewayApiKey/site-key-crypto.ts. The
   *  full key hash is never exposed on this type. */
  gatewayApiKeyPrefix: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type WebsiteRow = typeof websites.$inferSelect;

/** Strips gatewayApiKeyHash - the raw hash never leaves this module, same
 *  principle as gateway-records.ts's toRecord() for authConfigEncrypted. */
function toRecord(row: WebsiteRow): WebsiteRecord {
  const { gatewayApiKeyHash: _gatewayApiKeyHash, ...rest } = row;
  return { ...rest, pwaConfig: redactPwaConfig(rest.pwaConfig) };
}

// The push-notification provider key (OneSignal REST API key) lives in `pwa_config.push.onesignalApiKey`, encrypted at rest. It
// can be used to send notifications to every subscriber, so it must never leave this module in a record: records carry
// `push.onesignalApiKeySet` instead (finding F-059: the key used to be returned by the public `GET /public/apps/:websiteId` and to
// every reader of the website). The send route asks for it separately with getWebsitePushApiKey().
const PUSH_KEY = 'onesignalApiKey';
const PUSH_KEY_SET = 'onesignalApiKeySet';
const PUSH_KEY_CLEAR = 'clearOnesignalApiKey';

function pushOf(config: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const push = config?.push;
  return push && typeof push === 'object' && !Array.isArray(push) ? (push as Record<string, unknown>) : null;
}

/** The configuration without the key, with a flag saying whether one is set. */
export function redactPwaConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!config) return config ?? null;
  const push = pushOf(config);
  if (!push) return config;
  const { [PUSH_KEY]: key, [PUSH_KEY_SET]: _flag, [PUSH_KEY_CLEAR]: _clear, ...rest } = push;
  return { ...config, push: { ...rest, ...(typeof key === 'string' && key ? { [PUSH_KEY_SET]: true } : {}) } };
}

/** What to store for a configuration being saved: a blank or absent key keeps the stored one, a new key is encrypted, and
 *  `clearOnesignalApiKey: true` removes it. The flag fields are never stored. */
function sealPwaConfig(incoming: Record<string, unknown>, stored: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const push = pushOf(incoming);
  if (!push) return incoming;
  const { [PUSH_KEY]: given, [PUSH_KEY_SET]: _flag, [PUSH_KEY_CLEAR]: clear, ...rest } = push;
  const kept = pushOf(stored)?.[PUSH_KEY];
  let key: unknown;
  if (clear === true) key = undefined;
  else if (typeof given === 'string' && given.trim()) key = encryptIntegrationSecret(given.trim());
  else key = typeof kept === 'string' && kept ? kept : undefined;
  return { ...incoming, push: { ...rest, ...(key ? { [PUSH_KEY]: key } : {}) } };
}

/** The decrypted push provider key of a website, for sending only (never put it in a response). */
export async function getWebsitePushApiKey(id: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db.select({ pwaConfig: websites.pwaConfig }).from(websites).where(eq(websites.id, id)).limit(1);
  const stored = pushOf(row?.pwaConfig)?.[PUSH_KEY];
  return typeof stored === 'string' && stored ? decryptIntegrationSecret(stored) : null;
}

export async function listWebsites(): Promise<WebsiteRecord[]> {
  const db = getDb();
  const rows = await db.select().from(websites).orderBy(desc(websites.createdAt));
  return rows.map(toRecord);
}

export async function getWebsite(id: string): Promise<WebsiteRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(websites).where(eq(websites.id, id)).limit(1);
  return row ? toRecord(row) : null;
}

export async function getWebsiteByRootPath(rootPath: string): Promise<WebsiteRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(websites).where(eq(websites.rootPath, rootPath)).limit(1);
  return row ? toRecord(row) : null;
}

export async function getWebsiteByDomain(domain: string): Promise<WebsiteRecord | null> {
  const db = getDb();
  const all = await db.select().from(websites);
  const row = all.find((w) => w.domains.includes(domain));
  return row ? toRecord(row) : null;
}

export async function createWebsite(input: {
  name: string;
  rootPath?: string;
  domains?: string[];
  defaultLocale?: string;
  supportedLocales?: string[];
  settings?: Record<string, unknown>;
  themeId?: string | null;
  pwaEnabled?: boolean;
  pwaConfig?: Record<string, unknown>;
}): Promise<WebsiteRecord> {
  const db = getDb();
  const [row] = await db
    .insert(websites)
    .values({
      name: input.name,
      rootPath: input.rootPath ?? '',
      domains: input.domains ?? [],
      defaultLocale: input.defaultLocale ?? 'en',
      supportedLocales: input.supportedLocales ?? ['en'],
      settings: input.settings ?? {},
      themeId: input.themeId ?? null,
      pwaEnabled: input.pwaEnabled ?? false,
      pwaConfig: sealPwaConfig(input.pwaConfig ?? {}, null),
    })
    .returning();
  return toRecord(row);
}

export async function updateWebsite(
  id: string,
  input: {
    name?: string;
    rootPath?: string;
    domains?: string[];
    defaultLocale?: string;
    supportedLocales?: string[];
    settings?: Record<string, unknown>;
    themeId?: string | null;
    pwaEnabled?: boolean;
    pwaConfig?: Record<string, unknown>;
  }
): Promise<WebsiteRecord | null> {
  const db = getDb();
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.rootPath !== undefined) values.rootPath = input.rootPath;
  if (input.domains !== undefined) values.domains = input.domains;
  if (input.defaultLocale !== undefined) values.defaultLocale = input.defaultLocale;
  if (input.supportedLocales !== undefined) values.supportedLocales = input.supportedLocales;
  if (input.settings !== undefined) values.settings = input.settings;
  if (input.themeId !== undefined) values.themeId = input.themeId;
  if (input.pwaEnabled !== undefined) values.pwaEnabled = input.pwaEnabled;
  if (input.pwaConfig !== undefined) {
    const [current] = await db.select({ pwaConfig: websites.pwaConfig }).from(websites).where(eq(websites.id, id)).limit(1);
    values.pwaConfig = sealPwaConfig(input.pwaConfig, current?.pwaConfig);
  }
  const [row] = await db.update(websites).set(values).where(eq(websites.id, id)).returning();
  return row ? toRecord(row) : null;
}

export async function deleteWebsite(id: string): Promise<void> {
  const db = getDb();
  await db.delete(websites).where(eq(websites.id, id));
  // its own outgoing-mail configuration (and the secrets in it) goes with it
  await deleteMailSettings(id);
}

/** Generates a fresh site API key, stores only its hash + display prefix,
 *  and returns the plaintext - the ONLY time it's ever available. Callers
 *  (the admin-only regenerate route) must show it to the admin immediately
 *  and never log or persist it themselves. Overwrites any previous key. */
export async function setWebsiteGatewayApiKey(id: string): Promise<{ plaintext: string; prefix: string } | null> {
  const db = getDb();
  const plaintext = generateSiteApiKey();
  const prefix = siteApiKeyDisplayPrefix(plaintext);
  const [row] = await db
    .update(websites)
    .set({ gatewayApiKeyHash: hashSiteApiKey(plaintext), gatewayApiKeyPrefix: prefix, updatedAt: new Date() })
    .where(eq(websites.id, id))
    .returning();
  if (!row) return null;
  return { plaintext, prefix };
}

/** Revokes a website's key entirely (falls back to binding-only checks). */
export async function clearWebsiteGatewayApiKey(id: string): Promise<void> {
  const db = getDb();
  await db.update(websites).set({ gatewayApiKeyHash: null, gatewayApiKeyPrefix: null, updatedAt: new Date() }).where(eq(websites.id, id));
}

/** Verifies a plaintext key presented by a published site (X-Whoobe-Site-Key)
 *  against the given website's stored hash. Returns false both when the key
 *  doesn't match AND when the website has none configured - callers that
 *  want to treat "no key configured" as "no key required" must check
 *  getWebsiteGatewayApiKeyHash(id) === null separately (see apps/gateway/src/
 *  site-auth.ts), never infer it from this function alone. */
export async function verifyWebsiteGatewayApiKey(id: string, plaintext: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select({ gatewayApiKeyHash: websites.gatewayApiKeyHash }).from(websites).where(eq(websites.id, id)).limit(1);
  if (!row?.gatewayApiKeyHash) return false;
  return verifySiteApiKeyHash(plaintext, row.gatewayApiKeyHash);
}

/** Whether this website currently requires a site key at all (site-auth.ts's
 *  "optional" gate) - null id or no row also reads as "not required". */
export async function websiteRequiresGatewayApiKey(id: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select({ gatewayApiKeyHash: websites.gatewayApiKeyHash }).from(websites).where(eq(websites.id, id)).limit(1);
  return Boolean(row?.gatewayApiKeyHash);
}

/**
 * System-wide logging on/off switch, controlled from the admin dashboard
 * (Settings > General). Stored on the first website's settings blob, same
 * as the other global toggles (autosave, stripHtmlComments). Every backend
 * service (core-api, gateway, asset-processor) polls this directly to mute
 * or restore its own Pino logger - see packages/logger's attachLoggingToggle.
 * Defaults to enabled so logging behaves as before until someone opts out.
 */
export async function isLoggingEnabled(): Promise<boolean> {
  const all = await listWebsites();
  const first = all[0];
  const raw = first?.settings && typeof first.settings === 'object' && !Array.isArray(first.settings)
    ? (first.settings as Record<string, unknown>).logging
    : null;
  const enabled = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).enabled : null;
  return typeof enabled === 'boolean' ? enabled : true;
}