// Loads a blog article written as Markdown with a small header (title, slug, category, author, date, tags, abstract) into the Blog data class of the
// database the DB_* / DATABASE_URL variables point to, as a DRAFT (`publish` = false: the blog shows it when the owner switches it on).
// Idempotent by slug: an existing article is updated in place, its `publish` and `cover` are kept.
// Run from packages/core:  cd packages/core && npx tsx ../../scripts/site/whoobe-dev/seed-article.mts ../../docs/plans/website/blog-conduct-release.md
import fs from 'node:fs';
import { createDataObject, updateDataObject } from '../../../packages/core/src/db/data-objects-records.ts';
import { getDb, closeDb } from '../../../packages/core/src/db/client.ts';
import { getDataClassByName } from '../../../packages/core/src/db/data-classes-records.ts';
import { dataObjects } from '../../../packages/core/src/db/data-objects-schema.ts';
import { createRequire } from 'node:module';
// drizzle-orm is a dependency of packages/core, not of scripts/: resolve it from there
const { and, eq } = createRequire(new URL('../../../packages/core/package.json', import.meta.url))('drizzle-orm');

const file = process.argv[2];
if (!file) throw new Error('usage: seed-article.mts <markdown file>');
const text = fs.readFileSync(file, 'utf8');
const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!m) throw new Error('the file needs a header between --- lines');
const head: Record<string, string> = {};
for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) head[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
for (const k of ['title', 'slug', 'category', 'author', 'date', 'tags', 'abstract']) if (!head[k]) throw new Error(`header field missing: ${k}`);
const body = m[2].trim();

const db = getDb();
const blog = await getDataClassByName('Blog');
if (!blog) throw new Error('the data class "Blog" does not exist');

const attributes = {
  slug: head.slug, title: head.title, Author: head.author, category: head.category,
  tags: head.tags.split(',').map((t) => t.trim()).filter(Boolean),
  abstract: `<p>${head.abstract}</p>`, markdown: body,
  date_published: new Date(`${head.date}T00:00:00.000Z`).toISOString(),
};
const [existing] = await db.select().from(dataObjects).where(and(eq(dataObjects.classId, blog.id), eq(dataObjects.key, head.slug))).limit(1);
if (existing) {
  const keep = existing.attributes as Record<string, unknown>;
  await updateDataObject(existing.id, { attributes: { ...attributes, publish: keep.publish ?? false, ...(keep.cover ? { cover: keep.cover } : {}) } });
  console.log(`article updated: ${head.slug} (publish = ${String(keep.publish ?? false)})`);
} else {
  const created = await createDataObject({ classId: blog.id, key: head.slug, path: '/', locale: 'en', attributes: { ...attributes, publish: false } });
  await db.update(dataObjects).set({ published: true, publishedAt: new Date() }).where(eq(dataObjects.id, created.id));
  console.log(`article created: ${head.slug} (draft: publish = false)`);
}
await closeDb();
