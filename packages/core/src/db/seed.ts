import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { getDb, closeDb } from './client.js';
import { roles, permissions, rolePermissions, users, userRoles } from './auth-schema.js';
import { ALL_PERMISSION_KEYS, DEFAULT_ROLES, DEFAULT_ROLE_PERMISSIONS } from '../auth/permissions.js';
import { hashPassword } from '../auth/password.js';

/**
 * Idempotent seed: default roles + permissions + role->permission mapping,
 * and a first admin user if none exists yet. Safe to run repeatedly.
 *
 * Admin credentials come from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD env
 * vars. If SEED_ADMIN_PASSWORD isn't set, a random one is generated and
 * printed once - nothing is ever hardcoded into source.
 *
 * Leaves the shared DB pool open (does not call closeDb()) - this runs as
 * part of a long-running server's boot sequence (see bootstrap.ts), not
 * only as a one-shot script.
 */
export async function seedDefaults(): Promise<void> {
  const db = getDb();

  const permissionIdByKey = new Map<string, string>();
  for (const key of ALL_PERMISSION_KEYS) {
    const [existing] = await db.select().from(permissions).where(eq(permissions.key, key)).limit(1);
    if (existing) {
      permissionIdByKey.set(key, existing.id);
      continue;
    }
    const [created] = await db.insert(permissions).values({ key }).returning();
    permissionIdByKey.set(key, created.id);
    console.log(`Created permission: ${key}`);
  }

  const roleIdByName = new Map<string, string>();
  for (const name of DEFAULT_ROLES) {
    const [existing] = await db.select().from(roles).where(eq(roles.name, name)).limit(1);
    if (existing) {
      roleIdByName.set(name, existing.id);
      continue;
    }
    const [created] = await db.insert(roles).values({ name }).returning();
    roleIdByName.set(name, created.id);
    console.log(`Created role: ${name}`);
  }

  for (const roleName of DEFAULT_ROLES) {
    const roleId = roleIdByName.get(roleName)!;
    const existingLinks = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    const linkedPermissionIds = new Set(existingLinks.map((r) => r.permissionId));

    for (const permKey of DEFAULT_ROLE_PERMISSIONS[roleName]) {
      const permissionId = permissionIdByKey.get(permKey)!;
      if (!linkedPermissionIds.has(permissionId)) {
        await db.insert(rolePermissions).values({ roleId, permissionId });
        linkedPermissionIds.add(permissionId);
      }
    }
  }

  const [anyAdmin] = await db.select().from(users).limit(1);
  if (!anyAdmin) {
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString('base64url');
    const passwordHash = await hashPassword(password);

    const [createdUser] = await db
      .insert(users)
      .values({ email, passwordHash, displayName: 'Administrator' })
      .returning();

    const adminRoleId = roleIdByName.get('admin')!;
    await db.insert(userRoles).values({ userId: createdUser.id, roleId: adminRoleId });

    console.log('\n=== Seeded first admin user ===');
    console.log(`Email:    ${email}`);
    if (!process.env.SEED_ADMIN_PASSWORD) {
      console.log(`Password: ${password}  (generated - store this now, it will not be shown again)`);
    } else {
      console.log('Password: (from SEED_ADMIN_PASSWORD env var)');
    }
    console.log('================================\n');
  } else {
    console.log('Users already exist - skipping admin seed.');
  }
}

// CLI entry point: `tsx src/db/seed.ts` (via `pnpm run db:seed`) still works
// standalone, closing the pool and exiting when run directly. Does nothing
// when this module is merely imported (e.g. by bootstrap.ts).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedDefaults()
    .then(() => closeDb())
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
