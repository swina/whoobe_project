import { eq, desc, and, sql } from 'drizzle-orm';
import { getDb } from './client.js';
import { websiteTemplates, type WebsiteTemplateLayout } from './website-templates-schema.js';

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
