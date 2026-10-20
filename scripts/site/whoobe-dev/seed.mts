// Loads scripts/site/whoobe-dev/content.json (made by generate.mjs) into the database the DB_* / DATABASE_URL variables point to:
// the website "whoobe.dev", the header and footer snippets, the default template "Site layout" that places them, the five pages and
// a copy of the Blog pages of the website "whoobe website" (the Blog data class is shared). Idempotent: what exists is updated in place.
// Run it from packages/core so the modules resolve:   cd packages/core && npx tsx ../../scripts/site/whoobe-dev/seed.mts
// (it needs the DB_* variables of the repository's .env, or DATABASE_URL). It talks to the database directly, like the seed of the product.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listWebsites, createWebsite, updateWebsite } from '../../../packages/core/src/db/websites-records.ts';
import { listWhoobeOneSnippets, createWhoobeOneSnippet, updateWhoobeOneSnippet } from '../../../packages/core/src/db/whoobe-one-snippet-records.ts';
import { listWebsiteTemplates, createWebsiteTemplate, updateWebsiteTemplate } from '../../../packages/core/src/db/website-templates-records.ts';
import { listWhoobePages, createWhoobePage, updateWhoobePage } from '../../../packages/core/src/db/whoobe-pages-records.ts';
import { closeDb } from '../../../packages/core/src/db/client.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const c = JSON.parse(fs.readFileSync(path.join(here, 'content.json'), 'utf8'));

// website
const sites = await listWebsites();
let site = sites.find((w) => w.name === c.website.name);
if (!site) {
  site = await createWebsite({ name: c.website.name, rootPath: c.website.rootPath, domains: c.website.domains, defaultLocale: c.website.defaultLocale, supportedLocales: c.website.supportedLocales, settings: {} });
  console.log(`website created: ${site.name} (${site.rootPath})`);
} else console.log(`website exists: ${site.name} (${site.rootPath})`);

// snippets
const existingSnippets = await listWhoobeOneSnippets();
const snippetId: Record<string, string> = {};
for (const s of c.snippets) {
  const found = existingSnippets.find((x) => x.name === s.name);
  if (found) {
    await updateWhoobeOneSnippet(found.id, { name: s.name, category: s.category, icon: s.icon, node: s.node, notes: s.notes });
    snippetId[s.name] = found.id;
    console.log(`snippet updated: ${s.name}`);
  } else {
    const created = await createWhoobeOneSnippet({ name: s.name, category: s.category, icon: s.icon, node: s.node, notes: s.notes });
    snippetId[s.name] = created.id;
    console.log(`snippet created: ${s.name}`);
  }
}

// the default template: the header and the footer around every page
const layout = {
  header: { pageIds: [], snippetIds: [snippetId[c.template.headerSnippet]], className: 'w-full sticky top-0 z-40' },
  footer: { pageIds: [], snippetIds: [snippetId[c.template.footerSnippet]], className: 'w-full' },
  main: { pageIds: [], className: 'w-full' },
  body: { pageIds: [], className: 'bg-white text-slate-900 antialiased' },
};
const templates = await listWebsiteTemplates(site.id);
const tpl = templates.find((t) => t.name === c.template.name);
if (tpl) {
  await updateWebsiteTemplate(tpl.id, { description: c.template.description, layout, isDefault: true });
  console.log(`template updated: ${c.template.name}`);
} else {
  await createWebsiteTemplate({ websiteId: site.id, name: c.template.name, description: c.template.description, layout, isDefault: true });
  console.log(`template created: ${c.template.name}`);
}

// pages
const pages = await listWhoobePages(site.id);
for (const p of c.pages) {
  const found = pages.find((x) => x.slug === p.slug);
  if (found) {
    await updateWhoobePage(found.id, { title: p.title, category: p.category, kind: p.kind, content: p.content, seo: p.seo, published: true });
    console.log(`page updated: ${p.slug}`);
  } else {
    const created = await createWhoobePage({ slug: p.slug, title: p.title, category: p.category, kind: p.kind, content: p.content, seo: p.seo, websiteId: site.id });
    await updateWhoobePage(created.id, { published: true });
    console.log(`page created: ${p.slug}`);
  }
}

// the Blog pages, copied once from the old website (they bind the shared Blog data class); an existing copy is left as it is
const old = (await listWebsites()).find((w) => w.name === c.copyFromWebsite.name);
if (old) {
  const oldPages = await listWhoobePages(old.id);
  for (const slug of c.copyFromWebsite.slugs) {
    if (pages.some((x) => x.slug === slug)) { console.log(`blog page exists: ${slug}`); continue; }
    const src = oldPages.find((x) => x.slug === slug);
    if (!src) { console.log(`blog page not found in "${old.name}": ${slug}`); continue; }
    const created = await createWhoobePage({ slug: src.slug, title: src.title, category: src.category, kind: 'content', content: src.content, seo: src.seo as any, themeId: src.themeId, websiteId: site.id });
    await updateWhoobePage(created.id, { published: true });
    console.log(`blog page copied: ${slug}`);
  }
} else console.log(`website "${c.copyFromWebsite.name}" not found: the Blog pages were not copied`);

await closeDb();
