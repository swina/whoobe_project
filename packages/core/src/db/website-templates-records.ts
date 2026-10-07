import { eq, desc, and, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { websiteTemplates, type WebsiteTemplateLayout } from './website-templates-schema.js';
import { websites } from './websites-schema.js';

export interface WebsiteTemplateRecord {
  id: string;
  websiteId: string;
  name: string;
  description: string | null;
  layout: WebsiteTemplateLayout;
  pathPatterns: string[];
  locale: string | null;
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

/** Resolves the template for a request path + the page's own locale.
 *  Priority: (1) a template whose `locale` matches the page's locale wins
 *  outright, bypassing pathPatterns entirely - not a tie-breaker among
 *  pattern matches, a locale assignment is a stronger, unconditional claim
 *  ("every page in this locale uses this template") than any path pattern
 *  can express; (2) else the template whose `path_patterns` match the path
 *  (most-specific = longest matching pattern wins); (3) else the website's
 *  default. Null when the website has no templates at all. */
export async function getWebsiteTemplateForPath(
  websiteId: string,
  path: string,
  locale?: string | null
): Promise<WebsiteTemplateRecord | null> {
  const templates = await listWebsiteTemplates(websiteId);
  if (templates.length === 0) return null;

  if (locale) {
    const localeMatch = templates.find((t) => t.locale === locale);
    if (localeMatch) return localeMatch;
  }

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
  id?: string;
  websiteId: string;
  name: string;
  description?: string | null;
  layout?: WebsiteTemplateLayout;
  pathPatterns?: string[];
  locale?: string | null;
  isDefault?: boolean;
}): Promise<WebsiteTemplateRecord> {
  const db = getDb();
  // Setting a template as default clears the website's previous default -
  // at most one default per website is an invariant, not a convention.
  if (input.isDefault) {
    await db.update(websiteTemplates).set({ isDefault: false }).where(eq(websiteTemplates.websiteId, input.websiteId));
  }
  // Same invariant, scoped to the locale: at most one template per
  // (websiteId, locale) - a second template claiming the same locale would
  // make getWebsiteTemplateForPath's locale-match ambiguous.
  if (input.locale) {
    await db.update(websiteTemplates).set({ locale: null }).where(and(eq(websiteTemplates.websiteId, input.websiteId), eq(websiteTemplates.locale, input.locale)));
  }
  const [row] = await db
    .insert(websiteTemplates)
    .values({
      ...(input.id ? { id: input.id } : {}),
      websiteId: input.websiteId,
      name: input.name,
      description: input.description ?? null,
      layout: input.layout ?? {},
      pathPatterns: input.pathPatterns ?? [],
      locale: input.locale ?? null,
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
    locale?: string | null;
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
  if (input.locale !== undefined) {
    if (input.locale) {
      // Same invariant as createWebsiteTemplate: at most one template per
      // (websiteId, locale). Excludes this row itself, so re-saving a
      // template that already owns this locale is a no-op, not a clash.
      await db.update(websiteTemplates).set({ locale: null }).where(
        and(eq(websiteTemplates.websiteId, existing.websiteId), eq(websiteTemplates.locale, input.locale), sql`${websiteTemplates.id} != ${id}`)
      );
    }
    values.locale = input.locale;
  }
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

export interface SnippetTemplateUsage {
  templateId: string;
  templateName: string;
  websiteId: string;
  websiteName: string | null;
  /** Layout slots (header, footer, ...) that list the snippet. */
  slots: string[];
}

/** Website templates whose layout slots reference this whoobe_one_snippet
 *  by id (`TemplateSlot.snippetIds`). Templates only hold the id, not a copy,
 *  so deleting a snippet that's listed here leaves a dangling reference and
 *  the slot silently renders without it. Scanned in JS rather than SQL: the
 *  ids live in nested jsonb under a handful of slot keys, and the number of
 *  templates is small. */
export async function findTemplatesUsingSnippet(snippetId: string): Promise<SnippetTemplateUsage[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: websiteTemplates.id,
      name: websiteTemplates.name,
      websiteId: websiteTemplates.websiteId,
      websiteName: websites.name,
      layout: websiteTemplates.layout,
    })
    .from(websiteTemplates)
    .leftJoin(websites, eq(websites.id, websiteTemplates.websiteId));

  const usage: SnippetTemplateUsage[] = [];
  for (const row of rows) {
    const slots = Object.entries(row.layout ?? {})
      .filter(([, slot]) => Array.isArray((slot as { snippetIds?: unknown } | null)?.snippetIds) && ((slot as { snippetIds: string[] }).snippetIds).includes(snippetId))
      .map(([key]) => key);
    if (slots.length) {
      usage.push({ templateId: row.id, templateName: row.name, websiteId: row.websiteId, websiteName: row.websiteName ?? null, slots });
    }
  }
  return usage;
}
