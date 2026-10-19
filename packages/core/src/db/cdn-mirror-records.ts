import { eq, isNull } from 'drizzle-orm';
import { getDb } from './client.js';
import { cdnMirrorSettings } from './cdn-mirror-schema.js';
import { decryptIntegrationSecret, encryptIntegrationSecret } from './integration-secrets-crypto.js';
import { getCdnProvider, missingCdnFields } from '../dam/cdn-providers.js';

// CDN mirroring settings per website with the installation's default as the fallback (docs/plans/assets/cdn-providers-plan.md).

export type CdnMirrorScope = 'website' | 'default' | 'none';

export interface CdnMirrorResolved {
  /** where the effective settings come from: the website's own row, the default, or nothing is set */
  scope: CdnMirrorScope;
  websiteId: string | null;
  provider: string;
  config: Record<string, string>;
  /** decrypted: for the server only (publicCdnMirror is the view for a browser) */
  secrets: Record<string, string>;
  secretsSet: Record<string, boolean>;
  updatedAt: Date | null;
}

const NONE: CdnMirrorResolved = { scope: 'none', websiteId: null, provider: 'cloudinary', config: {}, secrets: {}, secretsSet: {}, updatedAt: null };

function readSecrets(stored: string | null): Record<string, string> {
  if (!stored) return {};
  try {
    const plain = decryptIntegrationSecret(stored);
    const parsed = plain ? JSON.parse(plain) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

type Row = typeof cdnMirrorSettings.$inferSelect;
function toResolved(row: Row, scope: CdnMirrorScope): CdnMirrorResolved {
  const secrets = readSecrets(row.secretsEncrypted);
  return {
    scope, websiteId: row.websiteId, provider: row.provider, config: row.config ?? {}, secrets,
    secretsSet: Object.fromEntries(Object.entries(secrets).map(([k, v]) => [k, !!v])), updatedAt: row.updatedAt,
  };
}

async function rowOf(websiteId: string | null): Promise<Row | undefined> {
  const [row] = await getDb().select().from(cdnMirrorSettings).where(websiteId ? eq(cdnMirrorSettings.websiteId, websiteId) : isNull(cdnMirrorSettings.websiteId)).limit(1);
  return row;
}

/** The website's own settings, with no fallback (null when it has none). */
export async function getOwnCdnMirror(websiteId: string | null): Promise<CdnMirrorResolved | null> {
  const row = await rowOf(websiteId);
  return row ? toResolved(row, websiteId ? 'website' : 'default') : null;
}

/** What applies to a website: its own row, else the installation's default, else none. Without a website, the default. */
export async function resolveCdnMirror(websiteId?: string | null): Promise<CdnMirrorResolved> {
  if (websiteId) {
    const own = await rowOf(websiteId);
    if (own) return toResolved(own, 'website');
  }
  const dflt = await rowOf(null);
  return dflt ? toResolved(dflt, 'default') : NONE;
}

/** The settings are complete for their provider: an upload can be tried. */
export const cdnMirrorConfigured = (r: CdnMirrorResolved): boolean => r.scope !== 'none' && missingCdnFields(r.provider, r.config, r.secretsSet).length === 0;

/** The settings as a browser may see them: no secret, only which ones are set; and what is still missing. */
export function publicCdnMirror(r: CdnMirrorResolved) {
  return {
    scope: r.scope, websiteId: r.websiteId, provider: r.provider, config: r.config, secretsSet: r.secretsSet,
    missing: r.scope === 'none' ? [] : missingCdnFields(r.provider, r.config, r.secretsSet),
    configured: cdnMirrorConfigured(r), updatedAt: r.updatedAt,
  };
}

/** Saves a website's settings (null = the default). A secret that is not sent keeps the stored one when the provider is the same; a provider
 *  change drops the secrets of the old one. */
export async function saveCdnMirror(websiteId: string | null, input: { provider: string; config: Record<string, string>; secrets: Record<string, string> }): Promise<CdnMirrorResolved> {
  const existing = await rowOf(websiteId);
  const info = getCdnProvider(input.provider);
  const keep = existing && existing.provider === input.provider ? readSecrets(existing.secretsEncrypted) : {};
  const secretNames = new Set((info?.fields ?? []).filter((f) => f.secret).map((f) => f.name));
  const merged: Record<string, string> = {};
  for (const n of secretNames) {
    const v = input.secrets[n] ?? keep[n];
    if (v) merged[n] = v;
  }
  const values = {
    websiteId, provider: input.provider, config: input.config,
    secretsEncrypted: Object.keys(merged).length ? encryptIntegrationSecret(JSON.stringify(merged)) : null, updatedAt: new Date(),
  };
  if (existing) await getDb().update(cdnMirrorSettings).set(values).where(eq(cdnMirrorSettings.id, existing.id));
  else await getDb().insert(cdnMirrorSettings).values(values);
  return (await getOwnCdnMirror(websiteId))!;
}

/** Removes a website's own settings (it falls back to the default). The default itself can be removed too: then nothing is set. */
export async function deleteCdnMirror(websiteId: string | null): Promise<boolean> {
  const rows = await getDb().delete(cdnMirrorSettings).where(websiteId ? eq(cdnMirrorSettings.websiteId, websiteId) : isNull(cdnMirrorSettings.websiteId)).returning({ id: cdnMirrorSettings.id });
  return rows.length > 0;
}
