import { eq, desc } from 'drizzle-orm';
import { getDb } from './client.js';
import { websites } from './websites-schema.js';

export interface WebsiteRecord {
  id: string;
  name: string;
  rootPath: string;
  domains: string[];
  defaultLocale: string;
  supportedLocales: string[];
  settings: Record<string, unknown> | null;
  themeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWebsites(): Promise<WebsiteRecord[]> {
  const db = getDb();
  return db.select().from(websites).orderBy(desc(websites.createdAt));
}

export async function getWebsite(id: string): Promise<WebsiteRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(websites).where(eq(websites.id, id)).limit(1);
  return row ?? null;
}

export async function getWebsiteByRootPath(rootPath: string): Promise<WebsiteRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(websites).where(eq(websites.rootPath, rootPath)).limit(1);
  return row ?? null;
}

export async function getWebsiteByDomain(domain: string): Promise<WebsiteRecord | null> {
  const db = getDb();
  const all = await db.select().from(websites);
  return all.find((w) => w.domains.includes(domain)) ?? null;
}

export async function createWebsite(input: {
  name: string;
  rootPath?: string;
  domains?: string[];
  defaultLocale?: string;
  supportedLocales?: string[];
  settings?: Record<string, unknown>;
  themeId?: string | null;
}): Promise<WebsiteRecord> {
  const db = getDb();
  const [row] = await db
    .insert(websites)
    .values({
      name: input.name,
      rootPath: input.rootPath ?? '',
      domains: input.domains ?? [],
      defaultLocale: input.defaultLocale ?? 'en',
      supportedLocales: input.supportedLocales ?? ['en'],
      settings: input.settings ?? {},
      themeId: input.themeId ?? null,
    })
    .returning();
  return row;
}

export async function updateWebsite(
  id: string,
  input: {
    name?: string;
    rootPath?: string;
    domains?: string[];
    defaultLocale?: string;
    supportedLocales?: string[];
    settings?: Record<string, unknown>;
    themeId?: string | null;
  }
): Promise<WebsiteRecord | null> {
  const db = getDb();
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) values.name = input.name;
  if (input.rootPath !== undefined) values.rootPath = input.rootPath;
  if (input.domains !== undefined) values.domains = input.domains;
  if (input.defaultLocale !== undefined) values.defaultLocale = input.defaultLocale;
  if (input.supportedLocales !== undefined) values.supportedLocales = input.supportedLocales;
  if (input.settings !== undefined) values.settings = input.settings;
  if (input.themeId !== undefined) values.themeId = input.themeId;
  const [row] = await db.update(websites).set(values).where(eq(websites.id, id)).returning();
  return row ?? null;
}

export async function deleteWebsite(id: string): Promise<void> {
  const db = getDb();
  await db.delete(websites).where(eq(websites.id, id));
}