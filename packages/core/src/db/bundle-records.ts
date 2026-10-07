import { inArray } from 'drizzle-orm';
import { getDb } from './client.js';
import { whoobePages } from './whoobe-pages-schema.js';
import { whoobeOneSnippets } from './whoobe-one-snippet-schema.js';
import { dataObjects } from './data-objects-schema.js';
import { themes } from './themes-schema.js';

// Lookups by a list of ids, for the website export (portability/export.ts): the ids come from a walk over the
// website's content and most of them are not ids of these tables at all, so one query per table and chunk.

const CHUNK = 500;

async function inChunks<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await run(ids.slice(i, i + CHUNK))));
  return out;
}

export async function findBundleEntitiesByIds(ids: string[]) {
  const db = getDb();
  const [pages, snippets, objects, themeRows] = await Promise.all([
    inChunks(ids, (c) => db.select().from(whoobePages).where(inArray(whoobePages.id, c))),
    inChunks(ids, (c) => db.select().from(whoobeOneSnippets).where(inArray(whoobeOneSnippets.id, c))),
    inChunks(ids, (c) => db.select().from(dataObjects).where(inArray(dataObjects.id, c))),
    inChunks(ids, (c) => db.select().from(themes).where(inArray(themes.id, c))),
  ]);
  return { pages, snippets, dataObjects: objects, themes: themeRows };
}
