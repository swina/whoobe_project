import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { getDb, closeDb } from './client.js';
import { roles, permissions, rolePermissions, users, userRoles } from './auth-schema.js';
import { ALL_PERMISSION_KEYS, DEFAULT_ROLES, DEFAULT_ROLE_PERMISSIONS } from '../auth/permissions.js';
import { hashPassword } from '../auth/password.js';
import { getWhoobeOneKitBySlug, createWhoobeOneKit, updateWhoobeOneKitContent } from './whoobe-one-kit-records.js';
import { listWebsites, createWebsite } from './websites-records.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Compiled location is dist/db/seed.js -> packages/core/seed-data - same
// relative-to-compiled-output pattern bootstrap.ts already uses for its
// own MIGRATIONS_FOLDER.
const KITS_SEED_FOLDER = path.join(__dirname, '../../seed-data/kits');

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

/**
 * Idempotent seed: creates a default website if none exists, for single-site
 * mode. Multi-site setups can configure additional websites through the API.
 */
export async function seedDefaultWebsite(): Promise<void> {
  const existing = await listWebsites();
  if (existing.length > 0) {
    console.log('Websites already exist - skipping default website seed.');
    return;
  }
  await createWebsite({
    name: 'Default Website',
    domains: [],
    defaultLocale: 'en',
    supportedLocales: ['en'],
    settings: {},
  });
  console.log('Created default website.');
}

/**
 * Idempotent seed for apps/whoobe-one-spike's own reference "UI Kit" data -
 * whoobe-one-studio's public/kits/*.json collections, vendored here (see
 * seed-data/kits/) since a real backend seed step needs to read them off
 * its own local disk, not fetch a frontend app's static assets. Keyed by
 * each kit's own `name` (getWhoobeOneKitByName()) rather than a stable id -
 * skipped for any kit whose name already exists, whether from a previous
 * run of this seed or because a user created one themselves with the same
 * name. Runs as part of bootstrapDatabase(), same as seedDefaults() -
 * matters now that all of this editor's data is meant to live in this
 * database rather than the browser's own local IndexedDB (see apps/
 * whoobe-one-spike/README.md's Kits section for the history of that
 * pivot).
 */
export async function seedWhoobeOneKits(): Promise<void> {
  let filenames: string[];
  try {
    filenames = fs.readdirSync(KITS_SEED_FOLDER).filter((f) => f.endsWith('.json'));
  } catch {
    // no folder: the distribution ships no kit at the moment (the 5-year-old reference kits were removed, new ones are being made)
    return;
  }

  for (const filename of filenames) {
    try {
      const raw = fs.readFileSync(path.join(KITS_SEED_FOLDER, filename), 'utf8');
      const parsed = JSON.parse(raw);

      // A shipped kit is identified by its `slug` (the file's own, else the file name), not by its name: the name can be edited
      // or translated. Origin 'bundled' = read-only for the people using it; a newer `version` replaces its content here, and
      // only here, so what a user copied from it (origin 'user') is never touched.
      const slug: string = typeof parsed.slug === 'string' && parsed.slug ? parsed.slug : filename.replace(/\.json$/, '').toLowerCase();
      const version: string = parsed.version != null ? String(parsed.version) : '1';
      const category: string = typeof parsed.category === 'string' ? parsed.category : filename.replace(/-UI-Kit\.json$/, '').replace(/-/g, ' ');

      const existing = await getWhoobeOneKitBySlug(slug);
      if (existing) {
        if (existing.origin === 'bundled' && existing.version !== version) {
          await updateWhoobeOneKitContent(existing.id, { name: parsed.name, description: parsed.description || null, category, templates: parsed.templates ?? [], version });
          console.log(`Updated kit: ${parsed.name} (${version})`);
        }
        continue;
      }
      await createWhoobeOneKit({
        name: parsed.name,
        description: parsed.description || null,
        category,
        templates: parsed.templates ?? [],
        origin: 'bundled',
        version,
        slug,
      });
      console.log(`Seeded kit: ${parsed.name}`);
    } catch (err) {
      console.error(`seedWhoobeOneKits: failed to seed "${filename}":`, err);
    }
  }
}

// CLI entry point: `tsx src/db/seed.ts` (via `pnpm run db:seed`) still works
// standalone, closing the pool and exiting when run directly. Does nothing
// when this module is merely imported (e.g. by bootstrap.ts).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedDefaults()
    .then(() => seedWhoobeOneKits())
    .then(() => closeDb())
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
