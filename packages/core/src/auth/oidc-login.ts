import { randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users, userRoles } from '../db/auth-schema.js';
import { userIdentities } from '../db/oidc-schema.js';
import type { OidcSettings } from '../db/oidc-records.js';
import { hashPassword } from './password.js';
import { mapRoles, type OidcErrorCode } from './oidc-helpers.js';

// Who a verified ID token is, in Whoobe's terms (docs/plans/system/oidc-login-plan.md, "Who the person is" and "Roles").

export interface OidcIdentity {
  issuer: string;
  subject: string;
  email?: string;
  /** the provider's own statement; an unverified e-mail never links or provisions */
  emailVerified: boolean;
  name?: string;
  claims: Record<string, unknown>;
}

export type OidcResolution =
  | { ok: true; userId: string; email: string; created: boolean; linked: boolean; rolesAdded: string[]; rolesRemoved: string[] }
  | { ok: false; code: OidcErrorCode };

export async function resolveOidcUser(identity: OidcIdentity, settings: Pick<OidcSettings, 'roleClaim' | 'roleMapping' | 'defaultRoleIds' | 'autoProvision' | 'linkByEmail'>): Promise<OidcResolution> {
  const { grant, managed } = mapRoles(identity.claims, settings.roleClaim, settings.roleMapping);

  return getDb().transaction(async (tx): Promise<OidcResolution> => {
    const [known] = await tx.select().from(userIdentities)
      .where(and(eq(userIdentities.issuer, identity.issuer), eq(userIdentities.subject, identity.subject))).limit(1);

    let userId: string;
    let email: string;
    let created = false;
    let linked = false;
    let isActive = true;

    if (known) {
      const [u] = await tx.select().from(users).where(eq(users.id, known.userId)).limit(1);
      if (!u) return { ok: false, code: 'no_account' };
      userId = u.id; email = u.email; isActive = u.isActive;
    } else {
      const mail = identity.email?.trim().toLowerCase();
      if (!mail || !identity.emailVerified) return { ok: false, code: 'email_not_verified' };
      const [existing] = await tx.select().from(users).where(eq(users.email, mail)).limit(1);
      if (existing) {
        if (!settings.linkByEmail) return { ok: false, code: 'no_account' };
        userId = existing.id; email = existing.email; isActive = existing.isActive; linked = true;
      } else {
        if (!settings.autoProvision) return { ok: false, code: 'no_account' };
        // a new person with nothing granted and no default role would have no access: do not even create the account
        if (grant.length === 0 && settings.defaultRoleIds.length === 0) return { ok: false, code: 'no_access' };
        const displayName = (identity.name ?? '').trim().slice(0, 200) || mail.split('@')[0];
        // an unusable password: the person signs in through the provider (a reset link would let them choose one, which is their right)
        const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
        const [row] = await tx.insert(users).values({ email: mail, passwordHash, displayName }).returning({ id: users.id });
        userId = row.id; email = mail; created = true;
      }
    }
    if (!isActive) return { ok: false, code: 'inactive' };

    if (!known) {
      await tx.insert(userIdentities).values({ userId, issuer: identity.issuer, subject: identity.subject, email: identity.email ?? null, lastLoginAt: new Date() });
    } else {
      await tx.update(userIdentities).set({ email: identity.email ?? known.email, lastLoginAt: new Date() }).where(eq(userIdentities.id, known.id));
    }

    // roles: those the mapping manages follow the claim; the ones given by hand are left alone
    const held = new Set((await tx.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId))).map((r) => r.roleId));
    const wanted = new Set(grant);
    if (created && wanted.size === 0) settings.defaultRoleIds.forEach((id) => wanted.add(id));
    const rolesRemoved = managed.filter((id) => held.has(id) && !wanted.has(id));
    const rolesAdded = [...wanted].filter((id) => !held.has(id));
    if (rolesRemoved.length) await tx.delete(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, rolesRemoved)));
    if (rolesAdded.length) await tx.insert(userRoles).values(rolesAdded.map((roleId) => ({ userId, roleId })));

    const left = held.size - rolesRemoved.length + rolesAdded.length;
    if (left <= 0) return { ok: false, code: 'no_access' };   // (rolls nothing back on purpose: a role taken away at the provider IS taken away)
    return { ok: true, userId, email, created, linked, rolesAdded, rolesRemoved };
  });
}
