import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { mailTemplates } from './mail-templates-schema.js';

export type MailTemplateKind = 'html' | 'text';

export interface MailTemplateRecord {
  id: string;
  name: string;
  kind: MailTemplateKind;
  description: string | null;
  subject: string | null;
  to: string | null;
  bcc: string | null;
  content: unknown | null;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Metadata for the list view - deliberately narrows the row to what the
 *  Templates tab needs (name/kind/subject/to/updated), keeping large
 *  Element trees out of the list response. */
export interface MailTemplateSummary {
  id: string;
  name: string;
  kind: MailTemplateKind;
  description: string | null;
  subject: string | null;
  to: string | null;
  bcc: string | null;
  updatedAt: Date;
}

export async function listMailTemplates(): Promise<MailTemplateSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: mailTemplates.id,
      name: mailTemplates.name,
      kind: mailTemplates.kind,
      description: mailTemplates.description,
      subject: mailTemplates.subject,
      to: mailTemplates.to,
      bcc: mailTemplates.bcc,
      updatedAt: mailTemplates.updatedAt,
    })
    .from(mailTemplates)
    .orderBy(desc(mailTemplates.updatedAt));
  return rows as MailTemplateSummary[];
}

export async function getMailTemplate(id: string): Promise<MailTemplateRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(mailTemplates).where(eq(mailTemplates.id, id)).limit(1);
  return (row as MailTemplateRecord) ?? null;
}

export async function createMailTemplate(input: {
  name: string;
  kind: MailTemplateKind;
  description?: string | null;
  subject?: string | null;
  to?: string | null;
  bcc?: string | null;
  content?: unknown | null;
  body?: string | null;
}): Promise<MailTemplateRecord> {
  const db = getDb();
  const [row] = await db
    .insert(mailTemplates)
    .values({
      name: input.name,
      kind: input.kind,
      description: input.description ?? null,
      subject: input.subject ?? null,
      to: input.to ?? null,
      bcc: input.bcc ?? null,
      content: input.kind === 'html' ? input.content ?? null : null,
      body: input.kind === 'text' ? input.body ?? null : null,
    })
    .returning();
  return row as MailTemplateRecord;
}

export async function updateMailTemplate(
  id: string,
  input: {
    name?: string;
    kind?: MailTemplateKind;
    description?: string | null;
    subject?: string | null;
    to?: string | null;
    bcc?: string | null;
    content?: unknown | null;
    body?: string | null;
  }
): Promise<MailTemplateRecord | null> {
  const db = getDb();
  const existing = await getMailTemplate(id);
  if (!existing) return null;
  // The effective kind decides which of content/body is stored; switching
  // kind clears the now-irrelevant column rather than leaving stale data.
  const kind = input.kind ?? existing.kind;
  const isHtml = kind === 'html';
  const [row] = await db
    .update(mailTemplates)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      kind,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
      ...(input.bcc !== undefined ? { bcc: input.bcc } : {}),
      ...(isHtml
        ? { content: input.content !== undefined ? input.content : existing.content, body: null }
        : { body: input.body !== undefined ? input.body : existing.body, content: null }),
      updatedAt: new Date(),
    })
    .where(eq(mailTemplates.id, id))
    .returning();
  return (row as MailTemplateRecord) ?? null;
}

export async function deleteMailTemplate(id: string): Promise<void> {
  const db = getDb();
  await db.delete(mailTemplates).where(eq(mailTemplates.id, id));
}
