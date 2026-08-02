import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { users } from '../db/auth-schema.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  isActive: boolean;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return user ?? null;
}

export async function touchLastLogin(userId: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}
