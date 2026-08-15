import { eq, desc, and } from 'drizzle-orm';
import { getDb } from './client.js';
import { websiteTemplates, type WebsiteTemplateLayout } from './website-templates-schema.js';

export interface WebsiteTemplateRecord {
  id: string;
  websiteId: string;
  name: string;
  description: string | null;
  layout: WebsiteTemplateLayout;
  pathPatterns: string[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWebsiteTemplates(websiteId: string): Promise<WebsiteTemplateRecord[]> {
  const db = getDb();
  return db
    .select()
    .from(websiteTemplates)
    .where(eq(websiteTemplates.websiteId, websiteId))
    .orderBy(desc(websiteTemplates.updatedAt));
}

export async function getWebsiteTemplate(id: string): Promise<WebsiteTemplateRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(websiteTemplates).where(eq(websiteTemplates.id, id)).limit(1);
  return row ?? null;
}

export async function getDefaultWebsiteTemplate(websiteId: string): Promise<WebsiteTemplateRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(websiteTemplates)
    .where(and(eq(websiteTemplates.websiteId, websiteId), eq(websiteTemplates.isDefault, true)))
    .limit(1);
  return row ?? null;
}

/** Glob → RegExp: `*` = one path segment, `**` = any depth. */
function pathPatternToRegExp(pattern: string): RegExp {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
    .replace(/\/$/, '(/|$)');
  return new RegExp(`^${source}$`);
}

/** Resolves the template for a request path: the template whose
 *  `path_patterns` match the path (most-specific = longest matching pattern
 *  wins), falling back to the website's default. Null when the website has
 *  no templates at all. */
export async function getWebsiteTemplateForPath(websiteId: string, path: string): Promise<WebsiteTemplateRecord | null> {
  const templates = await listWebsiteTemplates(websiteId);
  if (templates.length === 0) return null;

  let best: WebsiteTemplateRecord | null = null;
  let bestLen = -1;
  for (const template of templates) {
    for (const pattern of template.pathPatterns) {
      if (pathPatternToRegExp(pattern).test(path) && pattern.length > bestLen) {
        best = template;
        bestLen = pattern.length;
      }
    }
  }
  if (best) return best;
  return templates.find((t) => t.isDefault) ?? null;
}

export async function createWebsiteTemplate(input: {
  websiteId: string;
  name: string;
  description?: string | null;
  layout?: WebsiteTemplateLayout;
  pathPatterns?: string[];
  isDefault?: boolean;
}): Promise<WebsiteTemplateRecord> {
  const db = getDb();
  // Setting a template as default clears the website's previous default -
  // at most one default per website is an invariant, not a convention.
  if (input.isDefault) {
    await db.update(websiteTemplates).set({ isDefault: false }).where(eq(websiteTemplates.websiteId, input.websiteId));
  }
  const [row] = await db
    .insert(websiteTemplates)
    .values({
      websiteId: input.websiteId,
      name: input.name,
      description: input.description ?? null,
      layout: input.layout ?? {},
      pathPatterns: input.pathPatterns ?? [],
      isDefault: input.isDefault ?? false,
    })
    .returning();
  return row;
}

export async function updateWebsiteTemplate(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    layout?: WebsiteTemplateLayout;
    pathPatterns?: string[];
    isDefault?: boolean;
  }
): Promise<WebsiteTemplateRecord | null> {
  const db = getDb();
  const existing = await getWebsiteTemplate(id);
  if (!existing) return null;

  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.description !== undefined) values.description = input.description;
  if (input.layout !== undefined) values.layout = input.layout;
  if (input.pathPatterns !== undefined) values.pathPatterns = input.pathPatterns;
  if (input.isDefault === true) {
    // Promote to default - demote the website's current one first.
    await db.update(websiteTemplates).set({ isDefault: false }).where(eq(websiteTemplates.websiteId, existing.websiteId));
    values.isDefault = true;
  } else if (input.isDefault === false) {
    values.isDefault = false;
  }

  const [row] = await db.update(websiteTemplates).set(values).where(eq(websiteTemplates.id, id)).returning();
  return row ?? null;
}

export async function deleteWebsiteTemplate(id: string): Promise<void> {
  const db = getDb();
  await db.delete(websiteTemplates).where(eq(websiteTemplates.id, id));
}
