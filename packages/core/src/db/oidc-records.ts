import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { oidcSettings, type OidcRoleMapping } from './oidc-schema.js';
import { roles } from './auth-schema.js';
import { decryptIntegrationSecret, encryptIntegrationSecret } from './integration-secrets-crypto.js';
import { isOidcUrl, oidcAllowsHttp } from '../auth/oidc-helpers.js';

export interface OidcSettings {
  enabled: boolean;
  label: string;
  issuer: string | null;
  clientId: string | null;
  /** decrypted: for the server only, never sent to a browser (publicOidcSettings is the view for that) */
  clientSecret: string | null;
  redirectBaseUrl: string | null;
  scopes: string;
  roleClaim: string | null;
  roleMapping: OidcRoleMapping[];
  defaultRoleIds: string[];
  autoProvision: boolean;
  linkByEmail: boolean;
  localLogin: 'all' | 'admins';
  updatedAt: Date | null;
}

export const DEFAULT_OIDC_SETTINGS: OidcSettings = {
  enabled: false, label: 'Single sign-on', issuer: null, clientId: null, clientSecret: null, redirectBaseUrl: null,
  scopes: 'openid email profile', roleClaim: null, roleMapping: [], defaultRoleIds: [], autoProvision: false, linkByEmail: true,
  localLogin: 'all', updatedAt: null,
};

export async function getOidcSettings(): Promise<OidcSettings> {
  const [row] = await getDb().select().from(oidcSettings).where(eq(oidcSettings.id, 1)).limit(1);
  if (!row) return DEFAULT_OIDC_SETTINGS;
  return {
    enabled: row.enabled, label: row.label, issuer: row.issuer, clientId: row.clientId,
    clientSecret: decryptIntegrationSecret(row.clientSecretEncrypted), redirectBaseUrl: row.redirectBaseUrl, scopes: row.scopes,
    roleClaim: row.roleClaim, roleMapping: row.roleMapping, defaultRoleIds: row.defaultRoleIds, autoProvision: row.autoProvision,
    linkByEmail: row.linkByEmail, localLogin: row.localLogin === 'admins' ? 'admins' : 'all', updatedAt: row.updatedAt,
  };
}

/** What the sign-in needs is all there: the provider is usable. */
export const oidcConfigured = (s: OidcSettings): boolean => !!(s.issuer && s.clientId && s.redirectBaseUrl);

/** The settings as a browser may see them: the secret is only "set or not". */
export function publicOidcSettings(s: OidcSettings) {
  const { clientSecret, ...rest } = s;
  return { ...rest, hasClientSecret: !!clientSecret };
}

/** For the sign-in screen, anonymous: whether to show the button, and under which text. Nothing else about the provider. */
export function oidcPublicConfig(s: OidcSettings): { enabled: boolean; label: string; localLogin: 'all' | 'admins' } {
  return { enabled: s.enabled && oidcConfigured(s), label: s.label, localLogin: s.localLogin };
}

export interface OidcSettingsPatch {
  enabled?: boolean; label?: string; issuer?: string | null; clientId?: string | null; clientSecret?: string; clearClientSecret?: boolean;
  redirectBaseUrl?: string | null; scopes?: string; roleClaim?: string | null; roleMapping?: OidcRoleMapping[]; defaultRoleIds?: string[];
  autoProvision?: boolean; linkByEmail?: boolean; localLogin?: 'all' | 'admins';
}

