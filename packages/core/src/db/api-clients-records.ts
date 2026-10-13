import { getDb } from './client.js';
import { apiClients, apiClientKeys } from './api-clients-schema.js';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { generateClientKey, parseClientKey, verifyClientKey } from '../gateway/client-keys.js';

export type ApiClientRecord = typeof apiClients.$inferSelect;
/** A key as listed in the dashboard: never the hash. */
export interface ApiClientKeyInfo {
  id: string;
  clientId: string;
  prefix: string;
  label: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

const keyInfo = (r: typeof apiClientKeys.$inferSelect): ApiClientKeyInfo => ({
  id: r.id, clientId: r.clientId, prefix: r.prefix, label: r.label, expiresAt: r.expiresAt, revokedAt: r.revokedAt, createdAt: r.createdAt,
});

export interface ApiClientInput {
  name: string;
  description?: string;
  authMode?: 'key' | 'jwt';
  jwtConfig?: Record<string, unknown> | null;
  status?: 'active' | 'suspended';
  scopes?: string[];
  rateLimitRps?: number;
  dailyQuota?: number | null;
  allowedIps?: string[] | null;
  expiresAt?: Date | null;
  createdBy?: string | null;
}

export async function listApiClients(): Promise<ApiClientRecord[]> {
  return getDb().select().from(apiClients).orderBy(asc(apiClients.name));
}

export async function getApiClient(id: string): Promise<ApiClientRecord | null> {
  const [row] = await getDb().select().from(apiClients).where(eq(apiClients.id, id)).limit(1);
  return row ?? null;
}

export async function createApiClient(input: ApiClientInput): Promise<ApiClientRecord> {
  const [row] = await getDb().insert(apiClients).values({ ...input, scopes: input.scopes ?? [] }).returning();
  return row;
}

export async function updateApiClient(id: string, patch: Partial<ApiClientInput>): Promise<ApiClientRecord | null> {
  const { createdBy: _ignored, ...rest } = patch;
  const [row] = await getDb().update(apiClients).set({ ...rest, updatedAt: new Date() }).where(eq(apiClients.id, id)).returning();
  return row ?? null;
}

export async function deleteApiClient(id: string): Promise<boolean> {
  const rows = await getDb().delete(apiClients).where(eq(apiClients.id, id)).returning({ id: apiClients.id });
  return rows.length > 0;
}

export async function listApiClientKeys(clientId: string): Promise<ApiClientKeyInfo[]> {
  const rows = await getDb().select().from(apiClientKeys).where(eq(apiClientKeys.clientId, clientId)).orderBy(asc(apiClientKeys.createdAt));
  return rows.map(keyInfo);
}

/** Adds a key to a client. The plaintext is returned here and nowhere else, ever: show it once. */
export async function addApiClientKey(clientId: string, opts: { label?: string; expiresAt?: Date | null } = {}): Promise<{ plaintext: string; key: ApiClientKeyInfo }> {
  const db = getDb();
  // the lookup id is 8 random characters: a collision is possible in principle, so retry on the unique index
  for (let attempt = 0; attempt < 5; attempt++) {
    const g = generateClientKey();
    const rows = await db.insert(apiClientKeys)
      .values({ clientId, prefix: g.prefix, keyHash: g.hash, label: opts.label ?? '', expiresAt: opts.expiresAt ?? null })
      .onConflictDoNothing({ target: apiClientKeys.prefix })
      .returning();
    if (rows[0]) return { plaintext: g.plaintext, key: keyInfo(rows[0]) };
  }
  throw new Error('Could not generate a unique API key');
}

export async function revokeApiClientKey(clientId: string, keyId: string): Promise<boolean> {
  const rows = await getDb().update(apiClientKeys).set({ revokedAt: new Date() })
    .where(and(eq(apiClientKeys.id, keyId), eq(apiClientKeys.clientId, clientId), isNull(apiClientKeys.revokedAt)))
    .returning({ id: apiClientKeys.id });
  return rows.length > 0;
}

export type ClientKeyCheck =
  | { ok: true; client: ApiClientRecord; keyId: string }
  | { ok: false; reason: 'malformed' | 'unknown' | 'revoked' | 'expired' | 'suspended' };

/** Looks a presented key up and checks the key and its client. The reason is for the server log; the caller answers every failure the same way. */
export async function authenticateClientKey(presented: string | undefined | null, now: Date = new Date()): Promise<ClientKeyCheck> {
  const parsed = parseClientKey(presented);
  if (!parsed || !presented) return { ok: false, reason: 'malformed' };
  const db = getDb();
  const [k] = await db.select().from(apiClientKeys).where(eq(apiClientKeys.prefix, parsed.prefix)).limit(1);
  if (!k || !verifyClientKey(presented, k.keyHash)) return { ok: false, reason: 'unknown' };
  if (k.revokedAt) return { ok: false, reason: 'revoked' };
  if (k.expiresAt && k.expiresAt <= now) return { ok: false, reason: 'expired' };
  const client = await getApiClient(k.clientId);
  if (!client) return { ok: false, reason: 'unknown' };
  if (client.status !== 'active') return { ok: false, reason: 'suspended' };
  if (client.expiresAt && client.expiresAt <= now) return { ok: false, reason: 'expired' };
  return { ok: true, client, keyId: k.id };
}

/** Best effort, at most once a minute per client (the timestamp is only for the dashboard). */
export async function touchApiClient(id: string): Promise<void> {
  await getDb().update(apiClients).set({ lastUsedAt: new Date() }).where(eq(apiClients.id, id));
}

/** The active clients that trust this issuer (a token names its issuer before it is verified; each candidate then checks audience and the rest). */
export async function listJwtClientsByIssuer(issuer: string): Promise<ApiClientRecord[]> {
  const rows = await getDb().select().from(apiClients)
    .where(and(eq(apiClients.authMode, 'jwt'), eq(apiClients.status, 'active'), sql`${apiClients.jwtConfig}->>'issuer' = ${issuer}`));
  const now = new Date();
  return rows.filter((c) => !c.expiresAt || c.expiresAt > now);
}
