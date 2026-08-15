import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { mailSettings } from './mail-settings-schema.js';

export interface MailSettingsRecord {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  fromAddress: string;
  fromName: string | null;
  bccFromAddress: boolean;
  updatedAt: Date;
}

/** A single global row (docs/plans/forms/cms-forms.md's Phase 2) - `null`
 *  until an admin has saved settings once via upsertMailSettings(). */
export async function getMailSettings(): Promise<MailSettingsRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(mailSettings).limit(1);
  return row ?? null;
}

/** True upsert - the caller never needs to know whether settings already
 *  exist. Updates the single existing row if present, otherwise inserts
 *  the first one. */
export async function upsertMailSettings(input: {
  host: string;
  port: number;
  secure: boolean;
  user?: string | null;
  password?: string | null;
  fromAddress: string;
  fromName?: string | null;
  bccFromAddress?: boolean;
}): Promise<MailSettingsRecord> {
  const db = getDb();
  const existing = await getMailSettings();
  const values = {
    host: input.host,
    port: input.port,
    secure: input.secure,
    user: input.user ?? null,
    password: input.password ?? null,
    fromAddress: input.fromAddress,
    fromName: input.fromName ?? null,
    bccFromAddress: input.bccFromAddress ?? false,
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db.update(mailSettings).set(values).where(eq(mailSettings.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(mailSettings).values(values).returning();
  return row;
}