const CLAIM_PATH = /^[A-Za-z0-9_:.\-]{1,100}$/;
const SCOPE = /^[\x21\x23-\x5b\x5d-\x7e]+$/;   // RFC 6749: no space, quote or backslash inside a scope
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Validates a PUT body against what is stored: only the keys sent change; `enabled` needs issuer, client id and redirect address. */
export async function parseOidcSettingsInput(
  body: Record<string, unknown>,
  current: OidcSettings,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ ok: true; value: OidcSettingsPatch } | { ok: false; error: string }> {
  const out: OidcSettingsPatch = {};
  const allowHttp = oidcAllowsHttp(env);
  const fail = (error: string) => ({ ok: false as const, error });
  const bool = (k: 'enabled' | 'autoProvision' | 'linkByEmail') => {
    if (body[k] === undefined) return true;
    if (typeof body[k] !== 'boolean') return false;
    out[k] = body[k] as boolean;
    return true;
  };
  for (const k of ['enabled', 'autoProvision', 'linkByEmail'] as const) if (!bool(k)) return fail(`${k} must be true or false`);

  if (body.label !== undefined) {
    if (typeof body.label !== 'string' || !body.label.trim() || body.label.length > 60) return fail('label must be 1 to 60 characters');
    out.label = body.label.trim();
  }
  for (const [k, what] of [['issuer', 'issuer'], ['redirectBaseUrl', 'redirectBaseUrl']] as const) {
    const v = body[k];
    if (v === undefined) continue;
    if (v === null || v === '') { out[k] = null; continue; }
    if (typeof v !== 'string' || v.length > 500 || !isOidcUrl(v, allowHttp)) return fail(`${what} must be an https address without credentials, query or fragment${allowHttp ? ' (http is accepted outside production, or with OIDC_ALLOW_HTTP=true)' : ''}`);
    out[k] = v;
  }
  if (body.clientId !== undefined) {
    if (body.clientId !== null && body.clientId !== '' && (typeof body.clientId !== 'string' || body.clientId.length > 300)) return fail('clientId must be text');
    out.clientId = body.clientId ? String(body.clientId) : null;
  }
  if (body.clientSecret !== undefined) {
    if (typeof body.clientSecret !== 'string' || body.clientSecret.length > 2000) return fail('clientSecret must be text');
    if (body.clientSecret) out.clientSecret = body.clientSecret;   // blank keeps the stored one
  }
  if (body.clearClientSecret !== undefined) {
    if (typeof body.clearClientSecret !== 'boolean') return fail('clearClientSecret must be true or false');
    out.clearClientSecret = body.clearClientSecret;
  }
  if (body.scopes !== undefined) {
    if (typeof body.scopes !== 'string') return fail('scopes must be text');
    const list = body.scopes.split(/\s+/).filter(Boolean);
    if (!list.includes('openid') || list.length > 20 || list.some((s) => !SCOPE.test(s) || s.length > 100)) return fail('scopes must be a space separated list that includes "openid"');
    out.scopes = [...new Set(list)].join(' ');
  }
  if (body.roleClaim !== undefined) {
    if (body.roleClaim === null || body.roleClaim === '') out.roleClaim = null;
    else if (typeof body.roleClaim !== 'string' || !CLAIM_PATH.test(body.roleClaim)) return fail('roleClaim must be a claim name or a dotted path such as realm_access.roles');
    else out.roleClaim = body.roleClaim;
  }
  if (body.localLogin !== undefined) {
    if (body.localLogin !== 'all' && body.localLogin !== 'admins') return fail('localLogin must be "all" or "admins"');
    out.localLogin = body.localLogin;
  }

  const roleIds = new Set<string>();
  if (body.roleMapping !== undefined) {
    if (!Array.isArray(body.roleMapping) || body.roleMapping.length > 100) return fail('roleMapping must be a list of at most 100 entries');
    const mapping: OidcRoleMapping[] = [];
    for (const m of body.roleMapping as unknown[]) {
      const e = m as { value?: unknown; roleId?: unknown } | null;
      if (!e || typeof e.value !== 'string' || !e.value.trim() || e.value.length > 200 || !isId(e.roleId)) return fail('each roleMapping entry needs a claim value and a role id');
      mapping.push({ value: e.value.trim(), roleId: e.roleId });
      roleIds.add(e.roleId);
    }
    out.roleMapping = mapping;
  }
  if (body.defaultRoleIds !== undefined) {
    if (!Array.isArray(body.defaultRoleIds) || body.defaultRoleIds.some((id) => !isId(id)) || body.defaultRoleIds.length > 50) return fail('defaultRoleIds must be a list of role ids');
    out.defaultRoleIds = [...new Set(body.defaultRoleIds as string[])];
    out.defaultRoleIds.forEach((id) => roleIds.add(id));
  }
  if (roleIds.size) {
    const known = new Set((await getDb().select({ id: roles.id }).from(roles)).map((r) => r.id));
    const unknown = [...roleIds].find((id) => !known.has(id));
    if (unknown) return fail(`Unknown role id: ${unknown}`);
  }

  const merged = { ...current, ...out };
  if (merged.enabled && !(merged.issuer && merged.clientId && merged.redirectBaseUrl)) return fail('issuer, clientId and redirectBaseUrl are needed to switch single sign-on on');
  if (merged.roleMapping.length > 0 && !merged.roleClaim) return fail('roleClaim is needed when there is a role mapping');
  return { ok: true, value: out };
}

export async function updateOidcSettings(patch: OidcSettingsPatch): Promise<OidcSettings> {
  const { clientSecret, clearClientSecret, ...rest } = patch;
  const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (clearClientSecret) set.clientSecretEncrypted = null;
  else if (clientSecret) set.clientSecretEncrypted = encryptIntegrationSecret(clientSecret);
  await getDb().insert(oidcSettings).values({ id: 1, ...set }).onConflictDoUpdate({ target: oidcSettings.id, set });
  return getOidcSettings();
}
